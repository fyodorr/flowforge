const should = require('should') // eslint-disable-line
const setup = require('../setup')

describe('AccessToken controller', function () {
    // Use standard test data.
    let app
    /** @type {import('../../../../../forge/db/controllers/AccessToken') */
    let AccessTokenController
    const TestObjects = {}

    beforeEach(async function () {
        app = await setup()
        AccessTokenController = app.db.controllers.AccessToken
        TestObjects.alice = await app.db.models.User.byUsername('alice')
    })

    afterEach(async function () {
        await app.close()
    })

    describe('Project Tokens', function () {
        it('creates a token for a project', async function () {
            const team = await app.db.models.Team.byName('ATeam')
            const project = await app.db.models.Project.create({ name: 'project', type: '', url: '' })
            await team.addProject(project)

            ;(await app.db.models.AccessToken.count()).should.equal(0)
            const result = await app.db.controllers.AccessToken.createTokenForProject(project, Date.now() + 5000, 'test:scope')
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            result.should.have.property('token')

            const token = await app.db.controllers.AccessToken.getOrExpire(result.token)
            should.exist(token)
            token.should.have.property('scope', ['test:scope'])
            token.should.have.property('ownerId', project.id)
            token.should.have.property('ownerType', 'project')
        })

        it('replaces a token for a project', async function () {
            const team = await app.db.models.Team.byName('ATeam')
            const project = await app.db.models.Project.create({ name: 'project', type: '', url: '' })
            await team.addProject(project)

            // Setup the inital token
            ;(await app.db.models.AccessToken.count()).should.equal(0)
            const result = await app.db.controllers.AccessToken.createTokenForProject(project, Date.now() + 5000, 'test:scope')
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            result.should.have.property('token')

            // Renew the token
            const renewResult = await app.db.controllers.AccessToken.createTokenForProject(project, Date.now() + 5000, 'test:scope')
            // Check we don't have two tokens in the database
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            renewResult.should.have.property('token')

            result.token.should.not.equal(renewResult.token)
            should.not.exist(await app.db.controllers.AccessToken.getOrExpire(result.token))

            const token = await app.db.controllers.AccessToken.getOrExpire(renewResult.token)
            should.exist(token)
            token.should.have.property('scope', ['test:scope'])
            token.should.have.property('ownerId', project.id)
            token.should.have.property('ownerType', 'project')
        })
    })

    describe('Device Provisioning Tokens', function () {
        it('creates a provisioning token for a team', async function () {
            const team = await app.db.models.Team.byName('ATeam')

            ;(await app.db.models.AccessToken.count()).should.equal(0)
            const result = await AccessTokenController.createTokenForTeamDeviceProvisioning('Provisioning Token 1', team, null, Date.now() + 5000)
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            result.should.have.property('token')

            const token = await AccessTokenController.getOrExpire(result.token)
            should.exist(token)
            token.should.have.property('scope', ['device:provision', 'name:Provisioning Token 1'])
            token.should.have.property('ownerId', '' + team.id)
            token.should.have.property('ownerType', 'team')
            token.should.have.property('id') // AccessToken table now has an id column
        })

        it('creates a provisioning token for a teams project', async function () {
            const team = await app.db.models.Team.byName('ATeam')
            const project = await app.db.models.Project.create({ name: 'project', type: '', url: '' })
            await team.addProject(project)

            ;(await app.db.models.AccessToken.count()).should.equal(0)
            const result = await AccessTokenController.createTokenForTeamDeviceProvisioning('Provisioning Token 2', team, project, Date.now() + 5000)
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            result.should.have.property('token')

            const token = await AccessTokenController.getOrExpire(result.token)
            should.exist(token)
            token.should.have.property('scope', ['device:provision', 'name:Provisioning Token 2', 'project:' + project.id])
            token.should.have.property('ownerId', '' + team.id)
            token.should.have.property('ownerType', 'team')
            token.should.have.property('id') // AccessToken table now has an id column
        })

        it('edits a provisioning token to set the project', async function () {
            const team = await app.db.models.Team.byName('ATeam')
            const project = await app.db.models.Project.create({ name: 'project', type: '', url: '' })
            await team.addProject(project)

            ;(await app.db.models.AccessToken.count()).should.equal(0)
            const result = await AccessTokenController.createTokenForTeamDeviceProvisioning('Provisioning Token', team, null, Date.now() + 5000)
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            result.should.have.property('token')

            const token = await AccessTokenController.getOrExpire(result.token)
            should.exist(token)
            token.should.have.property('scope', ['device:provision', 'name:Provisioning Token'])

            await AccessTokenController.updateTokenForTeamDeviceProvisioning(token, project) // update the token to have a project
            ;(await app.db.models.AccessToken.count()).should.equal(1) // should still have only 1 token
            const editedToken = await AccessTokenController.getOrExpire(result.token)
            should.exist(editedToken)
            editedToken.should.have.property('scope', ['device:provision', 'name:Provisioning Token', 'project:' + project.id])
        })

        it('edits a provisioning token to remove the project', async function () {
            const team = await app.db.models.Team.byName('ATeam')
            const project = await app.db.models.Project.create({ name: 'project', type: '', url: '' })
            await team.addProject(project)

            ;(await app.db.models.AccessToken.count()).should.equal(0)
            const result = await AccessTokenController.createTokenForTeamDeviceProvisioning('Provisioning Token', team, project, Date.now() + 5000)
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            result.should.have.property('token')

            const token = await AccessTokenController.getOrExpire(result.token)
            should.exist(token)
            token.should.have.property('scope', ['device:provision', 'name:Provisioning Token', 'project:' + project.id])

            await AccessTokenController.updateTokenForTeamDeviceProvisioning(token, null) // update the token to have a project
            ;(await app.db.models.AccessToken.count()).should.equal(1) // should still have only 1 token
            const editedToken = await AccessTokenController.getOrExpire(result.token)
            should.exist(editedToken)
            editedToken.should.have.property('scope', ['device:provision', 'name:Provisioning Token'])
        })
    })

    describe('User Tokens', function () {
        it('creates a token for a user - id only', async function () {
            const result = await app.db.controllers.AccessToken.createTokenForUser(
                TestObjects.alice.id,
                null,
                ['test:scope']
            )
            result.should.have.property('token')
            should.not.exist(result.expiresAt)
            should.not.exist(result.refreshToken)
        })
        it('creates a token for a user - full object', async function () {
            const result = await app.db.controllers.AccessToken.createTokenForUser(
                TestObjects.alice,
                null,
                ['test:scope']
            )
            result.should.have.property('token')
            should.not.exist(result.expiresAt)
            should.not.exist(result.refreshToken)
        })
        it('creates a token for a user with refresh token', async function () {
            const result = await app.db.controllers.AccessToken.createTokenForUser(
                TestObjects.alice,
                null,
                ['test:scope'],
                true
            )
            result.should.have.property('token')
            should.exist(result.expiresAt)
            should.exist(result.refreshToken)
        })

        it('refreshes a valid token', async function () {
            // Create token
            ;(await app.db.models.AccessToken.count()).should.equal(0)
            const original = await app.db.controllers.AccessToken.createTokenForUser(
                TestObjects.alice,
                null,
                ['test:scope'],
                true
            )
            ;(await app.db.models.AccessToken.count()).should.equal(1)

            const refreshResult = await app.db.controllers.AccessToken.refreshToken(original.refreshToken)
            should.exist(refreshResult.token)
            refreshResult.token.should.not.equal(original.token)
            should.exist(refreshResult.refreshToken)
            refreshResult.refreshToken.should.not.equal(original.refreshToken)
            should.exist(refreshResult.expiresAt)
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            should.not.exist(await app.db.controllers.AccessToken.getOrExpire(original.token))
        })
    })

    describe('getOrExpire', function () {
        it('does not return expired tokens', async function () {
            const team = await app.db.models.Team.byName('ATeam')
            const project = await app.db.models.Project.create({ name: 'project', type: '', url: '' })
            await team.addProject(project)

            ;(await app.db.models.AccessToken.count()).should.equal(0)
            // Create the token with an already-expired time
            const result = await app.db.controllers.AccessToken.createTokenForProject(project, Date.now() - 5000, 'test:scope')
            ;(await app.db.models.AccessToken.count()).should.equal(1)
            should.not.exist(await app.db.controllers.AccessToken.getOrExpire(result.token))
        })
    })

    describe('destroyToken', function () {
        it('removes token', async function () {
            const team = await app.db.models.Team.byName('ATeam')
            const project = await app.db.models.Project.create({ name: 'project', type: '', url: '' })
            await team.addProject(project)

            ;(await app.db.models.AccessToken.count()).should.equal(0)
            const result = await app.db.controllers.AccessToken.createTokenForProject(project, Date.now() + 5000, 'test:scope')
            ;(await app.db.models.AccessToken.count()).should.equal(1)

            // Now destroy the token
            await app.db.controllers.AccessToken.destroyToken(result.token)
            ;(await app.db.models.AccessToken.count()).should.equal(0)
        })
    })
})
