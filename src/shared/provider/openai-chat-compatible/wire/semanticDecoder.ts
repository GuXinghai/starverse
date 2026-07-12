import type { CompatibleJsonValue } from '../request/messageTypes'
import { CompatibleExtensionCollector } from './extensionCapture'
import { createCompatibleWireError, createCompatibleHttpWireError } from './wireError'
import type {
  CompatibleExtensionCandidate,
  CompatibleResponseMeta,
  CompatibleToolFragment,
  CompatibleWireErrorEnvelope,
  CompatibleWireSource,
} from './wireTypes'

const ROOT_KEYS = new Set(['id', 'object', 'created', 'model', 'system_fingerprint', 'service_tier', 'choices', 'usage', 'error'])
const CHOICE_KEYS = new Set(['index', 'delta', 'message', 'finish_reason'])
const CONTENT_KEYS = new Set(['role', 'content', 'tool_calls'])
const TOOL_KEYS = new Set(['index', 'id', 'type', 'function'])
const FUNCTION_KEYS = new Set(['name', 'arguments'])
const ROLES = new Set(['system', 'developer', 'user', 'assistant', 'tool'])

export type CompatibleDecodedItem =
  | Readonly<{ kind: 'meta'; meta: CompatibleResponseMeta }>
  | Readonly<{ kind: 'role'; choiceIndex: number; role: 'system' | 'developer' | 'user' | 'assistant' | 'tool' }>
  | Readonly<{ kind: 'content'; choiceIndex: number; content: string | null | readonly CompatibleJsonValue[] }>
  | Readonly<{ kind: 'tool'; choiceIndex: number; fragment: CompatibleToolFragment }>
  | Readonly<{ kind: 'finish'; choiceIndex: number; finishReason: string | null }>
  | Readonly<{ kind: 'usage'; usage: Readonly<Record<string, CompatibleJsonValue>> }>
  | Readonly<{ kind: 'extension'; candidate: CompatibleExtensionCandidate }>
  | Readonly<{ kind: 'provider_error'; error: CompatibleWireErrorEnvelope }>

export function parseCompatibleJsonBytes(bytes: Uint8Array, input: Readonly<{
  maxBytes: number
  malformedCode: 'compatible_json_malformed' | 'compatible_sse_malformed'
}>): CompatibleJsonValue {
  if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1 || bytes.byteLength > input.maxBytes) {
    throw createCompatibleWireError({ code: 'compatible_response_overflow', category: 'json' })
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw createCompatibleWireError({ code: input.malformedCode, category: 'json', stage: input.malformedCode === 'compatible_sse_malformed' ? 'stream' : 'response' })
  }
  try {
    return assertJsonValue(JSON.parse(text))
  } catch (error) {
    if (error instanceof Error && error.name === 'CompatibleWireError') throw error
    throw createCompatibleWireError({ code: input.malformedCode, category: 'json', stage: input.malformedCode === 'compatible_sse_malformed' ? 'stream' : 'response' })
  }
}

export function decodeCompatibleResponseObject(input: Readonly<{
  value: CompatibleJsonValue
  source: CompatibleWireSource
  collector: CompatibleExtensionCollector
  expectedChoiceCount?: number
}>): Readonly<{ items: readonly CompatibleDecodedItem[]; choiceIndexes: readonly number[] }> {
  const root = asObject(input.value, 'compatible_response_unsupported')
  if ('error' in root && root.error !== null) {
    const providerError = root.error
    const providerErrorObject = isObject(providerError) ? providerError : null
    const shape = providerErrorObject ? 'object' : 'other'
    const error = createCompatibleHttpWireError({
      status: 500,
      providerErrorShape: shape,
      providerCodePresent: providerErrorObject !== null && typeof providerErrorObject.code === 'string',
      providerTypePresent: providerErrorObject !== null && typeof providerErrorObject.type === 'string',
    })
    return { items: [Object.freeze({ kind: 'provider_error', error: error.envelope })], choiceIndexes: [] }
  }
  if (!Array.isArray(root.choices)) throw unsupported()
  const items: CompatibleDecodedItem[] = []
  const meta = decodeMeta(root)
  if (Object.keys(meta).length > 0) items.push(Object.freeze({ kind: 'meta', meta }))
  for (const candidate of input.collector.collect({ object: root, knownKeys: ROOT_KEYS, sourcePath: [] })) {
    items.push(Object.freeze({ kind: 'extension', candidate }))
  }
  const indexes = new Set<number>()
  for (const rawChoice of root.choices) {
    const choice = asObject(rawChoice, 'compatible_response_unsupported')
    const index = choice.index
    if (!Number.isInteger(index) || (index as number) < 0 || indexes.has(index as number)) throw unsupported()
    if (input.expectedChoiceCount !== undefined && (index as number) >= input.expectedChoiceCount) throw unsupported()
    indexes.add(index as number)
    const choiceIndex = index as number
    const payloadKey = input.source === 'stream' ? 'delta' : 'message'
    const payload = asObject(choice[payloadKey], 'compatible_response_unsupported')
    decodeChoicePayload({ payload, source: input.source, choiceIndex, collector: input.collector, items })
    if (!('finish_reason' in choice) || (choice.finish_reason !== null && typeof choice.finish_reason !== 'string')) throw unsupported()
    if (input.source === 'non_stream' && choice.finish_reason === null) throw unsupported()
    items.push(Object.freeze({ kind: 'finish', choiceIndex, finishReason: choice.finish_reason as string | null }))
    for (const candidate of input.collector.collect({ object: choice, knownKeys: CHOICE_KEYS, sourcePath: ['choices', choiceIndex], choiceIndex })) {
      items.push(Object.freeze({ kind: 'extension', candidate }))
    }
  }
  if ('usage' in root && root.usage !== null) {
    const usage = asObject(root.usage, 'compatible_response_unsupported')
    items.push(Object.freeze({ kind: 'usage', usage: Object.freeze({ ...usage }) }))
  }
  return { items, choiceIndexes: Object.freeze([...indexes]) }
}

