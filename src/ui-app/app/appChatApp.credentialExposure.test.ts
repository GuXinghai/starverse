import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
function readRepoFile(...segments: string[]): string {
  return readFileSync(resolve(testDir, '..', '..', '..', ...segments), 'utf8')
}
function expectNoGenericCredentialStoreAccess(source: string) {
  for (const key of ['openRouterApiKey', 'openAIResponsesApiKey', 'googleAIStudioApiKey', 'geminiApiKey',
    'anthropicApiKey', 'deepSeekApiKey']) {
    expect(source).not.toMatch(new RegExp(`(?:electronStore|store)\\s*\\.\\s*(?:get|set|delete)\\s*\\(\\s*['"]${key}['"]`))
  }
}

describe('AppChatApp Generation V2 credential exposure boundary', () => {
  const app = () => readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')
  const settings = () => readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
  const preload = () => readRepoFile('electron', 'preload.ts')
  const registration = () => readRepoFile('electron', 'ipc', 'generationV2IpcRegistration.ts')
  const availability = () => readRepoFile('electron', 'ipc', 'generationV2ModelAvailabilityIpc.ts')

  it('routes all renderer generation through fixed V2 commands without raw credential arguments', () => {
    const source = app()
    expect(source).toContain('submitGenerationV2Initial')
    expect(source).toContain('subscribeGenerationV2Runtime')
    expect(source).not.toMatch(/\bapiKey\s*:/)
    expect(source).not.toContain('LegacyStoreCredentialSource')
  })

  it('uses fixed credential bridges for settings rather than generic store keys', () => {
    const source = settings()
    expect(source).toContain('generationV2?.credentials?.openRouter')
    expect(source).toContain('generationV2?.credentials?.openAIResponses')
    expect(source).toContain('generationV2?.credentials?.googleAIStudio')
    expect(source).toContain('generationV2?.credentials?.anthropic')
    expect(source).toContain('generationV2?.credentials?.deepSeek')
    expectNoGenericCredentialStoreAccess(source)
  })

  it('keeps renderer production files free of direct provider credential storage access', () => {
    for (const source of [app(), settings(), readFileSync(resolve(testDir, 'useChatSession.ts'), 'utf8')]) {
      expectNoGenericCredentialStoreAccess(source)
      expect(source).not.toContain('epoch2RuntimeCredentialService')
      expect(source).not.toContain('withCredential(')
    }
  })

  it('keeps OpenAI Responses on its native V2 runtime and main-owned credential lease', () => {
    const runner = readRepoFile('electron', 'services', 'openAIResponsesStreamRunnerV2.ts')
    expect(registration()).toContain('createOpenAIResponsesGenerationV2Runtime')
    expect(runner).toContain("providerKey: 'openai_responses'")
    expect(runner).toContain('withCredential')
    expect(runner).not.toContain('ipcRenderer')
  })

  it('keeps OpenAI Responses model availability on the shared main-process authority', () => {
    expect(preload()).toContain("listOpenAIResponses: (payload?: unknown) => ipcRenderer.invoke('openai-responses-models:list-availability'")
    expect(availability()).toContain('ProviderCatalogAuthorityRegistryV2')
    expect(availability()).toContain('withCredential')
    expect(availability()).not.toContain('contextBridge')
  })

  it('keeps Generic/local runtime on explicit local profiles without cloud credentials', () => {
    const runtime = readRepoFile('electron', 'services', 'genericLocalOpenAIChatGenerationV2Runtime.ts')
    expect(registration()).toContain('createGenericLocalOpenAIChatGenerationV2Runtime')
    expect(registration()).toContain('fetchImpl: input.localDirectFetch')
    expect(runtime).not.toContain('Epoch2RuntimeCredentialService')
    expect(runtime).not.toContain('withCredential')
  })

  it('keeps Google AI Studio on independent GenerateContent and Interactions V2 runtimes', () => {
    const textRunner = readRepoFile('electron', 'services', 'geminiGenerateContentStreamRunnerV2.ts')
    const imageRunner = readRepoFile('electron', 'services', 'geminiInteractionsImageStreamRunnerV2.ts')
    expect(registration()).toContain('createGeminiGenerateContentGenerationV2Runtime')
    expect(registration()).toContain('createGeminiInteractionsImageGenerationV2Runtime')
    expect(textRunner).toContain("providerKey: 'google_ai_studio'")
    expect(imageRunner).toContain("providerKey: 'google_ai_studio'")
    expect(app()).not.toContain('geminiApiKey')
  })

  it('keeps Anthropic Messages on its native V2 runtime and main-owned credential lease', () => {
    const runner = readRepoFile('electron', 'services', 'anthropicMessagesStreamRunnerV2.ts')
    expect(registration()).toContain('createAnthropicGenerationV2Runtime')
    expect(runner).toContain("getStatus('anthropic')")
    expect(runner).toContain("providerKey: 'anthropic'")
    expect(runner).not.toContain('ipcRenderer')
  })

  it('keeps Anthropic model availability behind the same main-process credential authority', () => {
    expect(preload()).toContain("listAnthropic: (payload?: unknown) => ipcRenderer.invoke('anthropic-models:list-availability'")
    expect(availability()).toContain('ProviderCatalogAuthorityRegistryV2')
    expect(availability()).toContain('withCredential')
  })

  it('keeps DeepSeek on its official stable V2 contract and main-owned credential lease', () => {
    const runner = readRepoFile('electron', 'services', 'deepSeekInitialStreamRunnerV2.ts')
    expect(registration()).toContain('createDeepSeekGenerationV2Runtime')
    expect(runner).toContain("getStatus('deepseek')")
    expect(runner).toContain("providerKey: 'deepseek'")
    expect(runner).not.toContain('ipcRenderer')
  })

  it('keeps DeepSeek model availability behind the same main-process credential authority', () => {
    expect(preload()).toContain("listDeepSeek: (payload?: unknown) => ipcRenderer.invoke('deepseek-models:list-availability'")
    expect(availability()).toContain('ProviderCatalogAuthorityRegistryV2')
    expect(availability()).toContain('withCredential')
  })

  it('keeps Google AI Studio model availability separate from legacy Gemini keys', () => {
    expect(preload()).toContain("listGoogleAIStudio: (payload?: unknown) => ipcRenderer.invoke('google-ai-studio-models:list-availability'")
    expect(availability()).toContain('ProviderCatalogAuthorityRegistryV2')
    expect(availability()).not.toContain("store.get('geminiApiKey')")
  })

  it('retains the mutually exclusive provider-mode UI controls', () => {
    const providerSettings = readFileSync(resolve(testDir, 'useExperimentalProviderChatSettings.ts'), 'utf8')
    for (const key of ['openAIResponsesChatEnabled', 'googleAIStudioChatEnabled', 'anthropicChatEnabled',
      'deepSeekChatEnabled', 'localEndpointChatEnabled']) expect(providerSettings).toContain(key)
    expect(providerSettings).toContain('persistAnthropicChatStorage')
    expect(providerSettings).toContain('persistDeepSeekChatStorage')
  })

  it('keeps OpenRouter catalog on the V2 model authority and runtime credential resolver', () => {
    expect(preload()).toContain("listOpenRouter: (payload?: unknown) => ipcRenderer.invoke('generation-v2:openrouter-models:list'")
    expect(availability()).toContain('ProviderCatalogAuthorityRegistryV2')
    expect(availability()).toContain('withCredential')
    expect(availability()).not.toContain("store.get('openRouterApiKey')")
  })

  it('keeps legacy Gemini runtime and credential names out of the active renderer', () => {
    expect(app()).not.toContain('PROVIDERS.GEMINI')
    expect(app()).not.toMatch(/streamVia\w*Gemini/)
    expect(app()).not.toContain('geminiApiKey')
    expect(settings()).not.toContain("electronStore.get('geminiApiKey')")
  })
})
