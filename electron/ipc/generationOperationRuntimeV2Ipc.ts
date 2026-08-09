import type { WebContents } from 'electron'
import type { RegisterInvoke } from './types'
import type { GenerationOperationRuntimeRegistryV2 } from '../services/generationOperationRuntimeRegistryV2'

export const GENERATION_OPERATION_RUNTIME_V2_CHANNELS = Object.freeze({
  subscribe: 'generation-v2:runtime:subscribe',
  snapshot: 'generation-v2:runtime:snapshot',
  abort: 'generation-v2:runtime:abort',
  event: 'generation-v2:runtime:event',
})

function senderFromEvent(event: unknown): WebContents | null {
  const sender = (event as { sender?: unknown } | null)?.sender
  return sender && typeof (sender as WebContents).send === 'function' ? sender as WebContents : null
}

function operationId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value
    ? value
    : null
}

export function registerGenerationOperationRuntimeV2Ipc(input: Readonly<{
  registerInvoke: RegisterInvoke
  runtimeRegistry: GenerationOperationRuntimeRegistryV2
}>): readonly string[] {
  const subscribers = new Set<WebContents>()
  input.runtimeRegistry.subscribe((event) => {
    for (const subscriber of [...subscribers]) {
      if (subscriber.isDestroyed()) {
        subscribers.delete(subscriber)
        continue
      }
      try {
        subscriber.send(GENERATION_OPERATION_RUNTIME_V2_CHANNELS.event, event)
      } catch {
        subscribers.delete(subscriber)
      }
    }
  })
  input.registerInvoke(GENERATION_OPERATION_RUNTIME_V2_CHANNELS.subscribe, (event: unknown) => {
    const sender = senderFromEvent(event)
    if (!sender) return Object.freeze({ ok: false, code: 'GENERATION_V2_RUNTIME_SUBSCRIBER_INVALID' })
    subscribers.add(sender)
    sender.once('destroyed', () => subscribers.delete(sender))
    return Object.freeze({ ok: true, value: input.runtimeRegistry.listSnapshots() })
  })
  input.registerInvoke(GENERATION_OPERATION_RUNTIME_V2_CHANNELS.snapshot, (_event: unknown, raw: unknown) => {
    if (raw === null) return Object.freeze({ ok: true, value: input.runtimeRegistry.listSnapshots() })
    const id = operationId(raw)
    return id
      ? Object.freeze({ ok: true, value: input.runtimeRegistry.getSnapshot(id) })
      : Object.freeze({ ok: false, code: 'GENERATION_V2_RUNTIME_OPERATION_ID_INVALID' })
  })
  input.registerInvoke(GENERATION_OPERATION_RUNTIME_V2_CHANNELS.abort, (_event: unknown, raw: unknown) => {
    const id = operationId(raw)
    return id
      ? Object.freeze({ ok: true, value: Object.freeze({ aborted: input.runtimeRegistry.abort(id) }) })
      : Object.freeze({ ok: false, code: 'GENERATION_V2_RUNTIME_OPERATION_ID_INVALID' })
  })
  return Object.freeze([
    GENERATION_OPERATION_RUNTIME_V2_CHANNELS.subscribe,
    GENERATION_OPERATION_RUNTIME_V2_CHANNELS.snapshot,
    GENERATION_OPERATION_RUNTIME_V2_CHANNELS.abort,
  ])
}
