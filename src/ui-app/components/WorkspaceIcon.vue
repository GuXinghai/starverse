<script setup lang="ts">
import UiIcon from '@/ui-kit/icons/UiIcon.vue'

withDefaults(defineProps<{ name: string; size?: number; filled?: boolean }>(), { size: 16, filled: false })
</script>

<template>
  <UiIcon :name="name" :size="size" :filled="filled" />
</template>
