module.exports.init = async function (app) {
    // Set the billing feature flag
    app.config.features.register('billing', true, true)

    const { KEY_BILLING_STATE } = require('../../../db/models/ProjectSettings')
    const BILLING_STATES = app.db.models.ProjectSettings.BILLING_STATES
    const ONE_DAY = 86400000

    const stripe = require('stripe')(app.config.billing.stripe.key)

    app.housekeeper.registerTask({
        name: 'teamTrialManager',
        startup: false,
        schedule: '0,30  *  *  *  *',
        run: require('./trialTask').init(app)
    })

    app.postoffice.registerTemplate('TrialTeamCreated', require('./emailTemplates/TrialTeamCreated'))
    app.postoffice.registerTemplate('TrialTeamSuspended', require('./emailTemplates/TrialTeamSuspended'))
    app.postoffice.registerTemplate('TrialTeamEnded', require('./emailTemplates/TrialTeamEnded'))
    app.postoffice.registerTemplate('TrialTeamReminder', require('./emailTemplates/TrialTeamReminder'))

    /**
     * Get the Stripe product/price ids for the given team.
     *
     * These are provided via flowforge.yml.
     *  - billing.stripe.team_* provide the default values.
     *  - billing.stripe.teams.<type-name>.* provide type-specific values
     *
     * Example flowforge.yml config:
     *   billing:
     *     stripe:
     *       ...
     *       team_price: <default team price>
     *       team_product: <default team product>
     *       device_price: <default device price>
     *       device_product: <default device product>
     *       ...
     *       teams:
     *         starter:
     *           price: <starter team price>
     *           product: <starter team product>
     *
     * @param {Team} team The team object to get the billing ids for
     * @returns Object containing `price` and `product` properties
     */
    function getBillingIdsForTeam (team) {
        const result = {
            price: app.config.billing.stripe.team_price,
            product: app.config.billing.stripe.team_product,
            device: {
                price: app.config.billing.stripe.device_price,
                product: app.config.billing.stripe.device_product
            }
        }
        if (app.config.billing.stripe.teams?.[team.TeamType.name]) {
            result.price = app.config.billing.stripe.teams[team.TeamType.name].price || result.price
            result.product = app.config.billing.stripe.teams[team.TeamType.name].product || result.product
        }
        return result
    }

    async function setProjectBillingState (project, state) {
        if (!Object.values(BILLING_STATES).includes(state)) {
            throw new Error(`Unsupported project billing state ${state}`)
        }
        return await project.updateSetting(KEY_BILLING_STATE, state)
    }

    async function getProjectBillingState (project) {
        return await project.getSetting(KEY_BILLING_STATE)
    }

    return {
        createSubscriptionSession: async (team, coupon = null, user = null) => {
            const billingIds = getBillingIdsForTeam(team)

            const sub = {
                mode: 'subscription',
                line_items: [{
                    price: billingIds.price,
                    quantity: 1
                }],
                subscription_data: {
                    metadata: {
                        team: team.hashid
                    }
                },
                tax_id_collection: {
                    enabled: true
                },
                custom_text: {
                    submit: {
                        message: 'This sets up your team for billing. You are only charged when creating a Project.'
                    }
                },
                client_reference_id: team.hashid,
                payment_method_types: ['card'],
                success_url: `${app.config.base_url}/team/${team.slug}/overview?billing_session={CHECKOUT_SESSION_ID}`,
                cancel_url: `${app.config.base_url}/team/${team.slug}/overview`
            }

            // Use existing Stripe customer
            const existingLocalSubscription = await app.db.models.Subscription.byTeamId(team.id)
            if (existingLocalSubscription?.customer) {
                sub.customer = existingLocalSubscription.customer

                // Required for tax_id_collection
                sub.customer_update = {
                    name: 'auto'
                }
            }

            // Apply a USER provided coupon
            if (coupon) {
                sub.discounts = [
                    {
                        promotion_code: coupon
                    }
                ]
            } else {
                sub.allow_promotion_codes = true
            }

            // Set the flag to enable a free trial
            if (app.db.controllers.Subscription.freeTrialCreditEnabled() && user) {
                const newTeamAlreadyCreated = true // team is created before this step
                const eligibleForTrial = await app.db.controllers.Subscription.userEligibleForFreeTrialCredit(user, newTeamAlreadyCreated)

                if (eligibleForTrial) {
                    app.log.info(`User ${user.name} (${user.username}) is eligible for a free trial, set the flag in the subscription metadata.`)
                }

                sub.subscription_data.metadata.free_trial = eligibleForTrial
            }

            const session = await stripe.checkout.sessions.create(sub)
            app.log.info(`Creating Subscription for team ${team.hashid}`)
            return session
        },

        addProject: async (team, project) => {
            if (await getProjectBillingState(project) === BILLING_STATES.BILLED) {
                app.log.info(`Project ${project.id} is already marked billed, skipping adding it to Subscription for team ${team.hashid}`)
                return
            }

            let projectProduct = app.config.billing.stripe.project_product
            let projectPrice = app.config.billing.stripe.project_price
            const projectType = await project.getProjectType()
            if (projectType) {
                if (projectType.properties.billingProductId) {
                    projectProduct = projectType.properties.billingProductId
                }
                if (projectType.properties.billingPriceId) {
                    projectPrice = projectType.properties.billingPriceId
                }
            }

            const subscription = await app.db.models.Subscription.byTeamId(team.id)

            const existingSub = await stripe.subscriptions.retrieve(subscription.subscription)
            const subItems = existingSub.items

            let projectItem = false
            subItems.data.forEach(item => {
                if (item.plan.product === projectProduct) {
                    projectItem = item
                }
            })

            app.log.info(`Adding Project ${project.id} to Subscription for team ${team.hashid}`)

            if (projectItem) {
                const metadata = existingSub.metadata ? existingSub.metadata : {}
                // console.log('updating metadata', metadata)
                metadata[project.id] = 'true'
                // console.log(metadata)
                const update = {
                    quantity: projectItem.quantity + 1,
                    proration_behavior: 'always_invoice'
                }
                // TODO update meta data?
                try {
                    await setProjectBillingState(project, BILLING_STATES.BILLED)
                    await stripe.subscriptionItems.update(projectItem.id, update)
                    await stripe.subscriptions.update(subscription.subscription, {
                        metadata
                    })
                } catch (error) {
                    await setProjectBillingState(project, BILLING_STATES.NOT_BILLED)
                    app.log.warn(`Problem adding project to subscription\n${error.message}`)
                }
            } else {
                const metadata = {}
                metadata[project.id] = 'true'
                // metadata[team] = team.hashid
                const update = {
                    items: [{
                        price: projectPrice,
                        quantity: 1
                    }],
                    metadata
                }
                try {
                    await setProjectBillingState(project, BILLING_STATES.BILLED)
                    await stripe.subscriptions.update(subscription.subscription, update)
                } catch (error) {
                    await setProjectBillingState(project, BILLING_STATES.NOT_BILLED)
                    app.log.warn(`Problem adding first project to subscription\n${error.message}`)
                    throw error
                }
            }
        },

        removeProject: async (team, project) => {
            if (await getProjectBillingState(project) === BILLING_STATES.NOT_BILLED) {
                app.log.info(`Project ${project.id} is already marked non-billed, skipping removing from Subscription for team ${team.hashid}`)
                return
            }

            let projectProduct = app.config.billing.stripe.project_product
            const projectType = await project.getProjectType()
            if (projectType) {
                if (projectType.properties.billingProductId) {
                    projectProduct = projectType.properties.billingProductId
                }
            }

            const subscription = await app.db.models.Subscription.byTeamId(team.id)

            const existingSub = await stripe.subscriptions.retrieve(subscription.subscription)
            const subItems = existingSub.items

            let projectItem = false
            subItems.data.forEach(item => {
                if (item.plan.product === projectProduct) {
                    projectItem = item
                }
            })

            app.log.info(`Removing Project ${project.id} to Subscription for team ${team.hashid}`)

            if (projectItem) {
                const metadata = existingSub.metadata ? existingSub.metadata : {}
                metadata[project.id] = ''
                const newQuantity = projectItem.quantity > 0 ? projectItem.quantity - 1 : 0
                const update = {
                    quantity: newQuantity
                }
                if (projectItem.quantity === 1) {
                    update.proration_behavior = 'always_invoice'
                }

                try {
                    await setProjectBillingState(project, BILLING_STATES.NOT_BILLED)
                    await stripe.subscriptionItems.update(projectItem.id, update)
                    await stripe.subscriptions.update(subscription.subscription, {
                        metadata
                    })
                } catch (err) {
                    await setProjectBillingState(project, BILLING_STATES.BILLED)
                    app.log.warn(`failed removing project from subscription\n${err.message}`)
                    throw err
                }
            } else {
                // not found?
                app.log.warn('Project not found in Subscription, possible Grandfathered in')
            }
        },

        updateTeamMemberCount: async (team) => {
            const billingIds = getBillingIdsForTeam(team)

            const subscription = await app.db.models.Subscription.byTeamId(team.id)
            if (subscription && subscription.isActive()) {
                const existingSub = await stripe.subscriptions.retrieve(subscription.subscription)
                const subItems = existingSub.items

                const teamItem = subItems.data.find(item => item.plan.product === billingIds.product)

                const memberCount = await team.memberCount()

                if (teamItem.quantity !== memberCount) {
                    app.log.info(`Updating team ${team.hashid} subscription member count to ${memberCount}`)
                    const update = {
                        quantity: memberCount,
                        proration_behavior: 'always_invoice'
                    }
                    try {
                        await stripe.subscriptionItems.update(teamItem.id, update)
                    } catch (error) {
                        app.log.warn(`Problem updating team ${team.hashid} subscription: ${error.message}`)
                    }
                } else {
                    app.log.info(`Team ${team.hashid} subscription member count up to date`)
                }
            }
        },

        updateTeamDeviceCount: async (team) => {
            const billingIds = getBillingIdsForTeam(team)
            if (!billingIds.device.product) {
                return
            }
            const subscription = await app.db.models.Subscription.byTeamId(team.id)
            if (subscription && subscription.isActive()) {
                const deviceCount = await team.deviceCount()
                const deviceFreeAllocation = team.TeamType.getProperty('deviceFreeAllocation') || 0
                const billableCount = Math.max(0, deviceCount - deviceFreeAllocation)
                const existingSub = await stripe.subscriptions.retrieve(subscription.subscription)
                const subItems = existingSub.items
                const deviceItem = subItems.data.find(item => item.plan.product === billingIds.device.product)
                if (deviceItem) {
                    if (deviceItem.quantity !== billableCount) {
                        app.log.info(`Updating team ${team.hashid} subscription device count to ${billableCount}`)
                        const update = {
                            quantity: billableCount,
                            proration_behavior: 'always_invoice'
                        }
                        try {
                            await stripe.subscriptionItems.update(deviceItem.id, update)
                        } catch (error) {
                            app.log.warn(`Problem updating team ${team.hashid} subscription: ${error.message}`)
                        }
                    }
                } else if (billableCount > 0) {
                    // Need to add the device item to the subscription
                    const update = {
                        items: [{
                            price: billingIds.device.price,
                            quantity: billableCount
                        }]
                    }
                    try {
                        app.log.info(update)
                        await stripe.subscriptions.update(subscription.subscription, update)
                    } catch (error) {
                        console.log(error)
                        app.log.warn(`Problem adding first device to subscription\n${error.message}`)
                        throw error
                    }
                }
            }
        },

        closeSubscription: async (subscription) => {
            app.log.info(`Closing subscription for team ${subscription.Team.hashid}`)

            await stripe.subscriptions.del(subscription.subscription, {
                invoice_now: true,
                prorate: true
            })
            subscription.status = app.db.models.Subscription.STATUS.CANCELED
            await subscription.save()
        },

        setupTrialTeamSubscription: async (team, user) => {
            // teamTrialDuration: number of days the trial should run for
            const teamTrialDuration = parseInt(app.settings.get('user:team:trial-mode:duration'))
            const teamTrialProjectTypeId = app.settings.get('user:team:trial-mode:projectType')
            if (teamTrialDuration && teamTrialProjectTypeId) {
                const trialProjectType = await app.db.models.ProjectType.byId(teamTrialProjectTypeId)
                await app.db.controllers.Subscription.createTrialSubscription(
                    team,
                    Date.now() + teamTrialDuration * ONE_DAY
                )
                await app.postoffice.send(
                    user,
                    'TrialTeamCreated',
                    {
                        username: user.name,
                        teamName: team.name,
                        trialDuration: teamTrialDuration,
                        trialProjectTypeName: trialProjectType.name
                    }
                )
            }
        },

        /**
         * Check to see if the team is allowed to create a project of the given type
         * @param {*} team
         * @param {*} projectType
         * @returns boolean - whether the project can be created
         */
        isProjectCreateAllowed: async (team, projectType) => {
            const subscription = await app.db.models.Subscription.byTeamId(team.id)
            if (!subscription) {
                // No billing subscription - not allowed to create anything
                return false
            }

            if (subscription.isActive()) {
                // Billing setup, allowed to create projects
                return true
            }

            if (subscription.isTrial()) {
                // Trial mode
                if (subscription.isTrialEnded()) {
                    // Nothing can be created if the trial has ended
                    return false
                }
                if (projectType.hashid !== app.settings.get('user:team:trial-mode:projectType')) {
                    // Not the nominated trial project type
                    return false
                }
                const existingProjectCount = await team.projectCount(projectType.id)
                if (existingProjectCount === 0) {
                    return true
                }
            }

            return false
        },

        /**
         * Checks to see if the team is allowed to unsuspend a project.
         * @param {*} team
         * @param {*} project
         * @returns boolean - whether the project can be unsuspended
         */
        isProjectStartAllowed: async (team, project) => {
            const subscription = await app.db.models.Subscription.byTeamId(team.id)
            if (subscription && subscription.isActive()) {
                return true
            }

            if (subscription.isTrial()) {
                if (subscription.isTrialEnded()) {
                    // Cannot resume if trial mode has ended
                    return false
                }
            }

            return true
        },

        /**
         * Sets the billing_state setting on the project if it is a trial mode project
         * This ensures it doesn't get added to billing when created
         * @param {*} team
         * @param {*} project
         */
        initialiseProjectBillingState: async (team, project) => {
            // Only needed if trial-mode is enabled
            if (!app.settings.get('user:team:trial-mode')) {
                return
            }

            const subscription = await app.db.models.Subscription.byTeamId(team.id)
            if (subscription.isTrial() && !subscription.isTrialEnded()) {
                // Check the project is eligable for trial mode
                if (project.ProjectType.hashid === app.settings.get('user:team:trial-mode:projectType')) {
                    // Check this is the only project of this type in the team
                    const existingProjectCount = await team.projectCount(project.ProjectTypeId)
                    if (existingProjectCount === 1) {
                        await setProjectBillingState(project, BILLING_STATES.TRIAL)
                    }
                }
            }
        },
        getProjectBillingState,
        setProjectBillingState
    }
}
