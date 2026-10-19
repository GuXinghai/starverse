<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { t } from '@/shared/i18n'
import { DEFAULT_NETWORK_PROXY_SETTINGS, defaultBrowserProxySettings, effectiveProxySettings,
  type NetworkProxyConfiguration, type NetworkProxyProbeResult, type NetworkProxyScope } from '@/shared/plugin-distribution/networkProxyShared'
import { cancelProxyProbe, getProxyConfiguration, getProxyEnvironment, probeProxyDraft,
  probeLibreOfficeOfficialDownloadNetwork, reapplyProxySettings, resetProxySettings, saveProxyConfiguration } from '@/next/settings/networkProxySettingsClient'

const props = defineProps<{ disabled: boolean }>()
const configuration = ref<NetworkProxyConfiguration>({ application: { ...DEFAULT_NETWORK_PROXY_SETTINGS }, browser: defaultBrowserProxySettings() })
const saved = ref('')
const loading = ref(true)
const saving = ref(false)
const probeId = ref<string | null>(null)
const error = ref<string | null>(null)
const message = ref<string | null>(null)
const environment = ref<Readonly<Record<string, string>>>({})
const states = ref<Record<NetworkProxyScope, string>>({ application: 'uninitialized', browser: 'uninitialized' })
const results = ref<Partial<Record<NetworkProxyScope, NetworkProxyProbeResult>>>({})
const downloadResult = ref<string | null>(null)
const url = ref('https://api.openai.com/')
const busy = computed(() => props.disabled || loading.value || saving.value || probeId.value !== null)
const scopes: NetworkProxyScope[] = ['application', 'browser']
const clone = () => JSON.parse(JSON.stringify(configuration.value)) as NetworkProxyConfiguration
const draftSettings = (scope: NetworkProxyScope) => scope === 'application' ? configuration.value.application : configuration.value.browser.settings
const modes = ['system', 'manual', 'environment', 'direct'] as const
const modeKey = { system: 'settings.network.proxyModeSystem', manual: 'settings.network.proxyModeManual', environment: 'settings.network.proxyModeEnvironment', direct: 'settings.network.proxyModeDirect' } as const
function stateText(scope: NetworkProxyScope) {
  const value = states.value[scope]
  if (value === 'ready') return t('settings.network.stateReady')
  if (value === 'applying' || value === 'proxy_updating') return t('settings.network.stateApplying')
  if (value === 'uninitialized') return t('settings.network.stateUninitialized')
  return t('settings.network.stateBlocked')
}

async function refreshStates() {
  const result = await getProxyConfiguration()
  if (result.states) states.value = { application: result.states.application.errorCode ?? result.states.application.status,
    browser: result.states.browser.errorCode ?? result.states.browser.status }
}
onMounted(async () => {
  try {
    const result = await getProxyConfiguration()
    configuration.value = result.configuration
    saved.value = JSON.stringify(configuration.value)
    environment.value = await getProxyEnvironment()
    await refreshStates()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'proxy_settings_invalid' }
  finally { loading.value = false }
})
onBeforeUnmount(() => { if (probeId.value) void cancelProxyProbe(probeId.value).catch(() => undefined) })