function decodeChoicePayload(input: Readonly<{
  payload: Readonly<Record<string, CompatibleJsonValue>>
  source: CompatibleWireSource
  choiceIndex: number
  collector: CompatibleExtensionCollector
  items: CompatibleDecodedItem[]
}>): void {
  if ('role' in input.payload) {
    if (typeof input.payload.role !== 'string' || !ROLES.has(input.payload.role)) throw unsupported()
    input.items.push(Object.freeze({ kind: 'role', choiceIndex: input.choiceIndex, role: input.payload.role as 'system' | 'developer' | 'user' | 'assistant' | 'tool' }))
  } else if (input.source === 'non_stream') {
    throw unsupported()
  }
  if ('content' in input.payload) {
    const content = input.payload.content
    if (!(content === null || typeof content === 'string' || Array.isArray(content))) throw unsupported()
    input.items.push(Object.freeze({ kind: 'content', choiceIndex: input.choiceIndex, content: content as string | null | readonly CompatibleJsonValue[] }))
  }
  if ('tool_calls' in input.payload) {
    if (!Array.isArray(input.payload.tool_calls)) throw toolInvalid()
    const seen = new Set<number>()
    for (let position = 0; position < input.payload.tool_calls.length; position += 1) {
      const fragment = decodeToolFragment(input.payload.tool_calls[position], {
        source: input.source,
        ...(input.source === 'non_stream' ? { defaultIndex: position } : {}),
      })
      if (seen.has(fragment.toolIndex)) throw toolInvalid()
      seen.add(fragment.toolIndex)
      input.items.push(Object.freeze({ kind: 'tool', choiceIndex: input.choiceIndex, fragment }))
      const tool = input.payload.tool_calls[position] as Record<string, CompatibleJsonValue>
      for (const candidate of input.collector.collect({ object: tool, knownKeys: TOOL_KEYS, sourcePath: ['choices', input.choiceIndex, input.source === 'stream' ? 'delta' : 'message', 'tool_calls', fragment.toolIndex], choiceIndex: input.choiceIndex })) {
        input.items.push(Object.freeze({ kind: 'extension', candidate }))
      }
      if (isObject(tool.function)) {
        for (const candidate of input.collector.collect({ object: tool.function, knownKeys: FUNCTION_KEYS, sourcePath: ['choices', input.choiceIndex, input.source === 'stream' ? 'delta' : 'message', 'tool_calls', fragment.toolIndex, 'function'], choiceIndex: input.choiceIndex })) {
          input.items.push(Object.freeze({ kind: 'extension', candidate }))
        }
      }
    }
  }
  for (const candidate of input.collector.collect({
    object: input.payload,
    knownKeys: CONTENT_KEYS,
    sourcePath: ['choices', input.choiceIndex, input.source === 'stream' ? 'delta' : 'message'],
    choiceIndex: input.choiceIndex,
  })) input.items.push(Object.freeze({ kind: 'extension', candidate }))
}

