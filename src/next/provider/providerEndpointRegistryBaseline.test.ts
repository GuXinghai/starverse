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
  'endpointRegistry',
  'providerRegistry',
  'runtimeProviderRegistry',
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
    const source = readFileSync(file, 'utf8')
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

describe('C5 endpoint registry baseline characterization', () => {
  it('has no production endpoint/provider registry placeholder implementation', () => {
    const pattern = new RegExp(`\\b(?:${registryPlaceholderNames.join('|')})\\b`)

    expect(productionOccurrences(pattern)).toEqual([])
  })

  it('keeps active OpenRouter chat/send on the first-class legacy_store credential source, not a registry route', () => {
    const appChat = readRepoFile('src', 'ui-app', 'app', 'appChatApp.logic.ts')
    const adapter = readRepoFile('src', 'next', 'provider', 'openrouter', 'openRouterAdapter.ts')
    const liveStream = readRepoFile('src', 'next', 'live', 'openRouterLiveStream.ts')
    const bridge = readRepoFile('electron', 'ipc', 'openRouterStreamBridge.ts')

    expect(appChat).toContain('streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource')
    expect(appChat).not.toMatch(/\bstreamViaOpenRouterAsDomainEvents\s*\(/)
    expect(adapter).toContain("credentialSource: 'legacy_store' as const")
    expect(liveStream).toContain("credentialSource === 'legacy_store'")
    expect(liveStream).toContain('...(credentialSource ? {} : options.config.baseUrl ? { baseUrl: options.config.baseUrl } : {})')
    expect(bridge).toContain('resolveOpenRouterChatCredentialFromLegacyStore')

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

  it('keeps SettingsPanel on OpenRouter credential metadata bridge with no endpoint record UI', () => {
    const settings = readRepoFile('src', 'ui-app', 'components', 'SettingsPanel.vue')
    const credentialIpc = readRepoFile('electron', 'ipc', 'openRouterCredentialSettingsIpc.ts')

    expect(settings).toContain('openRouterCredential')
    expect(settings).toContain('getStatus')
    expect(settings).toContain('update')
    expect(settings).toContain('clear')
    expect(settings).not.toContain("electronStore.get('openRouterApiKey')")
    expect(settings).not.toContain("electronStore.get('openRouterBaseUrl')")
    expect(settings).not.toContain('endpointId')
    expect(settings).not.toContain('profileId')
    expect(credentialIpc).toContain("source: 'legacy_store'")
    expect(credentialIpc).toContain('OPENROUTER_CHAT_LEGACY_BASE_URL_STORE_KEY')

    for (const source of [settings, credentialIpc]) {
      expectNoRegistryPlaceholder(source)
    }
  })

  it('keeps Generic endpoint config fixture-only and out of active production routing', () => {
    const genericPattern = /\b(?:GenericEndpointConfig|streamViaGenericConfig|streamViaGeneric)\b/
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
    expect(genericConfig).toContain('credentialRef')
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
