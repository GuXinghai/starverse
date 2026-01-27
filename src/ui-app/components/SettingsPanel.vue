<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getOpenRouterProviderRequireParameters, setOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import { getReasoningPrefs, setReasoningPrefs } from '@/next/settings/reasoningPrefsClient'
import type { ReasoningEffort, ReasoningPrefs } from '@/next/state/types'

const props = defineProps<{
  disabled: boolean
  isRunning: boolean
}>()

type ElectronStoreLike = Readonly<{
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<any>
  delete: (key: string) => Promise<any>
}>

function getElectronStore(): ElectronStoreLike | null {
  const store = (globalThis as any).electronStore as ElectronStoreLike | undefined
  if (!store) return null
  if (typeof store.get !== 'function' || typeof store.set !== 'function' || typeof store.delete !== 'function') return null
  return store
}

const OPENROUTER_API_KEY_KEY = 'openRouterApiKey'
const OPENROUTER_BASE_URL_KEY = 'openRouterBaseUrl'

const apiKey = ref('')
const baseUrl = ref('')
const requireParameters = ref(false)
const showApiKey = ref(false)
const requestedReasoningEffort = ref<'auto' | ReasoningEffort>('auto')
const requestedReasoningExclude = ref(false)

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const savedMessage = ref<string | null>(null)

const storeAvailable = computed(() => !!getElectronStore())
const canEdit = computed(() => !props.disabled && !props.isRunning && storeAvailable.value)

function isValidUrlOrEmpty(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed)
    return true
  } catch {
    return false
  }
}

const baseUrlValid = computed(() => isValidUrlOrEmpty(baseUrl.value))

const DEFAULT_REASONING_PREFS: ReasoningPrefs = { mode: 'auto', effort: 'auto', exclude: false }
const REASONING_EFFORTS: ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return typeof value === 'string' && (REASONING_EFFORTS as string[]).includes(value)
}

function normalizeReasoningPrefs(raw: unknown): ReasoningPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_REASONING_PREFS
  const mode = (raw as any).mode === 'effort' || (raw as any).mode === 'auto' ? (raw as any).mode : 'auto'
  const effortRaw = (raw as any).effort
  const effort = effortRaw === 'auto' || isReasoningEffort(effortRaw) ? effortRaw : undefined
  const exclude = (raw as any).exclude === true

  if (mode === 'auto') {
    return { mode: 'auto', effort: 'auto', exclude: false }
  }

  return { mode: 'effort', effort: (effort && effort !== 'auto' ? effort : 'none'), exclude }
}

function applyReasoningPrefs(prefs: ReasoningPrefs) {
  if (prefs.mode === 'auto') {
    requestedReasoningEffort.value = 'auto'
    requestedReasoningExclude.value = false
    return
  }
  requestedReasoningEffort.value = prefs.effort && prefs.effort !== 'auto' ? prefs.effort : 'none'
  requestedReasoningExclude.value = prefs.exclude === true
}

function buildReasoningPrefs(): ReasoningPrefs {
  const mode = requestedReasoningEffort.value === 'auto' ? 'auto' : 'effort'
  const exclude = mode === 'auto' ? false : requestedReasoningExclude.value
  return { mode, effort: requestedReasoningEffort.value, exclude }
}

async function load() {
  error.value = null
  savedMessage.value = null

  const store = getElectronStore()
  if (!store) {
    error.value = 'Missing electronStore (run in Electron).'
    return
  }

  loading.value = true
  try {
    apiKey.value = String((await store.get(OPENROUTER_API_KEY_KEY)) ?? '').trim()
    baseUrl.value = String((await store.get(OPENROUTER_BASE_URL_KEY)) ?? '').trim()
    requireParameters.value = await getOpenRouterProviderRequireParameters()
    const prefs = await getReasoningPrefs()
    applyReasoningPrefs(normalizeReasoningPrefs(prefs))
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    loading.value = false
  }
}

