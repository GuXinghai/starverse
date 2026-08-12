import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GENERATION_V2_CREDENTIAL_SETTINGS_IPC_CHANNELS } from './generationV2CredentialSettingsIpc'

const providers = ['openrouter', 'openai-responses', 'google-ai-studio', 'anthropic', 'deepseek'] as const

describe('Generation V2 credential public boundary', () => {
  it('exposes only status, update, and clear credential IPC operations', () => {
    expect(GENERATION_V2_CREDENTIAL_SETTINGS_IPC_CHANNELS).toHaveLength(providers.length * 3)
    for (const provider of providers) {
      expect(GENERATION_V2_CREDENTIAL_SETTINGS_IPC_CHANNELS).toEqual(expect.arrayContaining([
        `generation-v2:credentials:${provider}:get-status`,
        `generation-v2:credentials:${provider}:update`,
        `generation-v2:credentials:${provider}:clear`,
      ]))
    }
    expect(GENERATION_V2_CREDENTIAL_SETTINGS_IPC_CHANNELS.some((channel) => channel.includes(':reveal'))).toBe(false)
  })

  it('keeps preload and its public declaration write-only', () => {
    const preload = readFileSync(resolve(process.cwd(), 'electron', 'preload.ts'), 'utf8')
    const declaration = readFileSync(resolve(process.cwd(), 'electron', 'electron-env.d.ts'), 'utf8')
    const bridgeStart = preload.indexOf('function createGenerationV2CredentialBridge')
    const bridgeEnd = preload.indexOf('\n// Epoch-2 generation commands', bridgeStart)
    const bridge = bridgeStart >= 0 && bridgeEnd > bridgeStart ? preload.slice(bridgeStart, bridgeEnd) : ''
    const typeStart = declaration.indexOf('type GenerationV2CredentialBridge = Readonly<{')
    const typeEnd = declaration.indexOf('\n}>', typeStart)
    const publicType = typeStart >= 0 && typeEnd > typeStart ? declaration.slice(typeStart, typeEnd + 3) : ''

    for (const source of [bridge, publicType]) {
      expect(source).not.toBe('')
      expect(source).toContain('getStatus')
      expect(source).toContain('update')
      expect(source).toContain('clear')
      expect(source).not.toContain('reveal')
      expect(source).not.toMatch(/apiKey\s*:/u)
      expect(source).not.toMatch(/credential\s*:/u)
    }
  })

  it('has no executable reveal call in credential-facing runtime surfaces', () => {
    const paths = [
      resolve(process.cwd(), 'electron', 'preload.ts'),
      resolve(process.cwd(), 'electron', 'ipc', 'generationV2CredentialSettingsIpc.ts'),
      resolve(process.cwd(), 'scripts', 'smoke', 'generation-v2-provider-real-smoke.mjs'),
    ]
    for (const path of paths) expect(readFileSync(path, 'utf8')).not.toMatch(/\.reveal\s*\(/u)
  })
})
