<template>
    <div v-if="subscription?.customer?.balance < 0" class="ff-banner ff-banner-info mb-3" data-el="credit-balance-banner">
        You have a credit balance of {{ formatCurrency(Math.abs(subscription.customer.balance)) }} that will be applied to the next invoice.
    </div>
    <SectionTopMenu hero="Team Billing">
        <template #tools>
            <ff-button v-if="subscription" size="small" @click="customerPortal()">
                <template #icon-right><ExternalLinkIcon /></template>
                Stripe Customer Portal
            </ff-button>
        </template>
    </SectionTopMenu>
    <form class="pt-4">
        <Loading v-if="loading" size="small" />
        <div v-else-if="billingSetUp">
            <FormHeading v-if="trialMode" class="mb-6">Trial Ends:  <span class="font-normal">{{ formatDate(team.billing.trialEndsAt) }}</span></FormHeading>
            <FormHeading class="mb-6">Next Payment: <span v-if="subscription && !subscriptionExpired" class="font-normal">{{ formatDate(subscription.next_billing_date) }}</span></FormHeading>
            <div v-if="subscriptionExpired" class="ff-no-data ff-no-data-large">
                Your subscription has expired. Please renew it to continue using FlowForge.

                <ff-button data-action="renew-subscription" class="mx-auto mt-3" @click="setupBilling()">
                    <template #icon-right><ExternalLinkIcon /></template>
                    Renew Subscription
                </ff-button>
            </div>
            <div v-else-if="subscription">
                <ff-data-table :columns="columns" :rows="subscription.items" />
                <div v-if="hasTrialProject" class="text-gray-400 mt-1 pl-2 text-sm">Your trial instance will be automatically added to your subscription when the trial ends</div>
            </div>
            <div v-else class="ff-no-data ff-no-data-large">
                Something went wrong loading your subscription information, please try again.
            </div>
        </div>
        <div v-else class="ff-no-data ff-no-data-large">
            <div v-if="trialMode">
                You are currently in a free trial. During the trial you can only create one application instance in the team.
                To unlock other features you will need to configure your billing details.
            </div>
            <div v-else>
                Billing has not yet been configured for this team. Before proceeding further, you must continue to Stripe and complete this.
            </div>
            <div v-if="coupon">
                <div class="my-3 text-sm">Will apply coupon code <strong>{{ coupon }}</strong> at checkout</div>
            </div>
            <div v-else-if="errors.coupon">
                <div class="my-3 text-red-400">{{ errors.coupon }}</div>
            </div>
            <div class="mt-6">
                <ff-button data-action="setup-payment-details" class="mx-auto mt-3" @click="setupBilling()">
                    <template #icon-right><ExternalLinkIcon /></template>
                    Setup Payment Details
                </ff-button>
            </div>
        </div>
    </form>
</template>

<script>

import { ExternalLinkIcon } from '@heroicons/vue/outline'
import { markRaw } from 'vue'

import billingApi from '@/api/billing.js'

import FormHeading from '@/components/FormHeading'
import Loading from '@/components/Loading'
import SectionTopMenu from '@/components/SectionTopMenu'
import formatCurrency from '@/mixins/Currency.js'
import formatDateMixin from '@/mixins/DateTime.js'
import Alerts from '@/services/alerts'

const priceCell = {
    name: 'PriceCell',
    props: ['price'],
    mixins: [formatCurrency],
    computed: {
        formattedPrice: function () {
            return this.formatCurrency(this.price)
        }
    },
    template: '<div>{{ formattedPrice }}</div>'
}

const totalPriceCell = {
    name: 'PriceCell',
    props: ['total_price'],
    mixins: [formatCurrency],
    computed: {
        formattedPrice: function () {
            return this.formatCurrency(this.total_price)
        }
    },
    template: '<div>{{ formattedPrice }}</div>'
}

export default {
    name: 'TeamBilling',
    components: {
        Loading,
        FormHeading,
        ExternalLinkIcon,
        SectionTopMenu
    },
    mixins: [formatDateMixin, formatCurrency],
    props: ['billingUrl', 'team', 'teamMembership'],
    data () {
        return {
            loading: false,
            subscription: null,
            columns: [{
                name: 'label',
                key: 'name',
                sortable: true
            }, {
                label: 'Quantity',
                key: 'quantity',
                sortable: true
            }, {
                label: 'Unit Price (US$)',
                key: 'price',
                sortable: true,
                component: {
                    is: markRaw(priceCell)
                }
            }, {
                label: 'Total Price (US$)',
                key: 'total_price',
                sortable: true,
                component: {
                    is: markRaw(totalPriceCell)
                }
            }],
            coupon: false,
            errors: {}
        }
    },
    computed: {
        billingSetUp () {
            return this.team.billing?.active
        },
        subscriptionExpired () {
            return this.team.billing?.canceled
        },
        trialMode () {
            return this.team.billing?.trial
        },
        hasTrialProject () {
            // Infer that if they cannot create a trial project, they must already have one.
            return this.trialMode && !this.team.billing.trialProjectAllowed
        }
    },
    watch: { },
    async mounted () {
        if (!this.billingSetUp) {
            this.coupon = this.getCookie('ff_coupon')?.split('.')[0]
            return
        }

        this.loading = true
        const billingSubscription = await billingApi.getSubscriptionInfo(this.team.id)
        billingSubscription.next_billing_date = billingSubscription.next_billing_date * 1000 // API returns Seconds, JS expects miliseconds
        this.subscription = billingSubscription
        this.subscription.items.map((item) => {
            item.total_price = item.price * item.quantity
            return item
        })
        if (this.trialMode) {
            if (this.hasTrialProject) {
                this.subscription.items.push({
                    name: 'Trial Project',
                    quantity: 1,
                    price: 0,
                    total_price: 0
                })
            }
        }
        this.loading = false
    },
    methods: {
        customerPortal () {
            billingApi.toCustomerPortal(this.team.id)
        },
        async setupBilling () {
            let billingUrl = this.$route.query.billingUrl
            if (!billingUrl) {
                try {
                    const response = await billingApi.createSubscription(this.team.id)
                    billingUrl = response.billingURL
                } catch (err) {
                    if (err.response.data.code === 'invalid_coupon') {
                        Alerts.emit(`${this.coupon} coupon invalid`, 'warning', 7500)
                        this.errors.coupon = `${this.coupon} is not a valid code. You will be able to provide an alternative code on the Stripe checkout page.`
                        this.coupon = false
                    } else {
                        throw err
                    }
                }
            }
            window.open(billingUrl, '_self')
        },
        getCookie (name) {
            if (document.cookie) {
                const cookies = document.cookie.split(';')
                for (let i = 0; i < cookies.length; i++) {
                    const cookie = cookies[i]
                    if (cookie.split('=')[0].trim() === name) {
                        return cookie.split('=')[1]
                    }
                }
            }
            return undefined
        }
    }
}
</script>
