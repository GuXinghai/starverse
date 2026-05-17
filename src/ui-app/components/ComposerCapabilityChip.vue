<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import { useFloatingDropdown } from '../composables/useFloatingDropdown'
import { t } from '@/shared/i18n'

const props = defineProps<{
  enabled: boolean
  label: string
  activeLabel?: string | null
  kind?: 'reasoning' | 'webSearch' | 'image'
  disabled?: boolean
  options?: readonly string[]
  selectedOption?: string | null
  dataTestId?: string
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'selectOption', value: string): void
}>()

const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const { dropdownStyle, update: updateMenuPosition } = useFloatingDropdown(triggerRef, menuRef, {
  placement: 'top-start',
  offset: 8,
  padding: 8,
})

const widthClass = computed(() => {
  switch (props.kind) {
    case 'reasoning': return 'w-[6.25rem]'
    case 'webSearch': return 'w-[6.25rem]'
    case 'image': return 'w-[7.75rem]'
    default: return ''
  }
})

const displayText = computed(() => {
  if (props.enabled && props.activeLabel) return props.activeLabel
  return props.label
})

const fullLabel = computed(() => {
  switch (props.kind) {
    case 'reasoning': return t('composer.capabilities.reasoning')
    case 'webSearch': return t('composer.capabilities.webSearch')
    case 'image': return t('composer.capabilities.image')
    default: return props.label
  }
})

const titleText = computed(() => {
  if (props.enabled && props.activeLabel) {
    return `${fullLabel.value} ${props.activeLabel} ${t('composer.capabilities.enabledSuffix')}`
  }
  return fullLabel.value
})

function onBodyClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (menuRef.value?.contains(target)) return
  if (triggerRef.value?.contains(target)) return
  closeMenu()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
}

function openMenu() {
  menuOpen.value = true
  void nextTick(() => {
    void updateMenuPosition()
  })
  document.addEventListener('mousedown', onBodyClick)
  document.addEventListener('keydown', onKeydown)
}

function closeMenu() {
  menuOpen.value = false
  document.removeEventListener('mousedown', onBodyClick)
  document.removeEventListener('keydown', onKeydown)
}

function toggleMenu() {
  if (props.disabled) return
  if (menuOpen.value) {
    closeMenu()
  } else {
    openMenu()
  }
}

function onChipClick() {
  if (props.disabled) return
  emit('toggle')
}

function onOptionClick(option: string) {
  emit('selectOption', option)
  closeMenu()
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onBodyClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="relative inline-flex items-center"
    :class="widthClass"
    :data-testid="dataTestId"
    :data-width-kind="kind"
  >
    <button
      type="button"
      class="flex w-full items-center rounded-l-md border px-1.5 py-1 text-[11px] leading-tight transition-colors disabled:opacity-50"
      :class="
        enabled
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      "
      :disabled="disabled"
      :title="titleText"
      :aria-label="titleText"
      data-testid="capability-chip-body"
      @click="onChipClick"
    >
      <slot name="icon" />
      <span class="flex-1 text-center">{{ displayText }}</span>
    </button>
    <button
      v-if="options && options.length > 0"
      ref="triggerRef"
      type="button"
      class="shrink-0 inline-flex items-center rounded-r-md border border-l-0 px-0.5 py-1 text-[10px] leading-none transition-colors disabled:opacity-50"
      :class="
        enabled
          ? 'border-gray-900 bg-gray-800 text-gray-300 hover:bg-gray-700'
          : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50 hover:text-gray-600'
      "
      :disabled="disabled"
      data-testid="capability-chip-chevron"
      @click="toggleMenu"
    >
      <svg
        class="h-3 w-3 transition-transform"
        :class="{ 'rotate-180': menuOpen }"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="menuOpen && options && options.length > 0"
        ref="menuRef"
        class="fixed z-[var(--z-popover)] min-w-[80px] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        :style="dropdownStyle"
        data-testid="capability-chip-menu"
      >
        <template v-for="option in options" :key="option">
          <div
            v-if="option === '—'"
            class="my-1 border-t border-gray-100"
            data-testid="capability-chip-divider"
          />
          <button
            v-else
            type="button"
            class="block w-full px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-gray-50"
            :class="
              selectedOption === option
                ? 'font-medium text-gray-900'
                : 'text-gray-600'
            "
            data-testid="capability-chip-option"
            @click="onOptionClick(option)"
          >
            {{ option }}
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>
