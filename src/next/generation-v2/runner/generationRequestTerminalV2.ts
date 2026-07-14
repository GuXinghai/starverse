import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import { GenerationV2Identity, isGenerationV2Identity } from '../domain/identityV2'

export type GenerationAttemptKeyV2 = Readonly<{
  operationId: GenerationV2Identity<'operation_id'>
  requestSequence: number
  attempt: number
}>

export type GenerationRequestTerminalFailureV2 = Readonly<{
  code: string
  message: string
}>

export type GenerationRequestTerminalOutcomeV2 =
  | Readonly<{ kind: 'provider_completed'; phase: 'mid_stream' }>
  | Readonly<{
      kind: 'provider_failed' | 'provider_incomplete'
      phase: 'pre_stream' | 'mid_stream'
      failure: GenerationRequestTerminalFailureV2
    }>
  | Readonly<{
      kind: 'user_cancelled' | 'connection_closed_without_terminal' | 'process_interrupted'
      phase: 'pre_stream' | 'mid_stream'
    }>

export type GenerationRequestAttemptOpenStateV2 = Readonly<{
  state: 'open'
  key: GenerationAttemptKeyV2
}>

export type GenerationRequestAttemptTerminalStateV2 = Readonly<{
  state: 'terminal'
  key: GenerationAttemptKeyV2
  outcome: GenerationRequestTerminalOutcomeV2
  fingerprint: string
}>

export type GenerationRequestAttemptStateV2 =
  | GenerationRequestAttemptOpenStateV2
  | GenerationRequestAttemptTerminalStateV2

export type GenerationRequestTerminalTransitionV2 =
  | Readonly<{
      kind: 'accepted'
      state: GenerationRequestAttemptTerminalStateV2
      persistRequired: true
    }>
  | Readonly<{
      kind: 'idempotent_replay'
      state: GenerationRequestAttemptTerminalStateV2
      persistRequired: false
    }>
  | Readonly<{
      kind: 'conflict'
      code: 'GENERATION_V2_ATTEMPT_TERMINAL_CONFLICT'
      state: GenerationRequestAttemptTerminalStateV2
      conflictingFingerprint: string
      persistRequired: false
    }>

export type PersistedGenerationRequestAttemptStateV2 = Readonly<{
  schemaVersion: 1
  state: 'open' | 'terminal'
  operationId: string
  requestSequence: number
  attempt: number
  outcome: GenerationRequestTerminalOutcomeV2 | null
  fingerprint: string | null
}>

export class GenerationRequestTerminalV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ATTEMPT_TERMINAL_INVALID_SHAPE'
    | 'GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE'
    | 'GENERATION_V2_ATTEMPT_TERMINAL_UNBRANDED_STATE'
    | 'GENERATION_V2_ATTEMPT_TERMINAL_KEY_MISMATCH'
    | 'GENERATION_V2_ATTEMPT_TERMINAL_FINGERPRINT_MISMATCH') {
    super(code)
    this.name = 'GenerationRequestTerminalV2Error'
  }
}

type ClosedObject = Readonly<Record<string, unknown>>

const states = new WeakSet<object>()

function closedObject(value: unknown, expected: readonly string[]): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) ||
      Object.keys(descriptors).sort().join('\0') !== [...expected].sort().join('\0')) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_SHAPE')
  }
  return Object.freeze(Object.fromEntries(expected.map((key) => [key, descriptors[key].value])))
}

function positiveSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
  }
  return value as number
}

function decodeKey(value: unknown): GenerationAttemptKeyV2 {
  const input = closedObject(value, ['operationId', 'requestSequence', 'attempt'])
  if (typeof input.operationId !== 'string') {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
  }
  return Object.freeze({
    operationId: GenerationV2Identity.create('operation_id', input.operationId),
    requestSequence: positiveSafeInteger(input.requestSequence),
    attempt: positiveSafeInteger(input.attempt),
  })
}

function keyProjection(key: GenerationAttemptKeyV2) {
  if (!isGenerationV2Identity(key.operationId, 'operation_id')) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
  }
  return Object.freeze({
    operationId: key.operationId.value,
    requestSequence: key.requestSequence,
    attempt: key.attempt,
  })
}

function keysEqual(left: GenerationAttemptKeyV2, right: GenerationAttemptKeyV2): boolean {
  return left.operationId.value === right.operationId.value &&
    left.requestSequence === right.requestSequence && left.attempt === right.attempt
}

function decodePhase(value: unknown): 'pre_stream' | 'mid_stream' {
  if (value !== 'pre_stream' && value !== 'mid_stream') {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
  }
  return value
}

function decodeFailure(value: unknown): GenerationRequestTerminalFailureV2 {
  const input = closedObject(value, ['code', 'message'])
  if (typeof input.code !== 'string' || input.code.length < 1 || input.code.length > 256 ||
      input.code.trim() !== input.code || /[\u0000-\u001f\u007f]/u.test(input.code) ||
      typeof input.message !== 'string' || input.message.length < 1 || input.message.length > 8_192 ||
      /\u0000/u.test(input.message)) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
  }
  return Object.freeze({ code: input.code, message: input.message })
}

function decodeOutcome(value: unknown): GenerationRequestTerminalOutcomeV2 {
  const discriminator = closedObject(value, ['kind', 'phase', 'failure'])
  const phase = decodePhase(discriminator.phase)
  if (discriminator.kind === 'provider_failed' || discriminator.kind === 'provider_incomplete') {
    if (discriminator.kind === 'provider_incomplete' && phase !== 'mid_stream') {
      throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
    }
    return Object.freeze({
      kind: discriminator.kind,
      phase,
      failure: decodeFailure(discriminator.failure),
    })
  }
  throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
}

