import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(relativePath: string): string {
  return readFileSync(path.resolve(relativePath), 'utf8')
}

describe('OpenRouter Images V2 production boundary', () => {
  it('does not activate endpoint binding against legacy chat.db or preload', () => {
    const activationPattern = /openrouterimagesendpoint|openrouterimageendpoint|openrouter_image_endpoint_|openrouter\/images/iu
    for (const file of [
      'electron/main.ts',
      'electron/preload.ts',
      'electron/electron-env.d.ts',
      'electron/ipc/registerIpc.ts',
      'electron/ipc/startupIpcAudit.ts',
      'electron/ipc/dbBridge.ts',
      'infra/db/schema.sql',
      'infra/db/dbMethodsRegistry.ts',
      'infra/db/worker/container.ts',
      'infra/db/worker/runtime.ts',
      'infra/db/worker/handlers/usagePrefsSettingsHandlers.ts',
      'src/next/generation/assistantAnswerGenerationSnapshot.ts',
    ]) {
      expect(read(file), file).not.toMatch(activationPattern)
    }
  })

  it('keeps verified Images routing out of Chat Completions builders and transports', () => {
    for (const file of [
      'src/next/openrouter/buildRequest.ts',
      'src/next/live/openRouterLiveStream.ts',
      'src/next/transport/openrouterFetch.ts',
      'electron/ipc/openRouterStreamBridge.ts',
    ]) {
      const source = read(file)
      expect(source, file).not.toContain("openrouter/images")
      expect(source, file).not.toContain('allow_fallbacks')
    }
  })

  it('keeps the endpoint schema isolated for epoch-2 application', () => {
    const schema = read('infra/db/v2/openRouterImagesSchema.sql')
    expect(schema).toContain('Generation Compiler V2 only')
    expect(schema).toContain('openrouter_image_endpoint_descriptor_sets')
    expect(schema).toContain('openrouter_image_endpoint_settings')
    expect(schema).not.toContain('provider_options_json')
    expect(schema).not.toContain('hard_expires_at_ms')
  })

  it('keeps V2 freshness settings out of legacy settings storage and worker methods', () => {
    for (const file of [
      'infra/db/repo/settingsRepo.ts',
      'infra/db/repo/settingsKeys.ts',
      'infra/db/dbMethodsRegistry.ts',
      'infra/db/worker/runtime.ts',
      'infra/db/worker/handlers/usagePrefsSettingsHandlers.ts',
    ]) {
      expect(read(file), file).not.toMatch(/endpointDescriptor|openRouterImageSettingsRepo/iu)
    }
  })
})
