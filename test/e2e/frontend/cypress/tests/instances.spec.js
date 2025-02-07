/**
 * This file is currently naively copied from the projects test coverage
 * As such some tests may be out of date
 */
describe('FlowForge - Instances', () => {
    function navigateToInstance (teamName, projectName) {
        cy.request('GET', '/api/v1/user/teams')
            .then((response) => {
                const team = response.body.teams.find(
                    (team) => team.name === teamName
                )
                return cy.request('GET', `/api/v1/teams/${team.id}/projects`)
            })
            .then((response) => {
                const project = response.body.projects.find(
                    (project) => project.name === projectName
                )
                cy.visit(`/instance/${project.id}`)
            })
    }

    beforeEach(() => {
        cy.intercept('GET', '/api/*/project-types*').as('getProjectTypes')

        cy.login('alice', 'aaPassword')
        cy.home()
        cy.visit('/admin/project-types')
        cy.wait('@getProjectTypes')
    })

    it('can be navigated to from projects', () => {
        cy.intercept('GET', '/api/*/projects/*').as('getProject')

        cy.visit('/')

        cy.get('[data-nav="team-projects"]')

        cy.wait('@getTeamProjects')

        cy.contains('project1').click()

        cy.wait('@getProject')

        cy.get('[data-nav="project-overview"]').click()
        cy.get('[data-el="cloud-instances"]').contains('project1').click()
        cy.get('[data-el="instances-section"]').should('exist')

        cy.get('[data-el="banner-project-as-admin"]').should('not.exist')

        cy.get('[data-action="open-editor"]').should('exist')
        cy.get('[data-el="editor-link"]').should('exist')
    })

    it('can be deleted', () => {
        const INSTANCE_NAME = `new-instance-${Math.random().toString(36).substring(2, 7)}`

        cy.intercept('DELETE', '/api/*/projects/*').as('deleteProject')

        let team, template, stack, type

        cy.request('GET', 'api/v1/teams')
            .then((response) => {
                team = response.body.teams[0]
                return cy.request('GET', 'api/v1/templates')
            })
            .then((response) => {
                template = response.body.templates[0]
                return cy.request('GET', 'api/v1/project-types')
            })
            .then((response) => {
                type = response.body.types[0]
                return cy.request('GET', `api/v1/stacks?projectType=${type.id}`)
            })
            .then((response) => {
                stack = response.body.stacks[0]
                return cy.request('POST', '/api/v1/projects', {
                    name: INSTANCE_NAME,
                    stack: stack.id,
                    template: template.id,
                    billingConfirmation: false,
                    projectType: type.id,
                    team: team.id
                })
            })
            .then((response) => {
                cy.intercept('GET', '/api/*/projects/*').as('getProject')

                const project = response.body
                cy.visit(`/instance/${project.id}/settings`)
                cy.wait('@getProject')

                cy.get('[data-el="delete-instance-dialog"]').should('not.be.visible')
                cy.get('button[data-action="delete-instance"]').click()

                cy.get('[data-el="delete-instance-dialog"]')
                    .should('be.visible')
                    .within(() => {
                        // Dialog is open
                        cy.get('.ff-dialog-header').contains('Delete Instance')

                        // main button should be disabled
                        cy.get('button.ff-btn.ff-btn--danger').should('be.disabled')
                        cy.get('[data-form="instance-name"] input[type="text"]').type(INSTANCE_NAME)

                        // should now be enabled again
                        cy.get('button.ff-btn.ff-btn--danger').click()
                    })

                cy.wait('@deleteProject')

                cy.url().should('include', `/team/${team.slug}/overview`)
            })
    })

    it('can be updated', () => {
        cy.intercept('GET', '/api/*/projects/*').as('getProject')

        navigateToInstance('ATeam', 'project1')

        cy.get('[data-nav="instance-settings"]').click()
        cy.get('[data-nav="general"]').click()
        cy.get('[data-nav="change-instance-settings"]').click()

        cy.intercept('PUT', '/api/*/projects/*').as('updateProject')
        cy.intercept('GET', '/api/*/projects/*').as('getProject')

        // Scoped as there are multiple dialogs on the page
        cy.get('[data-el="change-project"]').within(($form) => {
            // No changes to form yet
            cy.get('[data-action="update-project"]').should('be.disabled')

            cy.get('[data-form="project-name"] input').should('be.disabled').should(($input) => {
                const projectName = $input.val()
                expect(projectName).to.equal('project1')
            })

            cy.get('[data-form="instance-stack"]').contains('stack2').click()
            cy.get('[data-action="update-project"]').should('not.be.disabled') // changes _have_ now been made

            cy.get('[data-form="instance-stack"]').contains('stack1').click() // re-select
            cy.get('[data-action="update-project"]').should('be.disabled')

            cy.get('[data-form="project-type"]').contains('type2').click()

            cy.get('[data-form="project-template"]').should('not.exist') // template section is hidden for edit

            cy.get('[data-action="update-project"]').should('not.be.disabled').click()
        })

        cy.wait('@updateProject')
        cy.wait('@getProject')

        cy.contains('project1')
        cy.contains('type2 / stack1-for-type2')

        // Put it back how it was
        cy.get('[data-nav="instance-settings"]').click()
        cy.get('[data-nav="general"]').click()
        cy.get('[data-nav="change-instance-settings"]').click()

        cy.get('[data-el="change-project"]').within(($form) => {
            cy.get('[data-form="project-type"]').contains('type1').click()
            cy.get('[data-action="update-project"]').click()
        })

        cy.wait('@updateProject')
        cy.wait('@getProject')

        cy.contains('project1')
        cy.contains('type1 / stack1')
    })

    it('can be copied', () => {
        // TODO needs work as currently lands user on Project Overview rather than Index View
        cy.intercept('GET', '/api/*/projects/*').as('getProject')
        cy.intercept('POST', '/api/*/projects').as('createProject')

        cy.visit('/')

        navigateToInstance('ATeam', 'project1')

        cy.wait('@getProject')

        cy.get('[data-nav="instance-settings"]').click()
        cy.get('[data-nav="general"]').click()
        cy.get('[data-nav="copy-project"]').click()

        // Does not use same name
        cy.get('[data-form="project-name"] input').should(($input) => {
            const projectName = $input.val()
            expect(projectName).not.to.be.equal('project1')
        })

        cy.get('[data-action="create-project"]').click()

        cy.wait('@createProject')
        cy.wait('@getProject')

        cy.get('[data-el="cloud-instances"] tbody tr').click()

        cy.wait('@getProject')

        cy.contains('type1 / stack1')
    })
})