function decodeToolFragment(value: CompatibleJsonValue, input: Readonly<{ source: CompatibleWireSource; defaultIndex?: number }>): CompatibleToolFragment {
  const tool = asObject(value, 'compatible_tool_delta_invalid')
  const rawIndex = input.source === 'non_stream' ? input.defaultIndex : tool.index
  if (!Number.isInteger(rawIndex) || (rawIndex as number) < 0) throw toolInvalid()
  if (input.source === 'non_stream' && 'index' in tool && tool.index !== rawIndex) throw toolInvalid()
  if ('id' in tool && typeof tool.id !== 'string') throw toolInvalid()
  if ('type' in tool && tool.type !== 'function') throw toolInvalid()
  if ('function' in tool && !isObject(tool.function)) throw toolInvalid()
  const fn = isObject(tool.function) ? tool.function : undefined
  if (fn && 'name' in fn && typeof fn.name !== 'string') throw toolInvalid()
  if (fn && 'arguments' in fn && typeof fn.arguments !== 'string') throw toolInvalid()
  if (!('id' in tool) && !('type' in tool) && !fn) throw toolInvalid()
  if (input.source === 'non_stream' && (
    typeof tool.id !== 'string' || tool.id.length === 0 ||
    tool.type !== 'function' || !fn ||
    typeof fn.name !== 'string' || fn.name.length === 0 ||
    !('arguments' in fn) || typeof fn.arguments !== 'string'
  )) throw toolInvalid()
  return Object.freeze({
    toolIndex: rawIndex as number,
    ...(typeof tool.id === 'string' ? { id: tool.id } : {}),
    ...(tool.type === 'function' ? { type: 'function' as const } : {}),
    ...(fn && typeof fn.name === 'string' ? { functionName: fn.name } : {}),
    ...(fn && typeof fn.arguments === 'string' ? { argumentsFragment: fn.arguments } : {}),
  })
}

function decodeMeta(root: Readonly<Record<string, CompatibleJsonValue>>): CompatibleResponseMeta {
  if ('id' in root && typeof root.id !== 'string') throw unsupported()
  if ('object' in root && typeof root.object !== 'string') throw unsupported()
  if ('created' in root && (!Number.isInteger(root.created) || (root.created as number) < 0)) throw unsupported()
  if ('model' in root && typeof root.model !== 'string') throw unsupported()
  if ('system_fingerprint' in root && root.system_fingerprint !== null && typeof root.system_fingerprint !== 'string') throw unsupported()
  if ('service_tier' in root && root.service_tier !== null && typeof root.service_tier !== 'string') throw unsupported()
  return Object.freeze({
    ...(typeof root.id === 'string' ? { id: root.id } : {}),
    ...(typeof root.object === 'string' ? { object: root.object } : {}),
    ...(typeof root.created === 'number' ? { created: root.created } : {}),
    ...(typeof root.model === 'string' ? { model: root.model } : {}),
    ...('system_fingerprint' in root ? { systemFingerprint: root.system_fingerprint as string | null } : {}),
    ...('service_tier' in root ? { serviceTier: root.service_tier as string | null } : {}),
  })
}

function assertJsonValue(value: unknown): CompatibleJsonValue {
  let nodes = 0
  const visit = (candidate: unknown, depth: number): CompatibleJsonValue => {
    nodes += 1
    if (nodes > 100_000 || depth > 64) {
      throw createCompatibleWireError({ code: 'compatible_response_overflow', category: 'json' })
    }
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return candidate
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) throw unsupported()
      return candidate
    }
    if (Array.isArray(candidate)) return candidate.map((child) => visit(child, depth + 1))
    if (isObject(candidate)) {
      const result: Record<string, CompatibleJsonValue> = {}
      for (const [key, child] of Object.entries(candidate)) result[key] = visit(child, depth + 1)
      return result
    }
    throw unsupported()
  }
  return visit(value, 0)
}

function asObject(value: CompatibleJsonValue | undefined, code: 'compatible_response_unsupported' | 'compatible_tool_delta_invalid'): Readonly<Record<string, CompatibleJsonValue>> {
  if (!isObject(value)) {
    if (code === 'compatible_tool_delta_invalid') throw toolInvalid()
    throw unsupported()
  }
  return value
}

function isObject(value: unknown): value is Record<string, CompatibleJsonValue> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype)
}

function unsupported() {
  return createCompatibleWireError({ code: 'compatible_response_unsupported', category: 'shape' })
}

function toolInvalid() {
  return createCompatibleWireError({ code: 'compatible_tool_delta_invalid', category: 'tool' })
}
