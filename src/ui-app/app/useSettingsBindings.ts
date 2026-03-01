import { ref, type Ref } from 'vue'

export function useSettingsBindings(input: Readonly<{ isReady: Ref<boolean> }>) {
  const settingsOpen = ref(false)

  function openSettings() {
    if (!input.isReady.value) return
    settingsOpen.value = true
  }

  function closeSettings() {
    settingsOpen.value = false
  }

  return {
    settingsOpen,
    openSettings,
    closeSettings,
  }
}