async function save() {
  if (JSON.stringify(configuration.value) === saved.value) return
  if (busy.value) throw new Error('proxy_updating')
  saving.value = true
  error.value = null
  try {
    const result = await saveProxyConfiguration(clone())
    configuration.value = result.configuration
    saved.value = JSON.stringify(configuration.value)
    message.value = t('settings.network.applied')
    await refreshStates()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'proxy_session_apply_failed'
    await refreshStates().catch(() => undefined)
    throw cause
  } finally { saving.value = false }
}
async function saveFromButton() { await save().catch(() => undefined) }
async function probe(scope: NetworkProxyScope) {
  error.value = null
  message.value = null
  const id = crypto.randomUUID()
  probeId.value = id
  try { results.value[scope] = await probeProxyDraft({ id, scope, configuration: clone(), url: url.value }) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'proxy_probe_failed' }
  finally { probeId.value = null }
}
async function reapply(scope: NetworkProxyScope) {
  saving.value = true
  error.value = null
  try {
    await reapplyProxySettings(scope)
    environment.value = await getProxyEnvironment()
    message.value = t('settings.network.reapplied')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'proxy_session_apply_failed' }
  finally { await refreshStates().catch(() => undefined); saving.value = false }
}
async function reset(scope: NetworkProxyScope) {
  saving.value = true
  error.value = null
  try {
    await resetProxySettings(scope)
    const result = await getProxyConfiguration()
    let baseline = JSON.parse(saved.value) as NetworkProxyConfiguration
    if (scope === 'application') { configuration.value = { ...configuration.value, application: result.configuration.application }; baseline = { ...baseline, application: result.configuration.application } }
    else { configuration.value = { ...configuration.value, browser: result.configuration.browser }; baseline = { ...baseline, browser: result.configuration.browser } }
    saved.value = JSON.stringify(baseline)
    message.value = t('settings.network.applied')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'proxy_session_apply_failed' }
  finally { await refreshStates().catch(() => undefined); saving.value = false }
}
async function checkDownload() {
  saving.value = true
  try {
    const result = await probeLibreOfficeOfficialDownloadNetwork()
    downloadResult.value = result.terminalDiagnostic
  } catch { downloadResult.value = 'proxy_probe_failed' }
  finally { saving.value = false }
}
defineExpose({ save })
</script>

