import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))

function readRepoFile(...segments: string[]): string {
  return readFileSync(resolve(testDir, '..', '..', '..', ...segments), 'utf8')
}

function expectNoGenericStoreOpenRouterCredentialAccess(source: string) {
  const blockedPatterns = [
    /electronStore\s*\.\s*get\s*\(\s*['"]openRouterApiKey['"]/,
    /electronStore\s*\.\s*get\s*\(\s*['"]openRouterBaseUrl['"]/,
    /electronStore\s*\.\s*set\s*\(\s*['"]openRouterApiKey['"]/,
    /electronStore\s*\.\s*set\s*\(\s*['"]openRouterBaseUrl['"]/,
    /electronStore\s*\.\s*delete\s*\(\s*['"]openRouterApiKey['"]/,
    /electronStore\s*\.\s*delete\s*\(\s*['"]openRouterBaseUrl['"]/,
    /store\s*\.\s*get\s*\(\s*['"]openRouterApiKey['"]/,
    /store\s*\.\s*get\s*\(\s*['"]openRouterBaseUrl['"]/,
    /store\s*\.\s*set\s*\(\s*['"]openRouterApiKey['"]/,
    /store\s*\.\s*set\s*\(\s*['"]openRouterBaseUrl['"]/,
    /store\s*\.\s*delete\s*\(\s*['"]openRouterApiKey['"]/,
    /store\s*\.\s*delete\s*\(\s*['"]openRouterBaseUrl['"]/,
  ]
  for (const pattern of blockedPatterns) {
    expect(source).not.toMatch(pattern)
  }
}

function expectNoGenericStoreOpenAIResponsesCredentialAccess(source: string) {
  const blockedPatterns = [
    /electronStore\s*\.\s*get\s*\(\s*['"]openAIResponsesApiKey['"]/,
    /electronStore\s*\.\s*set\s*\(\s*['"]openAIResponsesApiKey['"]/,
    /electronStore\s*\.\s*delete\s*\(\s*['"]openAIResponsesApiKey['"]/,
    /store\s*\.\s*get\s*\(\s*['"]openAIResponsesApiKey['"]/,
    /store\s*\.\s*set\s*\(\s*['"]openAIResponsesApiKey['"]/,
    /store\s*\.\s*delete\s*\(\s*['"]openAIResponsesApiKey['"]/,
  ]
  for (const pattern of blockedPatterns) {
    expect(source).not.toMatch(pattern)
  }
}

function expectNoGenericStoreGoogleAIStudioCredentialAccess(source: string) {
  const blockedPatterns = [
    /electronStore\s*\.\s*get\s*\(\s*['"]googleAIStudioApiKey['"]/,
    /electronStore\s*\.\s*set\s*\(\s*['"]googleAIStudioApiKey['"]/,
    /electronStore\s*\.\s*delete\s*\(\s*['"]googleAIStudioApiKey['"]/,
    /electronStore\s*\.\s*get\s*\(\s*['"]geminiApiKey['"]/,
    /electronStore\s*\.\s*set\s*\(\s*['"]geminiApiKey['"]/,
    /electronStore\s*\.\s*delete\s*\(\s*['"]geminiApiKey['"]/,
    /store\s*\.\s*get\s*\(\s*['"]googleAIStudioApiKey['"]/,
    /store\s*\.\s*set\s*\(\s*['"]googleAIStudioApiKey['"]/,
    /store\s*\.\s*delete\s*\(\s*['"]googleAIStudioApiKey['"]/,
    /store\s*\.\s*get\s*\(\s*['"]geminiApiKey['"]/,
    /store\s*\.\s*set\s*\(\s*['"]geminiApiKey['"]/,
    /store\s*\.\s*delete\s*\(\s*['"]geminiApiKey['"]/,
  ]
  for (const pattern of blockedPatterns) {
    expect(source).not.toMatch(pattern)
  }
}

function expectNoGenericStoreAnthropicCredentialAccess(source: string) {
  const blockedPatterns = [
    /electronStore\s*\.\s*get\s*\(\s*['"]anthropicApiKey['"]/,
    /electronStore\s*\.\s*set\s*\(\s*['"]anthropicApiKey['"]/,
    /electronStore\s*\.\s*delete\s*\(\s*['"]anthropicApiKey['"]/,
    /store\s*\.\s*get\s*\(\s*['"]anthropicApiKey['"]/,
    /store\s*\.\s*set\s*\(\s*['"]anthropicApiKey['"]/,
    /store\s*\.\s*delete\s*\(\s*['"]anthropicApiKey['"]/,
  ]
  for (const pattern of blockedPatterns) {
    expect(source).not.toMatch(pattern)
  }
}

function expectNoGenericStoreDeepSeekCredentialAccess(source: string) {
  const blockedPatterns = [
    /electronStore\s*\.\s*get\s*\(\s*['"]deepSeekApiKey['"]/,
    /electronStore\s*\.\s*set\s*\(\s*['"]deepSeekApiKey['"]/,
    /electronStore\s*\.\s*delete\s*\(\s*['"]deepSeekApiKey['"]/,
    /store\s*\.\s*get\s*\(\s*['"]deepSeekApiKey['"]/,
    /store\s*\.\s*set\s*\(\s*['"]deepSeekApiKey['"]/,
    /store\s*\.\s*delete\s*\(\s*['"]deepSeekApiKey['"]/,
  ]
  for (const pattern of blockedPatterns) {
    expect(source).not.toMatch(pattern)
  }
}

describe('appChatApp OpenRouter C4 exposure baseline', () => {
  it('characterizes active C3 chat/send as using legacy_store credential source without renderer raw apiKey handoff', () => {
    const source = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')

    expect(source).toContain('streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource')
    expect(source).toContain('getOpenRouterBaseUrl')
    expect(source).not.toContain('getOpenRouterApiKey')
    expect(source).not.toMatch(/\bstreamViaOpenRouterAsDomainEvents\s*\(/)
    expect(source).not.toMatch(/\bapiKey\b/)
  })

  it('uses safe OpenRouter credential metadata for renderer baseUrl helper instead of raw store keys', () => {
    const source = readFileSync(resolve(testDir, 'useChatSession.ts'), 'utf8')

    expect(source).toContain('openRouterCredential')
    expect(source).toContain('displayBaseUrl')
    expect(source).not.toContain('openRouterApiKey')
    expect(source).not.toContain('openRouterBaseUrl')
  })

  it('audits renderer production files for generic OpenRouter credential store access after C4', () => {
    const rendererFiles = [
      readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8'),
      readFileSync(resolve(testDir, 'useChatSession.ts'), 'utf8'),
      readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8'),
    ]

    for (const source of rendererFiles) {
      expectNoGenericStoreOpenRouterCredentialAccess(source)
      expectNoGenericStoreOpenAIResponsesCredentialAccess(source)
      expectNoGenericStoreGoogleAIStudioCredentialAccess(source)
      expectNoGenericStoreAnthropicCredentialAccess(source)
      expectNoGenericStoreDeepSeekCredentialAccess(source)
    }
  })

  it('keeps OpenAI Responses experimental send native, explicit, text-only, and renderer-secret-free', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const coordinatorSource = readFileSync(resolve(testDir, 'providerRuntimeSendCoordinator.ts'), 'utf8')
    const settingsSource = readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8')

    expect(appChatSource).toContain('resolveProviderRuntimeTextSendPreflight')
    expect(appChatSource).toContain('sendExperimentalProviderTextChat')
    expect(coordinatorSource).toContain('streamOpenAIResponsesTextChatAsDomainEvents')
    expect(appChatSource).toContain('openAIResponsesChatEnabled')
    expect(coordinatorSource).toContain('getRuntimeTextChatBlockReason')
    expect(coordinatorSource).toContain('resolveRuntimeTextSendRoute')
    expect(coordinatorSource).toContain("case 'openai_responses'")
    expect(settingsSource).toContain('openAIResponsesCredential')
    expect(settingsSource).not.toContain("electronStore.get('openAIResponsesApiKey')")
    expect(settingsSource).not.toContain("electronStore.set('openAIResponsesApiKey'")
    expect(settingsSource).not.toContain('Authorization')
    expect(settingsSource).not.toContain('Bearer')
  })

  it('keeps OpenAI Responses model availability diagnostics on a main-process credential boundary', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const consoleSource = readFileSync(resolve(testDir, '..', 'components', 'ChatSessionConsole.vue'), 'utf8')
    const preloadSource = readRepoFile('electron', 'preload.ts')
    const modelAvailabilityIpc = readRepoFile('electron', 'ipc', 'openAIResponsesModelAvailabilityIpc.ts')

    expect(appChatSource).toContain('openAIResponsesModels')
    expect(appChatSource).toContain('onRefreshOpenAIResponsesModels')
    expect(appChatSource).not.toContain('openAIResponsesApiKey')
    expect(consoleSource).toContain('openai-responses-models-diagnostics')
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('openAIResponsesModels'")
    expect(preloadSource).toContain("ipcRenderer.invoke('openai-responses-models:list-availability'")
    expect(preloadSource).not.toContain('openAIResponsesApiKey')
    expect(modelAvailabilityIpc).toContain('ProviderCredentialService')
    expect(modelAvailabilityIpc).toContain("readApiKey('openai_responses')")
    expect(modelAvailabilityIpc).toContain('payload must not include credentials')
    expect(modelAvailabilityIpc).not.toContain('ipcRenderer')
    expect(modelAvailabilityIpc).not.toContain('contextBridge')
  })

  it('keeps experimental LocalEndpoint chat text-only and blocks high-risk send options before streaming', () => {
    const source = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const coordinatorSource = readFileSync(resolve(testDir, 'providerRuntimeSendCoordinator.ts'), 'utf8')

    expect(source).toContain('resolveProviderRuntimeTextSendPreflight')
    expect(coordinatorSource).toContain('getRuntimeTextChatBlockReason')
    expect(source).toContain('currentRuntimeCapability')
    expect(coordinatorSource).toContain("case 'local_endpoint'")
    expect(source).toContain('sendExperimentalProviderTextChat')
    expect(coordinatorSource).toContain('streamLocalEndpointTextChatAsDomainEvents')
    expect(source).not.toContain('localEndpointApiKey')
    expect(source).not.toContain('localEndpointAuthorization')
    expect(source).not.toContain('localEndpointCustomHeader')
  })

  it('keeps Google AI Studio experimental send native, explicit, text-only, and old-Gemini-runtime-free', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const coordinatorSource = readFileSync(resolve(testDir, 'providerRuntimeSendCoordinator.ts'), 'utf8')
    const settingsSource = readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8')
    const textChatIpcSource = readRepoFile('electron', 'ipc', 'googleAIStudioTextChatIpc.ts')

    expect(coordinatorSource).toContain('streamGoogleAIStudioTextChatAsDomainEvents')
    expect(appChatSource).toContain('googleAIStudioChatEnabled')
    expect(coordinatorSource).toContain('getRuntimeTextChatBlockReason')
    expect(coordinatorSource).toContain("case 'google_ai_studio'")
    expect(textChatIpcSource).toContain('createElectronSessionProviderFetch')
    expect(textChatIpcSource).not.toContain('globalThis.fetch')
    expect(appChatSource).not.toContain('PROVIDERS.GEMINI')
    expect(appChatSource).not.toMatch(/streamVia\w*Gemini/)
    expect(appChatSource).not.toContain('geminiApiKey')
    expect(settingsSource).toContain('googleAIStudioCredential')
    expect(settingsSource).toContain('does not use legacy Gemini runtime')
    expect(settingsSource).not.toContain("electronStore.get('googleAIStudioApiKey')")
    expect(settingsSource).not.toContain("electronStore.set('googleAIStudioApiKey'")
    expect(settingsSource).not.toContain("electronStore.get('geminiApiKey')")
    expect(settingsSource).not.toContain('Authorization')
    expect(settingsSource).not.toContain('Bearer')
  })

  it('keeps Anthropic Messages experimental send native, explicit, text-only, and renderer-secret-free', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const coordinatorSource = readFileSync(resolve(testDir, 'providerRuntimeSendCoordinator.ts'), 'utf8')
    const settingsSource = readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8')

    expect(coordinatorSource).toContain('streamAnthropicTextChatAsDomainEvents')
    expect(appChatSource).toContain('anthropicChatEnabled')
    expect(coordinatorSource).toContain('getRuntimeTextChatBlockReason')
    expect(coordinatorSource).toContain("case 'anthropic_messages'")
    expect(appChatSource).not.toMatch(/streamViaAnthropic\s*\(/)
    expect(appChatSource).not.toContain('anthropicApiKey')
    expect(settingsSource).toContain('anthropicCredential')
    expect(settingsSource).toContain('Native Anthropic Messages text-only path')
    expect(settingsSource).not.toContain("electronStore.get('anthropicApiKey')")
    expect(settingsSource).not.toContain("electronStore.set('anthropicApiKey'")
    expect(settingsSource).not.toContain('Authorization')
    expect(settingsSource).not.toContain('Bearer')
  })

  it('keeps Anthropic model availability diagnostics on a main-process credential boundary', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const consoleSource = readFileSync(resolve(testDir, '..', 'components', 'ChatSessionConsole.vue'), 'utf8')
    const preloadSource = readRepoFile('electron', 'preload.ts')
    const modelAvailabilityIpc = readRepoFile('electron', 'ipc', 'anthropicModelAvailabilityIpc.ts')

    expect(appChatSource).toContain('anthropicModels')
    expect(appChatSource).toContain('onRefreshAnthropicModels')
    expect(appChatSource).not.toContain('anthropicApiKey')
    expect(consoleSource).toContain('anthropic-models-diagnostics')
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('anthropicModels'")
    expect(preloadSource).toContain("ipcRenderer.invoke('anthropic-models:list-availability'")
    expect(preloadSource).not.toContain('anthropicApiKey')
    expect(modelAvailabilityIpc).toContain('ProviderCredentialService')
    expect(modelAvailabilityIpc).toContain("readApiKey('anthropic')")
    expect(modelAvailabilityIpc).toContain('payload must not include credentials')
    expect(modelAvailabilityIpc).toContain('xapikey')
    expect(modelAvailabilityIpc).not.toContain('ipcRenderer')
    expect(modelAvailabilityIpc).not.toContain('contextBridge')
  })

  it('keeps DeepSeek official experimental send native/profile-specific, explicit, text-only, and renderer-secret-free', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const coordinatorSource = readFileSync(resolve(testDir, 'providerRuntimeSendCoordinator.ts'), 'utf8')
    const settingsSource = readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8')

    expect(coordinatorSource).toContain('streamDeepSeekTextChatAsDomainEvents')
    expect(appChatSource).toContain('deepSeekChatEnabled')
    expect(coordinatorSource).toContain('getRuntimeTextChatBlockReason')
    expect(coordinatorSource).toContain("case 'deepseek'")
    expect(appChatSource).not.toMatch(/streamViaDeepSeek\s*\(/)
    expect(appChatSource).not.toContain('deepSeekApiKey')
    expect(appChatSource).not.toContain('streamViaGenericConfig')
    expect(settingsSource).toContain('deepSeekCredential')
    expect(settingsSource).toContain('Native DeepSeek official profile')
    expect(settingsSource).toContain('does not persist reasoning_content')
    expect(settingsSource).not.toContain("electronStore.get('deepSeekApiKey')")
    expect(settingsSource).not.toContain("electronStore.set('deepSeekApiKey'")
    expect(settingsSource).not.toContain('Authorization')
    expect(settingsSource).not.toContain('Bearer')
  })

  it('keeps DeepSeek model availability diagnostics on a main-process credential boundary', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const consoleSource = readFileSync(resolve(testDir, '..', 'components', 'ChatSessionConsole.vue'), 'utf8')
    const preloadSource = readRepoFile('electron', 'preload.ts')
    const modelAvailabilityIpc = readRepoFile('electron', 'ipc', 'deepSeekModelAvailabilityIpc.ts')

    expect(appChatSource).toContain('deepSeekModels')
    expect(appChatSource).toContain('onRefreshDeepSeekModels')
    expect(appChatSource).not.toContain('deepSeekApiKey')
    expect(consoleSource).toContain('deepseek-models-diagnostics')
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('deepSeekModels'")
    expect(preloadSource).toContain("ipcRenderer.invoke('deepseek-models:list-availability'")
    expect(preloadSource).not.toContain('deepSeekApiKey')
    expect(modelAvailabilityIpc).toContain('ProviderCredentialService')
    expect(modelAvailabilityIpc).toContain("readApiKey('deepseek')")
    expect(modelAvailabilityIpc).toContain('payload must not include credentials')
    expect(modelAvailabilityIpc).not.toContain('ipcRenderer')
    expect(modelAvailabilityIpc).not.toContain('contextBridge')
  })

  it('keeps Google AI Studio model availability diagnostics on a main-process credential boundary without legacy Gemini key reuse', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const consoleSource = readFileSync(resolve(testDir, '..', 'components', 'ChatSessionConsole.vue'), 'utf8')
    const preloadSource = readRepoFile('electron', 'preload.ts')
    const modelAvailabilityIpc = readRepoFile('electron', 'ipc', 'googleAIStudioModelAvailabilityIpc.ts')

    expect(appChatSource).toContain('googleAIStudioModels')
    expect(appChatSource).toContain('onRefreshGoogleAIStudioModels')
    expect(appChatSource).not.toContain('googleAIStudioApiKey')
    expect(appChatSource).not.toContain('geminiApiKey')
    expect(consoleSource).toContain('google-ai-studio-models-diagnostics')
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('googleAIStudioModels'")
    expect(preloadSource).toContain("ipcRenderer.invoke('google-ai-studio-models:list-availability'")
    expect(preloadSource).not.toContain('googleAIStudioApiKey')
    expect(preloadSource).not.toContain('geminiApiKey')
    expect(modelAvailabilityIpc).toContain('ProviderCredentialService')
    expect(modelAvailabilityIpc).toContain("readApiKey('google_ai_studio')")
    expect(modelAvailabilityIpc).toContain('payload must not include credentials')
    expect(modelAvailabilityIpc).toContain('geminiapikey')
    expect(modelAvailabilityIpc).not.toContain("store.get('geminiApiKey')")
    expect(modelAvailabilityIpc).not.toContain('ipcRenderer')
    expect(modelAvailabilityIpc).not.toContain('contextBridge')
  })

  it('keeps Anthropic and DeepSeek mutually exclusive with Google AI Studio, OpenAI Responses, and LocalEndpoint modes', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')

    expect(appChatSource).toContain('if (deepSeekChatEnabled.value)')
    expect(appChatSource).toContain('persistDeepSeekChatStorage')
    expect(appChatSource).toContain('onUpdateDeepSeekChatEnabled')
    expect(appChatSource).toContain('onClearDeepSeekChat')
    expect(appChatSource).toContain('settings:deepSeekTextChatUpdated')
    expect(appChatSource).toContain('if (anthropicChatEnabled.value)')
    expect(appChatSource).toContain('openAIResponsesChatEnabled.value = false')
    expect(appChatSource).toContain('googleAIStudioChatEnabled.value = false')
    expect(appChatSource).toContain('localEndpointChatEnabled.value = false')
    expect(appChatSource).toContain('persistAnthropicChatStorage')
    expect(appChatSource).toContain('onUpdateAnthropicChatEnabled')
    expect(appChatSource).toContain('onClearAnthropicChat')
    expect(appChatSource).toContain('settings:anthropicMessagesTextChatUpdated')
  })

  it('audits OpenRouter catalog as resolver-backed and separate from renderer credential exposure', () => {
    const catalogStartup = readRepoFile('electron', 'jobs', 'catalogSyncStartup.ts')

    expect(catalogStartup).toContain('resolveOpenRouterCatalogCredentialFromLegacyStore')
    expect(catalogStartup).not.toContain("store.get('openRouterApiKey')")
    expect(catalogStartup).not.toContain('openRouterCatalogLocalSecret as provider credential')
  })

  it('audits legacy Gemini as runtime-dead after C4 credential filtering', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const settingsSource = readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8')

    expect(appChatSource).not.toContain('PROVIDERS.GEMINI')
    expect(appChatSource).not.toMatch(/streamVia\w*Gemini/)
    expect(appChatSource).not.toContain('geminiApiKey')
    expect(settingsSource).not.toContain('geminiApiKey')
  })
})