function decodeOutcomeWithoutFailure(value: unknown): GenerationRequestTerminalOutcomeV2 {
  const input = closedObject(value, ['kind', 'phase'])
  const phase = decodePhase(input.phase)
  if (input.kind === 'provider_completed') {
    if (phase !== 'mid_stream') {
      throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
    }
    return Object.freeze({ kind: input.kind, phase })
  }
  if (input.kind === 'user_cancelled' || input.kind === 'connection_closed_without_terminal' ||
      input.kind === 'process_interrupted') {
    return Object.freeze({ kind: input.kind, phase })
  }
  throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
}

function readOutcomeKind(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_SHAPE')
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'kind')
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_SHAPE')
  }
  return descriptor.value
}

function decodeSignal(value: unknown): Readonly<{
  key: GenerationAttemptKeyV2
  outcome: GenerationRequestTerminalOutcomeV2
}> {
  const discriminator = closedObject(value, ['key', 'outcome'])
  const outcomeKind = readOutcomeKind(discriminator.outcome)
  const outcome = outcomeKind === 'provider_failed' || outcomeKind === 'provider_incomplete'
    ? decodeOutcome(discriminator.outcome)
    : decodeOutcomeWithoutFailure(discriminator.outcome)
  return Object.freeze({ key: decodeKey(discriminator.key), outcome })
}

function terminalProjection(key: GenerationAttemptKeyV2, outcome: GenerationRequestTerminalOutcomeV2) {
  return Object.freeze({ key: keyProjection(key), outcome })
}

function fingerprint(key: GenerationAttemptKeyV2, outcome: GenerationRequestTerminalOutcomeV2): string {
  return createHash('sha256')
    .update(stableSerializeProviderRequestV2(terminalProjection(key, outcome)), 'utf8')
    .digest('hex')
}

function issueState<T extends GenerationRequestAttemptStateV2>(state: T): T {
  states.add(state)
  return Object.freeze(state)
}

function requireState(state: GenerationRequestAttemptStateV2): GenerationRequestAttemptStateV2 {
  if (!state || typeof state !== 'object' || !states.has(state)) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_UNBRANDED_STATE')
  }
  return state
}

export function createGenerationRequestAttemptOpenStateV2(key: unknown): GenerationRequestAttemptOpenStateV2 {
  return issueState({ state: 'open', key: decodeKey(key) })
}

export function transitionGenerationRequestAttemptTerminalV2(
  current: GenerationRequestAttemptStateV2,
  signal: unknown,
): GenerationRequestTerminalTransitionV2 {
  const state = requireState(current)
  const decoded = decodeSignal(signal)
  if (!keysEqual(state.key, decoded.key)) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_KEY_MISMATCH')
  }
  const nextFingerprint = fingerprint(decoded.key, decoded.outcome)
  if (state.state === 'terminal') {
    if (state.fingerprint === nextFingerprint) {
      return Object.freeze({ kind: 'idempotent_replay', state, persistRequired: false })
    }
    return Object.freeze({
      kind: 'conflict',
      code: 'GENERATION_V2_ATTEMPT_TERMINAL_CONFLICT',
      state,
      conflictingFingerprint: nextFingerprint,
      persistRequired: false,
    })
  }
  const terminal = issueState({
    state: 'terminal' as const,
    key: state.key,
    outcome: decoded.outcome,
    fingerprint: nextFingerprint,
  })
  return Object.freeze({ kind: 'accepted', state: terminal, persistRequired: true })
}

export function projectGenerationRequestAttemptStateV2(
  value: GenerationRequestAttemptStateV2,
): PersistedGenerationRequestAttemptStateV2 {
  const state = requireState(value)
  if (state.state === 'open') {
    return Object.freeze({
      schemaVersion: 1, state: 'open', ...keyProjection(state.key), outcome: null, fingerprint: null,
    })
  }
  return Object.freeze({
    schemaVersion: 1, state: 'terminal', ...keyProjection(state.key),
    outcome: state.outcome, fingerprint: state.fingerprint,
  })
}

export function restoreGenerationRequestAttemptStateV2(value: unknown): GenerationRequestAttemptStateV2 {
  const input = closedObject(value, [
    'schemaVersion', 'state', 'operationId', 'requestSequence', 'attempt', 'outcome', 'fingerprint',
  ])
  if (input.schemaVersion !== 1 || (input.state !== 'open' && input.state !== 'terminal')) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
  }
  const key = decodeKey({
    operationId: input.operationId,
    requestSequence: input.requestSequence,
    attempt: input.attempt,
  })
  if (input.state === 'open') {
    if (input.outcome !== null || input.fingerprint !== null) {
      throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
    }
    return issueState({ state: 'open', key })
  }
  if (typeof input.fingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(input.fingerprint)) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_INVALID_VALUE')
  }
  const outcomeKind = readOutcomeKind(input.outcome)
  const outcome = outcomeKind === 'provider_failed' || outcomeKind === 'provider_incomplete'
    ? decodeOutcome(input.outcome)
    : decodeOutcomeWithoutFailure(input.outcome)
  if (fingerprint(key, outcome) !== input.fingerprint) {
    throw new GenerationRequestTerminalV2Error('GENERATION_V2_ATTEMPT_TERMINAL_FINGERPRINT_MISMATCH')
  }
  return issueState({ state: 'terminal', key, outcome, fingerprint: input.fingerprint })
}
