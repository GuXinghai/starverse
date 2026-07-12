import type { CompatibleJsonValue } from '../request/messageTypes'
import type { CompatibleNetworkErrorEnvelope } from '../../../../shared/network/compatibleNetworkError'

export type CompatibleWireSource = 'stream' | 'non_stream'

export type CompatibleResponseMeta = Readonly<{
  id?: string
  object?: string
  created?: number
  model?: string
  systemFingerprint?: string | null
  serviceTier?: string | null
}>

export type CompatibleToolFragment = Readonly<{
  toolIndex: number
  id?: string
  type?: 'function'
  functionName?: string
  argumentsFragment?: string
}>

export type CompatibleExtensionCandidate = Readonly<{
  sourcePath: readonly (string | number)[]
  choiceIndex?: number
  value: CompatibleJsonValue
}>

type Sequenced = Readonly<{ sequence: number; source: CompatibleWireSource }>
type ChoiceScoped = Readonly<{ choiceIndex: number }>

export type CompatibleWireEvent =
  | (Sequenced & Readonly<{ kind: 'response_meta'; meta: CompatibleResponseMeta }>)
  | (Sequenced & ChoiceScoped & Readonly<{ kind: 'choice_role'; role: 'system' | 'developer' | 'user' | 'assistant' | 'tool' }>)
  | (Sequenced & ChoiceScoped & Readonly<{ kind: 'choice_content'; content: string | null | readonly CompatibleJsonValue[] }>)
  | (Sequenced & ChoiceScoped & Readonly<{ kind: 'tool_fragment'; fragment: CompatibleToolFragment }>)
  | (Sequenced & ChoiceScoped & Readonly<{ kind: 'choice_finish'; finishReason: string | null }>)
  | (Sequenced & Readonly<{ kind: 'usage'; usage: Readonly<Record<string, CompatibleJsonValue>> }>)
  | (Sequenced & Readonly<{ kind: 'extension'; candidate: CompatibleExtensionCandidate }>)
  | (Sequenced & Readonly<{
      kind: 'terminal'
      outcome: 'done' | 'eof_without_done' | 'aborted' | 'interrupted' | 'error'
      error?: CompatibleWireErrorEnvelope
    }>)

export type CompatibleWireErrorEnvelope = Readonly<{
  network: CompatibleNetworkErrorEnvelope
  diagnostic: Readonly<{
    category: 'framing' | 'json' | 'shape' | 'tool' | 'extension' | 'http' | 'lifecycle'
    providerErrorShape?: 'object' | 'other' | 'none'
    providerCodePresent?: boolean
    providerTypePresent?: boolean
  }>
}>

export type CompatibleWireLimits = Readonly<{
  maxTotalBytes: number
  maxEventBytes: number
  maxPendingBytes: number
  maxNonStreamBytes: number
  maxExtensionCandidates: number
  maxExtensionValueBytes: number
  maxExtensionTotalBytes: number
}>

export const DEFAULT_COMPATIBLE_WIRE_LIMITS: CompatibleWireLimits = Object.freeze({
  maxTotalBytes: 64 * 1024 * 1024,
  maxEventBytes: 1024 * 1024,
  maxPendingBytes: 2 * 1024 * 1024,
  maxNonStreamBytes: 16 * 1024 * 1024,
  maxExtensionCandidates: 256,
  maxExtensionValueBytes: 16 * 1024,
  maxExtensionTotalBytes: 256 * 1024,
})

export function resolveCompatibleWireLimits(input: Partial<CompatibleWireLimits> = {}): CompatibleWireLimits {
  const resolved = { ...DEFAULT_COMPATIBLE_WIRE_LIMITS, ...input }
  for (const value of Object.values(resolved)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('compatible_wire_limits_invalid')
  }
  if (resolved.maxExtensionValueBytes > resolved.maxExtensionTotalBytes) {
    throw new Error('compatible_wire_limits_invalid')
  }
  return Object.freeze(resolved)
}
