import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..', '..', '..')

const productionRoots = [
  join(repoRoot, 'src'),
  join(repoRoot, 'electron'),
] as const

const registryPlaceholderNames = [
  'EndpointRegistry',
  'ProviderRegistry',
  'RuntimeProviderRegistry',
  'ModelSourceRegistry',
  'EndpointRegistryService',
  'ProviderRegistryService',
  'RuntimeProviderRegistryService',
  'ModelSourceRegistryService',
  'RuntimeManager',
  'EndpointManager',
  'ProviderManager',
  'endpointRegistry',
  'providerRegistry',
  'runtimeProviderRegistry',
  'modelSourceRegistry',
  'endpointRegistryService',
  'providerRegistryService',
  'runtimeProviderRegistryService',
  'modelSourceRegistryService',
  'runtimeManager',
  'endpointManager',
  'providerManager',
] as const

const localEndpointRuntimeNames = [
  'LocalEndpointRuntime',
  'LocalEndpointSettings',
  'LocalEndpointCredential',
  'localEndpointCredential',
  'localAdminToken',
  'enterpriseToken',
  'enterpriseGateway',
  'customHeader',
  'customHeaders',
  'secretHeader',
  'secretHeaders',
] as const

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(repoRoot, ...segments), 'utf8')
}

function collectProductionSourceFiles(): string[] {
  const files: string[] = []
  const stack = [...productionRoots]

  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!/\.(?:ts|tsx|vue)$/i.test(entry)) continue
      if (/\.test\.(?:ts|tsx)$/i.test(entry)) continue
      files.push(fullPath)
    }
  }

  return files
}

