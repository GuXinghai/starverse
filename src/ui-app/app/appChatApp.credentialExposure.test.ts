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
    }
  })

  it('keeps OpenAI Responses experimental send native, explicit, text-only, and renderer-secret-free', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const settingsSource = readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8')

    expect(appChatSource).toContain('streamOpenAIResponsesTextChatAsDomainEvents')
    expect(appChatSource).toContain('openAIResponsesChatEnabled')
    expect(appChatSource).toContain('getOpenAIResponsesTextChatBlockReason')
    expect(appChatSource).toContain('OpenAI Responses experimental text chat is text-only. Remove attachments before sending.')
    expect(appChatSource).toContain('config.webSearch.enabled')
    expect(appChatSource).toContain('config.reasoning.enabled')
    expect(appChatSource).toContain('config.imageGeneration.enabled')
    expect(settingsSource).toContain('openAIResponsesCredential')
    expect(settingsSource).not.toContain("electronStore.get('openAIResponsesApiKey')")
    expect(settingsSource).not.toContain("electronStore.set('openAIResponsesApiKey'")
    expect(settingsSource).not.toContain('Authorization')
    expect(settingsSource).not.toContain('Bearer')
  })

  it('keeps experimental LocalEndpoint chat text-only and blocks high-risk send options before streaming', () => {
    const source = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')

    expect(source).toContain('getLocalEndpointTextChatBlockReason')
    expect(source).toContain('LocalEndpoint text chat is text-only. Remove attachments before sending.')
    expect(source).toContain('config.webSearch.enabled')
    expect(source).toContain('config.reasoning.enabled')
    expect(source).toContain('config.imageGeneration.enabled')
    expect(source).toContain('sendLocalEndpointTextChat')
    expect(source).toContain('streamLocalEndpointTextChatAsDomainEvents')
    expect(source).not.toContain('localEndpointApiKey')
    expect(source).not.toContain('localEndpointAuthorization')
    expect(source).not.toContain('localEndpointCustomHeader')
  })

  it('keeps Google AI Studio experimental send native, explicit, text-only, and old-Gemini-runtime-free', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
    const settingsSource = readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8')

    expect(appChatSource).toContain('streamGoogleAIStudioTextChatAsDomainEvents')
    expect(appChatSource).toContain('googleAIStudioChatEnabled')
    expect(appChatSource).toContain('getGoogleAIStudioTextChatBlockReason')
    expect(appChatSource).toContain('Google AI Studio experimental text chat is text-only. Remove attachments before sending.')
    expect(appChatSource).toContain('config.webSearch.enabled')
    expect(appChatSource).toContain('config.reasoning.enabled')
    expect(appChatSource).toContain('config.imageGeneration.enabled')
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
    const settingsSource = readFileSync(resolve(testDir, '..', 'components', 'SettingsPanel.vue'), 'utf8')

    expect(appChatSource).toContain('streamAnthropicTextChatAsDomainEvents')
    expect(appChatSource).toContain('anthropicChatEnabled')
    expect(appChatSource).toContain('getAnthropicTextChatBlockReason')
    expect(appChatSource).toContain('Anthropic Messages experimental text chat is text-only. Remove attachments before sending.')
    expect(appChatSource).toContain('config.webSearch.enabled')
    expect(appChatSource).toContain('config.reasoning.enabled')
    expect(appChatSource).toContain('config.imageGeneration.enabled')
    expect(appChatSource).not.toMatch(/streamViaAnthropic\s*\(/)
    expect(appChatSource).not.toContain('anthropicApiKey')
    expect(settingsSource).toContain('anthropicCredential')
    expect(settingsSource).toContain('Native Anthropic Messages text-only path')
    expect(settingsSource).not.toContain("electronStore.get('anthropicApiKey')")
    expect(settingsSource).not.toContain("electronStore.set('anthropicApiKey'")
    expect(settingsSource).not.toContain('Authorization')
    expect(settingsSource).not.toContain('Bearer')
  })

  it('keeps Anthropic mutually exclusive with Google AI Studio, OpenAI Responses, and LocalEndpoint modes', () => {
    const appChatSource = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')

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
