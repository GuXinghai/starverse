import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RegisterInvoke } from './types'
import { readExpectedCapabilityRevisionV2 } from '../../infra/generation-v2/capabilityRevisionExpectationV2'
import { registerAnthropicGenerationV2Ipc } from './anthropicGenerationV2Ipc'
import { registerDeepSeekGenerationV2Ipc } from './deepSeekGenerationV2Ipc'
import { registerGeminiGenerationV2Ipc } from './geminiGenerationV2Ipc'
import { registerGenericLocalGenerationV2Ipc } from './genericLocalGenerationV2Ipc'
import { registerLmStudioGenerationV2Ipc } from './lmStudioGenerationV2Ipc'
import { registerOllamaGenerationV2Ipc } from './ollamaGenerationV2Ipc'
import { registerOpenAICompatibleGenerationV2Ipc } from './openAICompatibleGenerationV2Ipc'
import { registerOpenAIResponsesGenerationV2Ipc } from './openAIResponsesGenerationV2Ipc'
import { registerOpenRouterGenerationV2Ipc } from './openRouterGenerationV2Ipc'

// R4-07 (I3a-05, I3b-05): the revision check fails open without a context by
// design, for unit tests and internal replay. Every user-facing generation
// command entry must therefore install the context itself.

/** Entries that never create an execution snapshot, so they need no revision context. */
const EXEMPT_CHANNELS = new Map<string, string>([
  ['generation-v2:openrouter:images:endpoints:get', 'reads image endpoint settings'],
  ['generation-v2:openrouter:images:endpoints:select', 'stores an endpoint selection, no generation'],
  ['generation-v2:openrouter:images:endpoints:update-settings', 'stores endpoint settings, no generation'],
])

const REVISION = 'capability-revision-v1:inventory'

function commandResult() {
  return {
    kind: 'created',
    execution: { operation: { operationId: { value: 'operation:1' }, targetAnswerId: { value: 'answer:1' }, actionKind: 'initial_send' } },
    projection: { branchProjection: {
      branchId: { value: 'branch:1' }, conversationId: { value: 'conversation:1' }, questionId: { value: 'question:1' },
      headMessageId: null, chosenAnswerRootId: null, deletedAtMs: null,
    } },
  }
}

/** Any runtime shape: every method records the revision context it was called in. */
function recordingRuntime(seen: Array<string | null>): never {
  const node = (): unknown => new Proxy(function () { /* callable */ }, {
    get: (_target, key) => key === 'then' ? undefined : node(),
    apply: async () => {
      seen.push(readExpectedCapabilityRevisionV2())
      return commandResult()
    },
  })
  return node() as never
}

type Registrar = (input: Readonly<{ registerInvoke: RegisterInvoke; runtime: never }>) => readonly string[]

const REGISTRARS: Readonly<Record<string, Registrar>> = {
  registerAnthropicGenerationV2Ipc: ({ registerInvoke, runtime }) => registerAnthropicGenerationV2Ipc({ registerInvoke, createRuntime: () => runtime }),
  registerDeepSeekGenerationV2Ipc: ({ registerInvoke, runtime }) => registerDeepSeekGenerationV2Ipc({ registerInvoke, createRuntime: () => runtime }),
  registerGeminiGenerationV2Ipc: ({ registerInvoke, runtime }) => registerGeminiGenerationV2Ipc({ registerInvoke,
    createRuntime: () => runtime, createInteractionsImageRuntime: () => runtime }),
  registerGenericLocalGenerationV2Ipc: ({ registerInvoke, runtime }) => registerGenericLocalGenerationV2Ipc({ registerInvoke, createRuntime: () => runtime }),
  registerLmStudioGenerationV2Ipc: ({ registerInvoke, runtime }) => registerLmStudioGenerationV2Ipc({ registerInvoke, createRuntime: () => runtime }),
  registerOllamaGenerationV2Ipc: ({ registerInvoke, runtime }) => registerOllamaGenerationV2Ipc({ registerInvoke, createRuntime: () => runtime }),
  registerOpenAICompatibleGenerationV2Ipc: ({ registerInvoke, runtime }) => registerOpenAICompatibleGenerationV2Ipc({ registerInvoke, createRuntime: () => runtime }),
  registerOpenAIResponsesGenerationV2Ipc: ({ registerInvoke, runtime }) => registerOpenAIResponsesGenerationV2Ipc({ registerInvoke, createRuntime: () => runtime }),
  registerOpenRouterGenerationV2Ipc: ({ registerInvoke, runtime }) => registerOpenRouterGenerationV2Ipc({ registerInvoke, createRuntime: () => runtime }),
}

describe('R4-07: generation command IPC revision-context inventory', () => {
  it('covers every provider generation registrar used by the production registration', () => {
    const source = readFileSync(join(__dirname, 'generationV2IpcRegistration.ts'), 'utf8')
    const used = [...source.matchAll(/\.\.\.(register\w+GenerationV2Ipc)\(/gu)].map(match => match[1]).sort()
    expect(used).toEqual(Object.keys(REGISTRARS).sort())
  })

  it('only the three reviewed IPC cores decode capability-bound generation commands', () => {
    const decoders = readdirSync(__dirname)
      .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .filter(name => readFileSync(join(__dirname, name), 'utf8').includes('decodeCapabilityBoundGenerationCommandV2('))
      .sort()
    expect(decoders).toEqual(['geminiGenerationV2Ipc.ts', 'openRouterGenerationV2Ipc.ts', 'textGenerationV2IpcCore.ts'])
  })

  for (const [name, register] of Object.entries(REGISTRARS)) {
    it(`${name}: every command entry runs inside the expected revision context`, async () => {
      const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>()
      const seen: Array<string | null> = []
      const channels = register({
        registerInvoke: (channel, handler) => { handlers.set(channel, handler as never) },
        runtime: recordingRuntime(seen),
      })
      expect([...handlers.keys()].sort()).toEqual([...channels].sort())
      const commandChannels = channels.filter(channel => !channel.endsWith(':abort') && !EXEMPT_CHANNELS.has(channel))
      expect(commandChannels.length).toBeGreaterThan(0)
      for (const channel of commandChannels) {
        seen.length = 0
        const result = await handlers.get(channel)!({ sender: { send: () => undefined } }, {
          command: { operationId: 'operation:1' }, expectedCapabilityRevision: REVISION,
        })
        expect({ channel, result }).toMatchObject({ channel, result: { ok: true } })
        expect({ channel, seen }).toEqual({ channel, seen: [REVISION] })
      }
    })
  }
})
