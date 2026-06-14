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
    }
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
