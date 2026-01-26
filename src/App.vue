<script setup lang="ts">
import AppChatNext from './ui-next/AppChatNext.vue'
import AppChatApp from './ui-app/AppChatApp.vue'

type EntryId = 'ui-next' | 'ui-app'

// Default to `ui-app` for local dev + electron dev. You can still force `ui-next` via:
// `VITE_STARVERSE_ENTRY=ui-next`
const entry: EntryId = ((import.meta as any).env?.VITE_STARVERSE_ENTRY ?? 'ui-app') === 'ui-next' ? 'ui-next' : 'ui-app'
</script>

<template>
  <div class="h-screen bg-gray-100">
    <AppChatApp v-if="entry === 'ui-app'" />
    <AppChatNext v-else />
  </div>
</template>
