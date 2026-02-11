import { z } from 'zod'
import type { OpenRouterStreamWireError, OpenRouterStreamWireEvent } from '@/shared/ipc/openRouterStreamWire'
import { decodeWithSchema } from './decodeError'

const wireHeadersSchema = z.record(z.string())

export const openRouterStreamWireErrorSchema: z.ZodType<OpenRouterStreamWireError> = z.object({
  kind: z.enum(['http_error', 'transport_error', 'aborted']),
  message: z.string(),
  name: z.string().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  status: z.number().finite().optional(),
  statusText: z.string().optional(),
  headers: wireHeadersSchema.optional(),
  bodyText: z.string().optional(),
}).passthrough()

export const openRouterStreamWireChunkSchema = z.object({
  type: z.literal('chunk'),
  data: z.string(),
}).passthrough()

export const openRouterStreamWireResponseMetaSchema = z.object({
  type: z.literal('responseMeta'),
  status: z.number().finite(),
  requestId: z.string().optional(),
  provider: z.string().optional(),
  headers: wireHeadersSchema.optional(),
}).passthrough()

export const openRouterStreamWireErrorEventSchema = z.object({
  type: z.literal('error'),
  error: openRouterStreamWireErrorSchema,
}).passthrough()

export const openRouterStreamWireEndSchema = z.object({
  type: z.literal('end'),
}).passthrough()

export const openRouterStreamWireEventSchema: z.ZodType<OpenRouterStreamWireEvent> = z.discriminatedUnion('type', [
  openRouterStreamWireChunkSchema,
  openRouterStreamWireResponseMetaSchema,
  openRouterStreamWireErrorEventSchema,
  openRouterStreamWireEndSchema,
])

export function decodeOpenRouterStreamWireEvent(raw: unknown): OpenRouterStreamWireEvent {
  return decodeWithSchema('openrouter.stream.wire.event', openRouterStreamWireEventSchema, raw)
}
