<template>
    <div class="forge-badge" :class="['forge-status-' + status,pendingStateChange ? 'opacity-40' : '']">
        <ExclamationCircleIcon v-if="status === 'error'" class="w-4 h-4" />
        <ExclamationIcon v-if="status === 'suspended'" class="w-4 h-4" />
        <PlayIcon v-if="status === 'running'" class="w-4 h-4" />
        <StopIcon v-if="status === 'stopped'" class="w-4 h-4" />
        <DownloadIcon v-if="status === 'importing'" class="w-4 h-4" />
        <DotsCircleHorizontalIcon v-if="status === 'starting'" class="w-4 h-4" />
        <CloudUploadIcon v-if="status === 'loading'" class="w-4 h-4" />
        <CloudDownloadIcon v-if="status === 'installing'" class="w-4 h-4" />
        <SupportIcon v-if="status === 'safe'" class="w-4 h-4" />
        <span class="ml-1">{{ status }}</span>
    </div>
</template>

<script>
import { CloudDownloadIcon, CloudUploadIcon, DotsCircleHorizontalIcon, DownloadIcon, ExclamationCircleIcon, ExclamationIcon, PlayIcon, StopIcon, SupportIcon } from '@heroicons/vue/outline'

export default {
    name: 'InstanceStatusBadge',
    components: {
        DownloadIcon, ExclamationIcon, ExclamationCircleIcon, PlayIcon, StopIcon, DotsCircleHorizontalIcon, SupportIcon, CloudDownloadIcon, CloudUploadIcon
    },
    props: ['status', 'pendingStateChange']
}
</script>