<template>
  <div data-testid="network-proxy-settings">
    <p class="sv-meta mt-1">{{ t('settings.network.proxyPolicyDesc') }}</p>
    <p class="sv-meta mt-1">{{ t('settings.network.reconnectHint') }}</p>
    <section v-for="scope in scopes" :key="scope" class="sv-divider-t mt-5 flex flex-col gap-3 pt-5" :data-testid="`proxy-${scope}`">
      <h3 class="text-[13px] font-semibold">{{ scope === 'application' ? t('settings.network.applicationTitle') : t('settings.network.browserTitle') }}</h3>
      <label v-if="scope === 'browser'" class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px]">
        {{ t('settings.network.browserPolicy') }}
        <select v-model="configuration.browser.mode" :disabled="busy" data-testid="proxy-browser-policy" class="sv-select w-56">
          <option value="inherit">{{ t('settings.network.inherit') }}</option>
          <option value="independent">{{ t('settings.network.independent') }}</option>
        </select>
      </label>
      <p class="sv-meta" :title="states[scope]">{{ t('settings.network.effectiveMode') }}: {{ t(modeKey[effectiveProxySettings(configuration, scope).proxyMode]) }} · {{ stateText(scope) }}</p>
      <template v-if="scope === 'application' || configuration.browser.mode === 'independent'">
        <label class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px]">
          {{ t('settings.network.proxyMode') }}
          <select v-model="draftSettings(scope).proxyMode" :disabled="busy" :data-testid="`proxy-${scope}-mode`" class="sv-select w-56">
            <option v-for="mode in modes" :key="mode" :value="mode">{{ t(modeKey[mode]) }}</option>
          </select>
        </label>
        <template v-if="draftSettings(scope).proxyMode === 'manual'">
          <label class="block text-[13px]">{{ t('settings.network.manualProxyUrl') }}
            <input v-model="draftSettings(scope).manualProxyUrl" :disabled="busy" :data-testid="`proxy-${scope}-url`" class="sv-input mt-1.5" placeholder="http://127.0.0.1:10808" />
          </label>
          <p class="sv-meta">{{ t('settings.network.protocolHint') }}</p>
          <label class="block text-[13px]">{{ t('settings.network.noProxyList') }}
            <input v-model="draftSettings(scope).noProxy" :disabled="busy" :data-testid="`proxy-${scope}-bypass`" class="sv-input mt-1.5" placeholder="localhost,127.0.0.1,.example.com" />
          </label>
        </template>
        <div v-else-if="draftSettings(scope).proxyMode === 'environment'" class="sv-meta" :data-testid="`proxy-${scope}-environment`">
          <p>{{ t('settings.network.environmentHint') }}</p>
          <dl v-for="(value, key) in environment" :key="key" class="break-all"><dt class="inline font-mono">{{ key }}</dt>: <dd class="inline">{{ value || '—' }}</dd></dl>
        </div>
        <p v-else-if="draftSettings(scope).proxyMode === 'system'" class="sv-meta">{{ t('settings.network.systemHint') }}</p>
      </template>
      <div class="flex flex-wrap gap-2">
        <button type="button" :disabled="busy" :data-testid="`proxy-${scope}-test`" class="sv-btn sv-btn-sm" @click="probe(scope)">{{ t('settings.network.testDraft') }}</button>
        <button type="button" :disabled="busy" :data-testid="`proxy-${scope}-reapply`" class="sv-btn sv-btn-sm" @click="reapply(scope)">{{ t('settings.network.reapply') }}</button>
        <button type="button" :disabled="busy" :data-testid="`proxy-${scope}-reset`" class="sv-btn sv-btn-sm" @click="reset(scope)">{{ t('settings.network.resetApply') }}</button>
      </div>
      <div v-if="results[scope]" class="sv-meta break-all" :data-testid="`proxy-${scope}-result`">
        <div>{{ t('settings.network.configurationCheck') }}: {{ results[scope]?.configurationValid ? t('settings.network.passed') : t('settings.network.failed') }}</div>
        <div>{{ t('settings.network.plannedRoute') }}: {{ results[scope]?.resolvedProxy ?? '—' }}</div>
        <div>HTTP: {{ results[scope]?.httpStatus ?? '—' }} · {{ results[scope]?.elapsedMs }} ms</div>
        <div>{{ t('settings.network.diagnosticLabel') }} {{ results[scope]?.code }}</div>
      </div>
    </section>
    <div class="sv-divider-t mt-5 flex flex-col gap-3 pt-5">
      <label class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[13px]">{{ t('settings.network.testTarget') }}
        <input v-model="url" type="url" list="proxy-targets" :disabled="busy" data-testid="proxy-test-target" class="sv-input w-72" />
        <datalist id="proxy-targets"><option value="https://api.openai.com/" /><option value="https://api.anthropic.com/" /><option value="https://generativelanguage.googleapis.com/" /><option value="https://openrouter.ai/" /></datalist>
      </label>
      <p class="sv-meta">{{ t('settings.network.diagnosticHint') }}</p>
      <label class="flex items-center gap-2 text-[13px]"><input type="checkbox" class="size-4" checked disabled /> {{ t('settings.network.strictSslRequired') }}</label>
      <div class="flex flex-wrap gap-2">
        <button type="button" :disabled="busy" data-testid="proxy-save" class="sv-btn w-32" @click="saveFromButton">{{ t('settings.network.saveApply') }}</button>
        <button type="button" :disabled="busy" data-testid="proxy-download-check" class="sv-btn" @click="checkDownload">{{ t('settings.network.downloadCheck') }}</button>
        <button v-if="probeId" type="button" data-testid="proxy-cancel" class="sv-btn order-last" @click="cancelProxyProbe(probeId)">{{ t('settings.network.cancelTest') }}</button>
      </div>
      <p v-if="downloadResult" class="sv-meta">{{ t('settings.network.downloadCheck') }}: {{ downloadResult }}</p>
      <div class="min-h-[18px]">
        <p v-if="error" role="alert" class="text-xs text-[color:var(--sv-danger)]">{{ error }}</p>
        <p v-if="message" role="status" class="text-xs text-[color:var(--sv-text-2)]">{{ message }}</p>
      </div>
    </div>
  </div>
</template>