async function save() {
  error.value = null
  savedMessage.value = null

  const store = getElectronStore()
  if (!store) {
    error.value = 'Missing electronStore (run in Electron).'
    return
  }

  if (!baseUrlValid.value) {
    error.value = 'Base URL is invalid.'
    return
  }

  saving.value = true
  try {
    await store.set(OPENROUTER_API_KEY_KEY, apiKey.value.trim())
    await store.set(OPENROUTER_BASE_URL_KEY, baseUrl.value.trim())
    await setOpenRouterProviderRequireParameters(requireParameters.value === true)
    const nextReasoningPrefs = buildReasoningPrefs()
    await setReasoningPrefs(nextReasoningPrefs)
    try {
      window.dispatchEvent(new CustomEvent('settings:reasoningPrefsUpdated', { detail: nextReasoningPrefs }))
    } catch {
      // no-op
    }
    savedMessage.value = 'Saved.'
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function clearApiKey() {
  error.value = null
  savedMessage.value = null
  const store = getElectronStore()
  if (!store) {
    error.value = 'Missing electronStore (run in Electron).'
    return
  }
  saving.value = true
  try {
    await store.delete(OPENROUTER_API_KEY_KEY)
    apiKey.value = ''
    savedMessage.value = 'API key cleared.'
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

async function clearBaseUrl() {
  error.value = null
  savedMessage.value = null
  const store = getElectronStore()
  if (!store) {
    error.value = 'Missing electronStore (run in Electron).'
    return
  }
  saving.value = true
  try {
    await store.delete(OPENROUTER_BASE_URL_KEY)
    baseUrl.value = ''
    savedMessage.value = 'Base URL cleared.'
  } catch (err: any) {
    error.value = err?.message ? String(err.message) : String(err)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="h-full p-4">
    <div class="flex items-center justify-between gap-2">
      <div class="text-sm font-semibold text-gray-900">Settings</div>
      <button
        type="button"
        class="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        :disabled="props.disabled || props.isRunning || loading || saving"
        @click="load"
      >
        Reload
      </button>
    </div>

    <div class="mt-3 space-y-3">
      <div v-if="error" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
        {{ error }}
      </div>
      <div v-else-if="savedMessage" class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
        {{ savedMessage }}
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">OpenRouter</div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">API Key</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :type="showApiKey ? 'text' : 'password'"
            placeholder="sk-…"
            :disabled="!canEdit || loading || saving"
            v-model="apiKey"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="props.disabled || loading || saving"
            @click="showApiKey = !showApiKey"
          >
            {{ showApiKey ? 'Hide' : 'Show' }}
          </button>
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving"
            @click="clearApiKey"
          >
            Clear
          </button>
        </div>

        <label class="mt-3 block text-[11px] font-semibold text-gray-700">Base URL (optional)</label>
        <div class="mt-1 flex items-center gap-2">
          <input
            class="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-50"
            :class="baseUrlValid ? 'border-gray-200' : 'border-red-300'"
            placeholder="https://openrouter.ai/api/v1"
            :disabled="!canEdit || loading || saving"
            v-model="baseUrl"
          />
          <button
            type="button"
            class="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            :disabled="!canEdit || loading || saving"
            @click="clearBaseUrl"
          >
            Clear
          </button>
        </div>
        <div v-if="!baseUrlValid" class="mt-1 text-[11px] text-red-700">Invalid URL.</div>

        <div class="mt-4 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-[11px] font-semibold text-gray-700">provider.require_parameters</div>
            <div class="text-[11px] text-gray-500">Force OpenRouter provider parameter validation</div>
          </div>
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              aria-label="OpenRouter require parameters"
              :disabled="!canEdit || loading || saving"
              v-model="requireParameters"
            />
            <span class="text-[11px] text-gray-700">{{ requireParameters ? 'On' : 'Off' }}</span>
          </label>
        </div>

        <div class="mt-4 flex justify-end">
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            :disabled="!canEdit || loading || saving"
            @click="save"
          >
            Save
          </button>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-3">
        <div class="text-xs font-semibold uppercase tracking-wide text-gray-600">Global Reasoning Defaults</div>

        <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <div class="flex items-center gap-2">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">Reasoning</div>
            <select
              class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs shadow-sm"
              :value="requestedReasoningEffort"
              :disabled="!canEdit || loading || saving"
              @change="requestedReasoningEffort = ($event.target as HTMLSelectElement).value as any"
            >
              <option value="auto">auto</option>
              <option value="none">none</option>
              <option value="minimal">minimal</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
            </select>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                aria-label="Global reasoning exclude"
                class="h-4 w-4 rounded border-gray-300"
                :disabled="!canEdit || loading || saving || requestedReasoningEffort === 'auto'"
                v-model="requestedReasoningExclude"
              />
              exclude
            </label>
          </div>

          <div class="text-[11px] text-gray-500">
            Defaults apply to non-project sessions. Session-level preferences override project/global defaults.
          </div>
        </div>
      </div>

      <div class="text-[11px] text-gray-500">
        ui-app reads OpenRouter settings from electron-store (not env) to avoid hidden overrides.
      </div>
    </div>
  </div>
</template>

