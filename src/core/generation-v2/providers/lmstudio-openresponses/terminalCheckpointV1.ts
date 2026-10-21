import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { restoreLmStudioOpenResponsesStreamResultV1,
  type LmStudioOpenResponsesStreamResultV1 } from './responsesStreamV1'

type JsonObject = Readonly<Record<string, unknown>>

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as JsonObject
}

function invalid(): never { throw new Error('GENERATION_V2_LMSTUDIO_TERMINAL_CHECKPOINT_INVALID') }

function terminalFromWire(value: unknown): LmStudioOpenResponsesStreamResultV1 {
  const event = object(value)
  const state = event.type === 'response.completed' ? 'completed'
    : event.type === 'response.failed' ? 'failed'
      : event.type === 'response.incomplete' ? 'incomplete' : invalid()
  const response = object(event.response)
  if (response.status !== state) invalid()
  return restoreLmStudioOpenResponsesStreamResultV1({ state, returnedItems: response.output,
    responseId: response.id, model: response.model, usage: response.usage ?? null, error: response.error ?? null })
}

/** Keep the received wire facts once; reference their terminal instead of duplicating its output. */
export function createLmStudioTerminalCheckpointV1(wireEvents: readonly unknown[], value: unknown): JsonObject {
  const terminal = restoreLmStudioOpenResponsesStreamResultV1(value)
  const expected = stableSerializeProviderRequestV2(terminal)
  for (let index = wireEvents.length - 1; index >= 0; index -= 1) {
    const event = object(wireEvents[index])
    if (event.type !== `response.${terminal.state}`) continue
    if (stableSerializeProviderRequestV2(terminalFromWire(event)) !== expected) invalid()
    return Object.freeze({ wireEvents, complete: false,
      terminalResultRef: Object.freeze({ kind: 'wire_terminal', index }) })
  }
  // Restart recovery owns the durable terminal result but has no live SSE event array.
  if (wireEvents.length !== 0) invalid()
  return Object.freeze({ wireEvents, complete: false, terminalResult: terminal })
}

/** Also accepts the earlier inline terminal layout; old checkpoints remain readable. */
export function readLmStudioTerminalCheckpointV1(value: unknown): LmStudioOpenResponsesStreamResultV1 | null {
  const native = object(value)
  if (native.terminalResultRef === undefined) {
    return native.terminalResult === undefined ? null : restoreLmStudioOpenResponsesStreamResultV1(native.terminalResult)
  }
  if (native.terminalResult !== undefined || !Array.isArray(native.wireEvents)) invalid()
  const reference = object(native.terminalResultRef)
  if (Object.keys(reference).sort().join('\0') !== ['index', 'kind'].join('\0') ||
      reference.kind !== 'wire_terminal' || !Number.isSafeInteger(reference.index) ||
      (reference.index as number) < 0 || (reference.index as number) >= native.wireEvents.length) invalid()
  return terminalFromWire(native.wireEvents[reference.index as number])
}
