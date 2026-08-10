import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.resolve(relativePath), 'utf8')

describe('OpenRouter Images V2 production boundary', () => {
  it('is registered only through the epoch-2 V2 main graph', () => {
    expect(read('vite.config.ts')).toContain('electron/epoch2MainEntry.ts')
    expect(read('electron/mainV2.ts')).toContain('registerGenerationV2Ipc')
    expect(read('electron/ipc/generationV2IpcRegistration.ts')).toContain('registerOpenRouterGenerationV2Ipc')
    for (const legacy of ['electron/main.ts', 'electron/ipc/registerIpc.ts', 'electron/ipc/openRouterStreamBridge.ts']) {
      expect(existsSync(path.resolve(legacy)), legacy).toBe(false)
    }
  })

  it('keeps Images on its own typed command/compiler/runner contract', () => {
    const ipc = read('electron/ipc/openRouterGenerationV2Ipc.ts')
    const coordinator = read('electron/services/openRouterImageActionCoordinatorV2.ts')
    const runner = read('electron/services/openRouterImageInitialStreamRunnerV2.ts')
    expect(ipc).toContain('openrouter:images')
    expect(coordinator).toContain('compileOpenRouterImagePreparedRequestV2')
    expect(runner).toContain('preparedRequest.body.copyBytes()')
    expect(runner).toContain('tryPersistPreparedV2')
    expect(runner).not.toMatch(/body\s*:\s*JSON\.stringify/u)
  })

  it('pins the explicit endpoint binding without fallback', () => {
    const compiler = read('src/next/generation-v2/providers/openrouter-images/imageRequestV1.ts')
    expect(compiler).toContain('allow_fallbacks')
    expect(compiler).toContain('providerTag')
    expect(compiler).toContain('It only serializes the selected tag as `provider.only`')
  })
})
