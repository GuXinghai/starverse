<script setup lang="ts">
import AppChatNext from './ui-next/AppChatNext.vue'
import AppChatApp from './ui-app/AppChatApp.vue'

type EntryId = 'ui-next' | 'ui-app'

const entry: EntryId = ((import.meta as any).env?.VITE_STARVERSE_ENTRY ?? 'ui-next') === 'ui-app' ? 'ui-app' : 'ui-next'
</script>

<template>
  <div class="h-screen bg-gray-100">
    <AppChatApp v-if="entry === 'ui-app'" />
    <AppChatNext v-else />
  </div>
</template>
