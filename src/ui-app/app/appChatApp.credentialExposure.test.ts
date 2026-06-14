import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))

describe('appChatApp OpenRouter C4 exposure baseline', () => {
  it('characterizes active C3 chat/send as using legacy_store credential source without renderer raw apiKey handoff', () => {
    const source = readFileSync(resolve(testDir, 'appChatApp.logic.ts'), 'utf8')

    expect(source).toContain('streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource')
    expect(source).toContain('getOpenRouterBaseUrl')
    expect(source).not.toContain('getOpenRouterApiKey')
    expect(source).not.toMatch(/\bstreamViaOpenRouterAsDomainEvents\s*\(/)
    expect(source).not.toMatch(/\bapiKey\b/)
  })
})
