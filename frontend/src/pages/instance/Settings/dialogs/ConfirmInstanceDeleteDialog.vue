<template>
    <ff-dialog
        ref="dialog"
        confirm-label="Delete"
        data-el="delete-instance-dialog"
        header="Delete Instance"
        kind="danger"
        :disable-primary="!formValid"
        @confirm="confirm()"
    >
        <template #default>
            <form class="space-y-6" @submit.prevent>
                <div class="mt-2 space-y-2">
                    <p>
                        Are you sure you want to delete this instance and the application that contains it? Once deleted, there is no going back.
                    </p>
                    <p>
                        Enter the instance name to continue.
                        <code class="block">{{ project?.name }}</code>
                    </p>
                </div>
                <FormRow id="projectName" v-model="input.projectName" data-form="instance-name">Name</FormRow>
            </form>
        </template>
    </ff-dialog>
</template>

<script>

import FormRow from '@/components/FormRow'

export default {
    name: 'ConfirmInstanceDeleteDialog',
    components: {
        FormRow
    },
    emits: ['confirm'],
    setup () {
        return {
            show (project) {
                this.$refs.dialog.show()
                this.project = project
            }
        }
    },
    data () {
        return {
            input: {
                projectName: ''
            },
            formValid: false,
            project: null
        }
    },
    watch: {
        input: {
            handler: function (v) {
                this.formValid = this.project.name === v.projectName
            },
            deep: true
        }
    },
    methods: {
        confirm () {
            if (this.formValid) {
                this.$emit('confirm')
            }
        }
    }
}
</script>