function repoRelative(file: string): string {
  return relative(repoRoot, file).split('\\').join('/')
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function productionOccurrences(pattern: RegExp): string[] {
  const matches: string[] = []
  for (const file of collectProductionSourceFiles()) {
    const source = stripComments(readFileSync(file, 'utf8'))
    if (pattern.test(source)) {
      matches.push(repoRelative(file))
    }
  }
  return matches.sort()
}

function expectNoRegistryPlaceholder(source: string): void {
  for (const name of registryPlaceholderNames) {
    expect(source).not.toContain(name)
  }
}

function expectNoLocalEndpointRuntimeIdentifier(source: string): void {
  for (const name of localEndpointRuntimeNames) {
    expect(source).not.toContain(name)
  }
}

describe('C5 endpoint registry baseline characterization', () => {
  it('has no production endpoint/provider registry placeholder implementation', () => {
    const pattern = new RegExp(`\\b(?:${registryPlaceholderNames.join('|')})\\b`)

    expect(productionOccurrences(pattern)).toEqual([])
  })

  it('keeps active OpenRouter chat/send on the first-class service-backed credential source, not a registry route', () => {
    const appChat = readRepoFile('src', 'ui-app', 'app', 'appChatApp.logic.ts')
    const adapter = readRepoFile('src', 'next', 'provider', 'openrouter', 'openRouterAdapter.ts')
    const liveStream = readRepoFile('src', 'next', 'live', 'openRouterLiveStream.ts')
    const bridge = readRepoFile('electron', 'ipc', 'openRouterStreamBridge.ts')

    expect(appChat).toContain('streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource')
    expect(appChat).not.toMatch(/\bstreamViaOpenRouterAsDomainEvents\s*\(/)
    expect(adapter).toContain("credentialSource: 'legacy_store' as const")
    expect(liveStream).toContain("credentialSource === 'legacy_store'")
    expect(liveStream).toContain('...(credentialSource ? {} : options.config.baseUrl ? { baseUrl: options.config.baseUrl } : {})')
    expect(bridge).toContain("credentialService.readApiKey('openrouter')")
    expect(bridge).not.toContain('resolveOpenRouterChatCredentialFromLegacyStore')

    for (const source of [appChat, adapter, liveStream, bridge]) {
      expectNoRegistryPlaceholder(source)
    }
  })

  it('keeps OpenRouter catalog sync on resolver-backed legacy store source without endpoint registry routing', () => {
    const catalogStartup = readRepoFile('electron', 'jobs', 'catalogSyncStartup.ts')
    const catalogCredential = readRepoFile('electron', 'jobs', 'openRouterCatalogCredential.ts')

    expect(catalogStartup).toContain('resolveOpenRouterCatalogCredentialFromLegacyStore')
    expect(catalogCredential).toContain('openrouter-catalog-legacy-store')
    expect(catalogStartup).not.toContain("store.get('openRouterApiKey')")
    expect(catalogStartup).not.toContain("store.get('openRouterBaseUrl')")

    for (const source of [catalogStartup, catalogCredential]) {
      expectNoRegistryPlaceholder(source)
    }
  })

  it('allows only behavior-backed OpenRouter endpoint metadata, not a generic registry UI', () => {
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const credentialIpc = readRepoFile('electron', 'ipc', 'openRouterCredentialSettingsIpc.ts')

    expect(settings).toContain('openRouterCredential')
    expect(settings).toContain('getStatus')
    expect(settings).toContain('update')
    expect(settings).toContain('clear')
    expect(settings).not.toContain("electronStore.get('openRouterApiKey')")
    expect(settings).not.toContain("electronStore.get('openRouterBaseUrl')")
    expect(settings).not.toMatch(/endpointId\s*=/)
    expect(settings).not.toMatch(/profileId\s*=/)
    expect(settings).not.toMatch(/\{\s*endpointId\s*\}/)
    expect(settings).not.toMatch(/\{\s*profileId\s*\}/)
    expect(settings).not.toMatch(/v-model\s*=\s*["'](?:endpointId|profileId)[^"']*["']/i)
    expect(settings).not.toContain('EndpointRegistry')
    expect(settings).not.toContain('ProviderRegistry')
    expect(settings).toContain('settings-openrouter-endpoint-metadata')
    expect(credentialIpc).toContain('ProviderCredentialStatusSource')
    expect(credentialIpc).toContain('credentialStatus.source')
    expect(credentialIpc).toContain("kind: 'openrouter_endpoint'")
    expect(credentialIpc).toContain('buildOpenRouterEndpointMetadataFromLegacyStoreState')
    expect(credentialIpc).toContain('endpointStatus')
    expect(credentialIpc).toContain("'openrouter-official'")
    expect(credentialIpc).toContain("'openrouter-custom-legacy-store'")
    expect(credentialIpc).toContain("'openrouter_v1_chat'")
    expect(credentialIpc).toContain('OPENROUTER_CHAT_LEGACY_CREDENTIAL_METADATA_REF')
    expect(credentialIpc).toContain('OPENROUTER_CATALOG_LEGACY_CREDENTIAL_METADATA_REF')
    expect(credentialIpc).toContain('OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY')

    for (const source of [settings, credentialIpc]) {
      expectNoRegistryPlaceholder(source)
    }
  })

  it('keeps Generic endpoint config and fixture metadata out of active production routing', () => {
    const genericPattern = /\b(?:GenericEndpointConfig|GenericEndpointFixtureMetadata|toGenericEndpointFixtureMetadata|streamViaGenericConfig|streamViaGeneric)\b/
    const occurrences = productionOccurrences(genericPattern)

    expect(occurrences).toEqual([
      'src/next/provider/generic/genericAdapter.ts',
      'src/next/provider/generic/genericEndpointConfig.ts',
    ])

    const genericAdapter = readRepoFile('src', 'next', 'provider', 'generic', 'genericAdapter.ts')
    const genericConfig = readRepoFile('src', 'next', 'provider', 'generic', 'genericEndpointConfig.ts')
    expect(genericAdapter).toContain('Config-based fixture entrypoint')
    expect(genericAdapter).toContain('Core streaming implementation')
    expect(genericConfig).toContain('GenericEndpointConfig')
    expect(genericConfig).toContain('GenericEndpointFixtureMetadata')
    expect(genericConfig).toContain('toGenericEndpointFixtureMetadata')
    expect(genericConfig).toContain("kind: 'generic_endpoint_fixture'")
    expect(genericConfig).toContain('fixtureOnly: true')
    expect(genericConfig).toContain('rendererVisible: false')
    expect(genericConfig).toContain('credentialRef')

    const appChat = readRepoFile('src', 'ui-app', 'app', 'appChatApp.logic.ts')
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const preload = readRepoFile('electron', 'preload.ts')
    const liveStream = readRepoFile('src', 'next', 'live', 'openRouterLiveStream.ts')
    const bridge = readRepoFile('electron', 'ipc', 'openRouterStreamBridge.ts')
    const catalogStartup = readRepoFile('electron', 'jobs', 'catalogSyncStartup.ts')

    for (const source of [appChat, settings, preload, liveStream, bridge, catalogStartup]) {
      expect(source).not.toContain('GenericEndpointFixtureMetadata')
      expect(source).not.toContain('toGenericEndpointFixtureMetadata')
      expect(source).not.toContain('generic_endpoint_fixture')
    }
  })

  it('locks C5 closeout readiness without endpoint registry routing or exposed secret surfaces', () => {
    const appChat = readRepoFile('src', 'ui-app', 'app', 'appChatApp.logic.ts')
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const preload = readRepoFile('electron', 'preload.ts')
    const storeIpc = readRepoFile('electron', 'ipc', 'storeIpc.ts')
    const credentialIpc = readRepoFile('electron', 'ipc', 'openRouterCredentialSettingsIpc.ts')
    const genericConfig = readRepoFile('src', 'next', 'provider', 'generic', 'genericEndpointConfig.ts')

    expect(appChat).toContain('streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource')
    expect(appChat).not.toMatch(/GenericEndpoint(?:Config|FixtureMetadata)/)
    expect(appChat).not.toMatch(/\b(?:EndpointRegistry|ProviderRegistry|RuntimeProviderRegistry)\b/)

    expect(settings).toContain('settings-openrouter-endpoint-metadata')
    expect(settings).toContain('openRouterCredential')
    expect(settings).not.toContain('GenericEndpointFixtureMetadata')
    expect(settings).not.toContain('generic_endpoint_fixture')
    expect(settings).not.toMatch(/\b(?:endpointRegistry|providerRegistry|runtimeProviderRegistry)\b/)

    expect(preload).toContain("contextBridge.exposeInMainWorld('openRouterCredential'")
    expect(preload).not.toContain('getEndpointMetadata')
    expect(preload).not.toContain('credentialResolver')
    expect(preload).not.toContain('secretStore')
    expect(preload).not.toMatch(/\b(?:EndpointRegistry|ProviderRegistry|RuntimeProviderRegistry)\b/)

    expect(storeIpc).toContain('RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS')
    expect(storeIpc).toContain('store-clear-safe')
    expect(storeIpc).toContain("'openRouterApiKey'")
    expect(storeIpc).toContain("'openRouterBaseUrl'")
    expect(storeIpc).toContain("'geminiApiKey'")

    expect(credentialIpc).toContain("kind: 'openrouter_endpoint'")
    expect(credentialIpc).toContain("rendererVisible: true")
    expect(credentialIpc).toContain('ProviderCredentialStatusSource')
    expect(credentialIpc).toContain('credentialStatus.source')
    expect(credentialIpc).toContain('credentialRef')
    expect(credentialIpc).toContain('catalogCredentialRef')
    expect(credentialIpc).not.toMatch(/\b(?:EndpointRegistry|ProviderRegistry|RuntimeProviderRegistry)\b/)

    expect(genericConfig).toContain("kind: 'generic_endpoint_fixture'")
    expect(genericConfig).toContain('fixtureOnly: true')
    expect(genericConfig).toContain('rendererVisible: false')
  })

  it('keeps provider credential boundary as non-secret boundary pieces without secure-store production implementation', () => {
    const credentialSources = [
      readRepoFile('src', 'next', 'provider', 'credentials', 'providerCredential.ts'),
      readRepoFile('src', 'next', 'provider', 'credentials', 'providerCredentialResolver.ts'),
      readRepoFile('src', 'next', 'provider', 'credentials', 'providerCredentialStore.ts'),
      readRepoFile('src', 'next', 'provider', 'credentials', 'providerCredentialMetadata.ts'),
    ].join('\n')

    expect(credentialSources).toContain("kind: 'credential_ref'")
    expect(credentialSources).toContain('ProviderCredentialResolver')
    expect(credentialSources).toContain('ProviderCredentialStore')
    const uncommented = stripComments(credentialSources)
    expect(uncommented).not.toMatch(/\b(?:keytar|safeStorage|osKeychain|secureStore|encryptedCredentialStore)\b/i)
    expect(uncommented).not.toMatch(/from\s+['"]electron-store['"]/)
    expect(uncommented).not.toContain('ipcRenderer')
    expect(uncommented).not.toContain('ipcMain')
  })

  it('keeps legacy Gemini runtime-dead while credential keys remain blocked from generic renderer store IPC', () => {
    const appChat = readRepoFile('src', 'ui-app', 'app', 'appChatApp.logic.ts')
    const liveStream = readRepoFile('src', 'next', 'live', 'openRouterLiveStream.ts')
    const bridge = readRepoFile('electron', 'ipc', 'openRouterStreamBridge.ts')
    const storeIpc = readRepoFile('electron', 'ipc', 'storeIpc.ts')

    for (const source of [appChat, liveStream, bridge]) {
      expect(source).not.toContain('PROVIDERS.GEMINI')
      expect(source).not.toContain('geminiApiKey')
      expect(source).not.toMatch(/streamVia\w*Gemini/)
    }

    expect(storeIpc).toContain("'geminiApiKey'")
    expect(storeIpc).toContain("'apiKey'")
    expect(storeIpc).toContain('RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS')
  })
})

describe('C6 local endpoint baseline characterization', () => {
  it('keeps OpenRouter as an explicit active send runtime while LocalEndpoint text chat remains explicit experimental routing', () => {
    const appChat = readRepoFile('src', 'ui-app', 'app', 'appChatApp.logic.ts')
    const openRouterAdapter = readRepoFile('src', 'next', 'provider', 'openrouter', 'openRouterAdapter.ts')
    const liveStream = readRepoFile('src', 'next', 'live', 'openRouterLiveStream.ts')
    const bridge = readRepoFile('electron', 'ipc', 'openRouterStreamBridge.ts')

    expect(appChat).toContain('streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource')
    expect(appChat).toContain('streamLocalEndpointTextChatAsDomainEvents')
    expect(appChat).toContain('deriveCurrentRuntimeSelection')
    expect(appChat).toContain('resolveRuntimeTextSendRoute')
    expect(appChat).toContain('openRouterChatEnabled')
    expect(appChat).toContain('localEndpointChatEnabled')
    expect(openRouterAdapter).toContain("credentialSource: 'legacy_store' as const")
    expect(liveStream).toContain("credentialSource === 'legacy_store'")
    expect(bridge).toContain("credentialService.readApiKey('openrouter')")
    expect(bridge).not.toContain('resolveOpenRouterChatCredentialFromLegacyStore')

    expect(appChat).not.toMatch(/\bstreamVia(?:Generic|DeepSeek|OpenAIResponses|Anthropic|Gemini)\b/)
    expect(appChat).not.toMatch(/\b(?:RuntimeProviderRegistry|ProviderRegistry|EndpointRegistry)\b/)
  })

  it('keeps Generic OpenAI-compatible confined to fixture/provider tests and out of live surfaces', () => {
    const genericPattern = /\b(?:GenericEndpointConfig|GenericEndpointFixtureMetadata|toGenericEndpointFixtureMetadata|streamViaGenericConfig|streamViaGeneric)\b/
    const occurrences = productionOccurrences(genericPattern)

    expect(occurrences).toEqual([
      'src/next/provider/generic/genericAdapter.ts',
      'src/next/provider/generic/genericEndpointConfig.ts',
    ])

    const liveSurfaces = [
      readRepoFile('src', 'ui-app', 'app', 'appChatApp.logic.ts'),
      readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue'),
      readRepoFile('electron', 'preload.ts'),
      readRepoFile('electron', 'ipc', 'registerIpc.ts'),
      readRepoFile('electron', 'ipc', 'openRouterStreamBridge.ts'),
      readRepoFile('electron', 'jobs', 'catalogSyncStartup.ts'),
    ]

    for (const source of liveSurfaces) {
      expect(source).not.toContain('GenericEndpointFixtureMetadata')
      expect(source).not.toContain('toGenericEndpointFixtureMetadata')
      expect(source).not.toContain('generic_endpoint_fixture')
      expect(source).not.toMatch(/\bstreamViaGeneric(?:Config)?\b/)
    }
  })

  it('allows only diagnostics and explicit experimental text chat LocalEndpoint surfaces, not registry, catalog, or Send Plan routing', () => {
    const localPattern = new RegExp(`\\b(?:${localEndpointRuntimeNames.join('|')})\\b`)

    expect(productionOccurrences(localPattern)).toEqual([])

    const activeSurfaces = [
      readRepoFile('src', 'ui-app', 'app', 'useChatSession.ts'),
      readRepoFile('electron', 'ipc', 'storeIpc.ts'),
      readRepoFile('src', 'shared', 'modelCatalog', 'internalSchema.ts'),
      readRepoFile('src', 'shared', 'modelCatalog', 'catalogSyncJob.ts'),
      readRepoFile('src', 'next', 'files', 'sendPlanClient.ts'),
    ]

    for (const source of activeSurfaces) {
      expectNoLocalEndpointRuntimeIdentifier(source)
      expect(source).not.toMatch(/\b(?:healthProbe|basicStreamProbe|listModelsProbe)\b/)
    }

    const diagnosticsIpc = readRepoFile('electron', 'ipc', 'localEndpointDiagnosticsIpc.ts')
    const textChatIpc = readRepoFile('electron', 'ipc', 'localEndpointTextChatIpc.ts')
    const textChatLive = readRepoFile('src', 'next', 'live', 'localEndpointTextChat.ts')
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const console = readRepoFile('src', 'ui-app', 'components', 'ChatSessionConsole.vue')
    const preload = readRepoFile('electron', 'preload.ts')

    expect(diagnosticsIpc).toContain('local-endpoint-diagnostics:probe')
    expect(diagnosticsIpc).toContain("chatSendAvailable: false")
    expect(textChatIpc).toContain('local-endpoint-chat:stream-text')
    expect(textChatIpc).toContain('validateLocalEndpointProbeUrl')
    expect(textChatIpc).not.toMatch(/\b(?:Authorization|Bearer|customHeader|localAdminToken)\b/)
    expect(textChatLive).toContain('streamLocalEndpointTextChatAsDomainEvents')
    expect(textChatLive).not.toContain('GenericEndpoint')
    expect(settings).toContain('settings-local-endpoint-diagnostics')
    expect(settings).toContain('Text chat requires the explicit LocalEndpoint console mode')
    expect(console).toContain('local-endpoint-chat-controls')
    expect(console).not.toContain('ModelPickerDialog')
    expect(preload).toContain("contextBridge.exposeInMainWorld('localEndpointDiagnostics'")
    expect(preload).toContain("contextBridge.exposeInMainWorld('localEndpointChat'")
    expect(preload).not.toContain('localAdminToken')
    expect(preload).not.toContain('customHeader')
  })

  it('does not expose local, enterprise, custom-header, or generic secret surfaces to renderer', () => {
    const rendererSurfaces = [
      readRepoFile('electron', 'preload.ts'),
      readRepoFile('electron', 'electron-env.d.ts'),
      readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue'),
      readRepoFile('src', 'ui-app', 'app', 'useChatSession.ts'),
    ].join('\n')

    expect(rendererSurfaces).toContain('openRouterCredential')
    expect(rendererSurfaces).toContain('localEndpointDiagnostics')
    expect(rendererSurfaces).not.toMatch(/\b(?:localAdminToken|enterpriseToken|customHeaders?|secretHeaders?)\b/)
    expect(rendererSurfaces).not.toMatch(/\b(?:Authorization|Bearer)\b/)
    expect(rendererSurfaces).not.toMatch(/\b(?:credentialResolver|secretStore|genericSecretStore)\b/)
    expect(rendererSurfaces).not.toMatch(/\b(?:endpointRegistry|providerRegistry|runtimeProviderRegistry)\b/)
  })

  it('keeps model catalog/listModels and Send Plan touchpoints OpenRouter-scoped before C6 implementation', () => {
    const catalogSchema = readRepoFile('src', 'shared', 'modelCatalog', 'internalSchema.ts')
    const openRouterCatalog = readRepoFile('src', 'shared', 'modelCatalog', 'openRouterCatalogClient.ts')
    const catalogSync = readRepoFile('src', 'shared', 'modelCatalog', 'catalogSyncJob.ts')
    const sendPlanClient = readRepoFile('src', 'next', 'files', 'sendPlanClient.ts')
    const openRouterSendPlan = readRepoFile('src', 'next', 'openrouter', 'openRouterSendPlanSerializer.ts')

    expect(catalogSchema).toContain('export interface ProviderAdapter')
    expect(openRouterCatalog).toContain('class OpenRouterCatalogClient implements ProviderAdapter')
    expect(openRouterCatalog).toContain('async listModels')
    expect(catalogSync).toContain('OpenRouterCatalogClient')
    expect(sendPlanClient).toContain('SendPlanProviderContext')
    expect(openRouterSendPlan).toContain('serializeSendPlanForOpenRouter')

    for (const source of [catalogSchema, openRouterCatalog, catalogSync, sendPlanClient, openRouterSendPlan]) {
      expectNoRegistryPlaceholder(source)
      expectNoLocalEndpointRuntimeIdentifier(source)
    }
  })
})

describe('R2 DeepSeek provider model source guardrails', () => {
  it('keeps DeepSeek official model availability separate from OpenRouter catalog and Generic live routing', () => {
    const deepSeekModelSource = readRepoFile('src', 'next', 'provider', 'deepseek', 'deepSeekModelSource.ts')
    const deepSeekModelIpc = readRepoFile('electron', 'ipc', 'deepSeekModelAvailabilityIpc.ts')
    const preload = readRepoFile('electron', 'preload.ts')
    const console = readRepoFile('src', 'ui-app', 'components', 'ChatSessionConsole.vue')
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const openRouterCatalog = readRepoFile('src', 'shared', 'modelCatalog', 'openRouterCatalogClient.ts')
    const catalogSync = readRepoFile('src', 'shared', 'modelCatalog', 'catalogSyncJob.ts')
    const catalogQueryService = readRepoFile('src', 'next', 'modelCatalog', 'catalogQueryService.ts')

    expect(deepSeekModelSource).toContain("DEEPSEEK_MODELS_DEFAULT_BASE_URL = 'https://api.deepseek.com'")
    expect(deepSeekModelSource).toContain('listDeepSeekProviderModelAvailability')
    expect(deepSeekModelSource).toContain('/models')
    expect(deepSeekModelSource).toContain("providerKey: typeof DEEPSEEK_OFFICIAL_PROVIDER_KEY")
    expect(deepSeekModelSource).toContain("'deepseek-official'")
    expect(deepSeekModelSource).toContain("'deepseek_official_openai_compat'")
    expect(deepSeekModelIpc).toContain('ProviderCredentialService')
    expect(deepSeekModelIpc).toContain("readApiKey('deepseek')")
    expect(deepSeekModelIpc).toContain('payload must not include credentials')
    expect(preload).toContain("contextBridge.exposeInMainWorld('deepSeekModels'")
    expect(console).toContain('deepseek-models-diagnostics')
    expect(settings).toContain('Use Console refresh for official availability diagnostics')

    for (const source of [deepSeekModelSource, deepSeekModelIpc, preload, console, settings]) {
      expectNoRegistryPlaceholder(source)
      expect(source).not.toMatch(/\b(?:GenericEndpointConfig|GenericEndpointFixtureMetadata|toGenericEndpointFixtureMetadata|streamViaGenericConfig|streamViaGeneric)\b/)
    }

    for (const source of [openRouterCatalog, catalogSync, catalogQueryService]) {
      expect(source).not.toContain('deepSeekModelSource')
      expect(source).not.toContain('ProviderModelAvailability')
      expect(source).not.toContain('deepseek-v4-flash')
      expect(source).not.toContain('deepseek-v4-pro')
      expect(source).not.toContain('deepseek-chat')
      expect(source).not.toContain('deepseek-reasoner')
    }
  })
})

describe('R3 Gemini provider model source guardrails', () => {
  it('keeps Google AI Studio model availability separate from OpenRouter catalog, Generic live routing, and legacy Gemini runtime', () => {
    const geminiModelSource = readRepoFile('src', 'next', 'provider', 'gemini', 'geminiModelSource.ts')
    const googleModelIpc = readRepoFile('electron', 'ipc', 'googleAIStudioModelAvailabilityIpc.ts')
    const preload = readRepoFile('electron', 'preload.ts')
    const console = readRepoFile('src', 'ui-app', 'components', 'ChatSessionConsole.vue')
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const openRouterCatalog = readRepoFile('src', 'shared', 'modelCatalog', 'openRouterCatalogClient.ts')
    const catalogSync = readRepoFile('src', 'shared', 'modelCatalog', 'catalogSyncJob.ts')
    const catalogQueryService = readRepoFile('src', 'next', 'modelCatalog', 'catalogQueryService.ts')

    expect(geminiModelSource).toContain("GEMINI_MODELS_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'")
    expect(geminiModelSource).toContain('listGeminiProviderModelAvailability')
    expect(geminiModelSource).toContain('/v1beta/models')
    expect(geminiModelSource).toContain("providerKey: typeof GOOGLE_AI_STUDIO_PROVIDER_KEY")
    expect(geminiModelSource).toContain("'google-ai-studio-official'")
    expect(geminiModelSource).toContain("'gemini_api_v1'")
    expect(googleModelIpc).toContain('ProviderCredentialService')
    expect(googleModelIpc).toContain("readApiKey('google_ai_studio')")
    expect(googleModelIpc).toContain('payload must not include credentials')
    expect(googleModelIpc).toContain('geminiapikey')
    expect(googleModelIpc).not.toContain("store.get('geminiApiKey')")
    expect(preload).toContain("contextBridge.exposeInMainWorld('googleAIStudioModels'")
    expect(console).toContain('google-ai-studio-models-diagnostics')
    expect(settings).toContain('Use Console refresh for official availability diagnostics')

    for (const source of [geminiModelSource, googleModelIpc, preload, console, settings]) {
      expectNoRegistryPlaceholder(source)
      expect(source).not.toMatch(/\b(?:GenericEndpointConfig|GenericEndpointFixtureMetadata|toGenericEndpointFixtureMetadata|streamViaGenericConfig|streamViaGeneric)\b/)
    }

    for (const source of [openRouterCatalog, catalogSync, catalogQueryService]) {
      expect(source).not.toContain('geminiModelSource')
      expect(source).not.toContain('GeminiProviderModelAvailability')
      expect(source).not.toContain('gemini-2.5-flash')
      expect(source).not.toContain('gemini-2.5-pro')
    }
  })
})

describe('R4 OpenAI Responses provider model source guardrails', () => {
  it('keeps OpenAI Responses model availability separate from OpenRouter catalog and Generic live routing', () => {
    const openAIModelSource = readRepoFile('src', 'next', 'provider', 'openai-responses', 'openAIResponsesModelSource.ts')
    const openAIModelIpc = readRepoFile('electron', 'ipc', 'openAIResponsesModelAvailabilityIpc.ts')
    const preload = readRepoFile('electron', 'preload.ts')
    const console = readRepoFile('src', 'ui-app', 'components', 'ChatSessionConsole.vue')
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const openRouterCatalog = readRepoFile('src', 'shared', 'modelCatalog', 'openRouterCatalogClient.ts')
    const catalogSync = readRepoFile('src', 'shared', 'modelCatalog', 'catalogSyncJob.ts')
    const catalogQueryService = readRepoFile('src', 'next', 'modelCatalog', 'catalogQueryService.ts')

    expect(openAIModelSource).toContain("OPENAI_MODELS_DEFAULT_BASE_URL = 'https://api.openai.com/v1'")
    expect(openAIModelSource).toContain('listOpenAIProviderModelAvailability')
    expect(openAIModelSource).toContain('/models')
    expect(openAIModelSource).toContain("providerKey: typeof OPENAI_RESPONSES_PROVIDER_KEY")
    expect(openAIModelSource).toContain("'openai-responses-official'")
    expect(openAIModelSource).toContain("'openai_responses_v1'")
    expect(openAIModelIpc).toContain('ProviderCredentialService')
    expect(openAIModelIpc).toContain("readApiKey('openai_responses')")
    expect(openAIModelIpc).toContain('payload must not include credentials')
    expect(preload).toContain("contextBridge.exposeInMainWorld('openAIResponsesModels'")
    expect(console).toContain('openai-responses-models-diagnostics')
    expect(settings).toContain('Use Console refresh for official availability diagnostics')

    for (const source of [openAIModelSource, openAIModelIpc, preload, console, settings]) {
      expectNoRegistryPlaceholder(source)
      expect(source).not.toMatch(/\b(?:GenericEndpointConfig|GenericEndpointFixtureMetadata|toGenericEndpointFixtureMetadata|streamViaGenericConfig|streamViaGeneric)\b/)
    }

    for (const source of [openRouterCatalog, catalogSync, catalogQueryService]) {
      expect(source).not.toContain('openAIResponsesModelSource')
      expect(source).not.toContain('OpenAIProviderModelAvailability')
      expect(source).not.toContain('gpt-4.1-mini')
      expect(source).not.toContain('gpt-4.1')
    }
  })
})

describe('R5 Anthropic Messages provider model source guardrails', () => {
  it('keeps Anthropic Messages model availability separate from OpenRouter catalog, Generic live routing, and visible thinking text', () => {
    const anthropicModelSource = readRepoFile('src', 'next', 'provider', 'anthropic', 'anthropicModelSource.ts')
    const anthropicModelIpc = readRepoFile('electron', 'ipc', 'anthropicModelAvailabilityIpc.ts')
    const preload = readRepoFile('electron', 'preload.ts')
    const console = readRepoFile('src', 'ui-app', 'components', 'ChatSessionConsole.vue')
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const anthropicStreamMapper = readRepoFile('src', 'next', 'provider', 'anthropic', 'anthropicStreamMapper.ts')
    const openRouterCatalog = readRepoFile('src', 'shared', 'modelCatalog', 'openRouterCatalogClient.ts')
    const catalogSync = readRepoFile('src', 'shared', 'modelCatalog', 'catalogSyncJob.ts')
    const catalogQueryService = readRepoFile('src', 'next', 'modelCatalog', 'catalogQueryService.ts')

    expect(anthropicModelSource).toContain("ANTHROPIC_MODELS_DEFAULT_BASE_URL = 'https://api.anthropic.com/v1'")
    expect(anthropicModelSource).toContain("ANTHROPIC_MODELS_API_VERSION = '2023-06-01'")
    expect(anthropicModelSource).toContain('listAnthropicProviderModelAvailability')
    expect(anthropicModelSource).toContain('/models')
    expect(anthropicModelSource).toContain("providerKey: typeof ANTHROPIC_MESSAGES_PROVIDER_KEY")
    expect(anthropicModelSource).toContain("'anthropic-official'")
    expect(anthropicModelSource).toContain("'anthropic_messages_v1'")
    expect(anthropicModelIpc).toContain('ProviderCredentialService')
    expect(anthropicModelIpc).toContain("readApiKey('anthropic')")
    expect(anthropicModelIpc).toContain('payload must not include credentials')
    expect(anthropicModelIpc).toContain('xapikey')
    expect(preload).toContain("contextBridge.exposeInMainWorld('anthropicModels'")
    expect(console).toContain('anthropic-models-diagnostics')
    expect(settings).toContain('Use Console refresh for official availability diagnostics')
    expect(anthropicStreamMapper).toContain("'message.reasoning_detail'")
    expect(anthropicStreamMapper).not.toMatch(/thinking_delta[\s\S]{0,200}message\.text_delta/)
    expect(anthropicStreamMapper).not.toMatch(/signature_delta[\s\S]{0,200}message\.text_delta/)

    for (const source of [anthropicModelSource, anthropicModelIpc, preload, console, settings]) {
      expectNoRegistryPlaceholder(source)
      expect(source).not.toMatch(/\b(?:GenericEndpointConfig|GenericEndpointFixtureMetadata|toGenericEndpointFixtureMetadata|streamViaGenericConfig|streamViaGeneric)\b/)
    }

    for (const source of [openRouterCatalog, catalogSync, catalogQueryService]) {
      expect(source).not.toContain('anthropicModelSource')
      expect(source).not.toContain('AnthropicProviderModelAvailability')
      expect(source).not.toContain('claude-sonnet-4-5')
      expect(source).not.toContain('claude-opus-4-1')
    }
  })
})
