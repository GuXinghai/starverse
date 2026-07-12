import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()

function readSource(repoRelativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, repoRelativePath), 'utf8')
}

describe('local text chat semantic core boundary', () => {
  it.each([
    'src/next/live/localEndpointTextChat.ts',
    'src/next/live/lmStudioTextChat.ts',
  ])('%s uses the shared local Chat Completions mapper', (filePath) => {
    const source = readSource(filePath)

    expect(source).toContain('mapLocalOpenAIChatCompletionsChunkToEvents')
    expect(source).toContain('mapJsonChunkToEvents: mapLocalOpenAIChatCompletionsChunkToEvents')
    expect(source).not.toContain("from '@/next/openrouter/mapChunkToEvents'")
  })

  it('uses the Ollama native mapper only for native REST chat mode', () => {
    const source = readSource('src/next/live/ollamaTextChat.ts')

    expect(source).toContain('mapLocalOpenAIChatCompletionsChunkToEvents')
    expect(source).toContain('mapOllamaNativeChunkToEvents')
    expect(source).toContain("options.config.chatMode === 'native_rest'")
    expect(source).toContain('mapJsonChunkToEvents: options.config.chatMode')
    expect(source).not.toContain("from '@/next/openrouter/mapChunkToEvents'")
  })
})
