import { z } from 'zod'
import { compatibleBoundedJsonValueSchema } from '../schemas'
import { compatibleModelIdSchema } from '../identity'
import type { CompatibleJsonValue } from './messageTypes'

const compatibleContentPartSchemaV2 = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }).strict(),
  z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string(), detail: z.enum(['auto', 'low', 'high']).optional() }).strict() }).strict(),
])
const compatibleContentSchemaV2 = z.union([z.string(), z.array(compatibleContentPartSchemaV2)])

export const compatibleWireMessageSchemaV2 = z.discriminatedUnion('role', [
  z.object({ role: z.enum(['system', 'developer', 'user']), content: compatibleContentSchemaV2 }).strict(),
  z.object({ role: z.literal('assistant'), content: compatibleContentSchemaV2.nullable(), tool_calls: z.array(z.object({ id: z.string(), type: z.literal('function'),
    function: z.object({ name: z.string(), arguments: z.string() }).strict() }).strict()).optional() }).strict(),
  z.object({ role: z.literal('tool'), tool_call_id: z.string(), content: z.string() }).strict(),
])

function stableStringify(value: CompatibleJsonValue): string {
  const sort = (candidate: CompatibleJsonValue): CompatibleJsonValue => {
    if (Array.isArray(candidate)) return candidate.map(sort)
    if (!candidate || typeof candidate !== 'object') return candidate
    return Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, sort(candidate[key]!)]))
  }
  return JSON.stringify(sort(value))
}

function assertCompatibleWireJson(value: Record<string, CompatibleJsonValue>): Record<string, CompatibleJsonValue> {
  let nodes = 0
  const visit = (candidate: CompatibleJsonValue, depth: number): void => {
    nodes += 1
    if (nodes > 100_000 || depth > 32) throw new Error('compatible_request_body_overflow')
    if (candidate === null || typeof candidate === 'boolean' || typeof candidate === 'string') return
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) throw new Error('compatible_request_body_invalid')
      return
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item, depth + 1)
      return
    }
    if (Object.getPrototypeOf(candidate) !== Object.prototype) throw new Error('compatible_request_body_invalid')
    for (const [key, child] of Object.entries(candidate)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error('compatible_request_body_invalid')
      visit(child, depth + 1)
    }
  }
  visit(value, 0)
  if (new TextEncoder().encode(stableStringify(value)).byteLength > 2 * 1024 * 1024) {
    throw new Error('compatible_request_body_overflow')
  }
  return value
}

/** Shared structural validator for the builder and API body contract registry. */
export function validateCompatibleChatRequestBodyV2(value: unknown): Record<string, CompatibleJsonValue> {
  const parsed = compatibleBoundedJsonValueSchema.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('compatible_request_body_invalid')
  const body = parsed as Record<string, CompatibleJsonValue>
  compatibleModelIdSchema.parse(body.model)
  if (typeof body.stream !== 'boolean') throw new Error('compatible_request_body_invalid')
  const messages = compatibleWireMessageSchemaV2.array().min(1).max(512).safeParse(body.messages)
  if (!messages.success) throw new Error('compatible_request_body_invalid')
  return assertCompatibleWireJson(body)
}
