import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (...segments: string[]) => readFileSync(path.resolve(process.cwd(), ...segments), 'utf8')

describe('OpenAI Chat Completions-compatible V2 production boundary', () => {
  it('exposes one V2 renderer bridge and no legacy compatible globals', () => {
    const preload = read('electron', 'preload.ts')
    expect(preload).toContain('generationV2')
    expect(preload).toContain('openAICompatible: Object.freeze')
    expect(preload).toContain("generation-v2:openai-compatible:initial")
    expect(preload).not.toMatch(/exposeInMainWorld\('compatible(?:ProviderRegistry|ProviderTransport|Catalog|Chat)'/u)
  })

  it('uses the fixed compatible protocol through V2 compiler and single-attempt runner', () => {
    const compiler = read('electron', 'services', 'openAIChatCompatiblePreparedRequestCompilerV2.ts')
    const runner = read('electron', 'services', 'openAIChatCompatibleStreamRunnerV2.ts')
    expect(compiler).toContain('buildCompatibleChatRequest')
    expect(compiler).toContain('openai_chat_compatible')
    expect(runner).toContain('preparedRequest.body.copyBytes()')
    expect(runner).toContain('tryPersistPreparedV2')
    expect(runner).not.toMatch(/body\s*:\s*JSON\.stringify/u)
    expect(runner).not.toMatch(/retry|fallback/iu)
  })

  it('removes legacy compatible repositories, IPC, and runtime services', () => {
    for (const legacy of [
      'electron/ipc/compatibleChatIpc.ts',
      'electron/ipc/compatibleProviderRegistryIpc.ts',
      'electron/services/compatibleChatRuntimeService.ts',
      'infra/db/repo/compatibleProviderRepo.ts',
      'infra/db/repo/compatibleRouteRepo.ts',
    ]) expect(existsSync(path.resolve(legacy)), legacy).toBe(false)
  })

  it('keeps explicit extraBody and request mapping in the typed compatible compiler', () => {
    const builder = read('src', 'shared', 'provider', 'openai-chat-compatible', 'request', 'buildCompatibleChatRequest.ts')
    expect(builder).toContain('extraBody')
    expect(builder).toContain('requestMappings')
    expect(builder).toContain('assertCompatiblePathAvailable')
  })
})
