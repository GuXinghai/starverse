<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, useSlots } from 'vue'
import { useFloatingDropdown } from '@/ui-app/composables/useFloatingDropdown'
import { t } from '@/shared/i18n'
import UiIcon from '@/ui-kit/icons/UiIcon.vue'

const props = defineProps<{
  enabled: boolean
  label: string
  activeLabel?: string | null
  kind?: 'reasoning' | 'webSearch' | 'image'
  disabled?: boolean
  toggleDisabled?: boolean
  options?: readonly string[]
  optionLabels?: Readonly<Record<string, string>>
  selectedOption?: string | null
  dataTestId?: string
  unavailableReason?: string | null
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'selectOption', value: string): void
}>()

const slots = useSlots()
const menuOpen = ref(false)
const menuRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const { dropdownStyle, update: updateMenuPosition } = useFloatingDropdown(triggerRef, menuRef, {
  placement: 'top-start',
  offset: 8,
  padding: 8,
})

// Fixed widths per kind so toggling or changing the active label never moves siblings.
const widthClass = computed(() => {
  switch (props.kind) {
    case 'image': return 'w-[8.5rem]'
    default: return 'w-[7rem]'
  }
})

const iconName = computed(() => {
  switch (props.kind) {
    case 'webSearch': return 'globe'
    case 'image': return 'image'
    default: return 'reasoning'
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
  const base = props.enabled && props.activeLabel
    ? `${fullLabel.value} ${props.activeLabel} ${t('composer.capabilities.enabledSuffix')}`
    : fullLabel.value
  return props.unavailableReason ? `${base} (${props.unavailableReason})` : base
})
const hasCustomMenu = computed(() => Boolean(slots.menu))
const hasMenu = computed(() => hasCustomMenu.value || (props.options?.length ?? 0) > 0)

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
  if (props.disabled || props.toggleDisabled) return
  emit('toggle')
}

function onOptionClick(option: string) {
  emit('selectOption', option)
  closeMenu()
}

function optionLabel(option: string): string {
  return props.optionLabels?.[option] ?? option
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onBodyClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="relative inline-flex h-7 flex-none items-center rounded-md transition-colors"
    :class="[widthClass, enabled ? 'bg-black/[0.08] text-gray-900' : 'text-gray-500']"
    :data-testid="dataTestId"
    :data-width-kind="kind"
  >
    <button
      type="button"
      class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-[13px] leading-none transition-colors enabled:hover:bg-black/5 enabled:hover:text-gray-900 disabled:text-gray-400"
      :disabled="disabled || toggleDisabled"
      :title="titleText"
      :aria-label="titleText"
      :aria-pressed="enabled"
      data-testid="capability-chip-body"
      @click="onChipClick"
    >
      <slot name="icon">
        <UiIcon :name="iconName" :size="15" class="shrink-0" />
      </slot>
      <span class="min-w-0 flex-1 truncate text-left">{{ displayText }}</span>
    </button>
    <button
      v-if="hasMenu"
      ref="triggerRef"
      type="button"
      class="inline-flex h-7 w-5 shrink-0 items-center justify-center rounded-md transition-colors enabled:hover:bg-black/5 enabled:hover:text-gray-900 disabled:text-gray-400"
      :disabled="disabled"
      :aria-label="fullLabel"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      data-testid="capability-chip-chevron"
      @click="toggleMenu"
    >
      <UiIcon name="chevronDown" :size="12" class="transition-transform" :class="{ 'rotate-180': menuOpen }" />
    </button>

    <Teleport to="body">
      <div
        v-if="menuOpen && hasMenu"
        ref="menuRef"
        class="sv-popover fixed z-[var(--z-popover)] min-w-[120px] py-1"
        :style="dropdownStyle"
        data-testid="capability-chip-menu"
      >
        <slot v-if="hasCustomMenu" name="menu" :close="closeMenu" />
        <template v-else>
          <template v-for="option in options" :key="option">
            <div
              v-if="option === '—'"
              class="sv-divider-t my-1"
              data-testid="capability-chip-divider"
            />
            <button
              v-else
              type="button"
              class="sv-menu-item"
              :aria-pressed="selectedOption === option"
              data-testid="capability-chip-option"
              @click="onOptionClick(option)"
            >
              <span class="min-w-0 flex-1 truncate">{{ optionLabel(option) }}</span>
              <span class="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                <UiIcon v-if="selectedOption === option" name="check" :size="14" />
              </span>
            </button>
          </template>
        </template>
      </div>
    </Teleport>
  </div>
</template>
