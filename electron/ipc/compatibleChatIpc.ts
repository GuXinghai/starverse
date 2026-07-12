import { z } from 'zod'
import type { CompatibleWireEvent } from '../../src/shared/provider/openai-chat-compatible'
import { compatibleHistoricalRouteLookupSchema, compatibleRouteSelectedPinsSchema, compatibleRouteSelectionSchema } from '../../src/shared/provider/openai-chat-compatible'
import type { CompatibleChatRuntimeService } from '../services/compatibleChatRuntimeService'
import type { RegisterInvoke } from './types'

export const COMPATIBLE_CHAT_CHANNELS = ['compatible-chat:preflight', 'compatible-chat:start', 'compatible-chat:abort', 'compatible-chat:resolve-historical'] as const
export const COMPATIBLE_CHAT_EVENT_CHANNEL = 'compatible-chat:event'
export const COMPATIBLE_CHAT_PREPARED_CHANNEL = 'compatible-chat:prepared'
export const COMPATIBLE_CHAT_END_CHANNEL = 'compatible-chat:end'

const requestIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/u)
const startSchema = z.object({
  requestId: requestIdSchema,
  selection: z.union([compatibleRouteSelectedPinsSchema, compatibleRouteSelectionSchema]),
  turn: z.object({ branchId: z.string().min(1), userBody: z.string(), userMeta: z.record(z.unknown()).nullable().optional() }).strict(),
  messages: z.array(z.unknown()).min(1).max(10_000),
  stream: z.boolean(),
  fields: z.record(z.unknown()).optional(),
  reasoningControls: z.record(z.unknown()).optional(),
  extraBody: z.unknown().optional(),
  historicalSource: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('request_message'), messageId: z.string().min(1).max(256) }).strict(),
    z.object({ kind: z.literal('choice_message'), messageId: z.string().min(1).max(256) }).strict(),
    z.object({ kind: z.literal('route'), routeProvenanceId: z.string().min(1).max(256) }).strict(),
  ]).optional(),
  existingHistoricalTurn: z.object({
    sourceRouteProvenanceId: z.string().startsWith('ocp_route_').max(106),
    branchId: z.string().min(1).max(256), questionId: z.string().min(1).max(256), assistantId: z.string().min(1).max(256),
  }).strict().optional(),
  existingPreparedTurn: z.object({
    routeProvenanceId: z.string().startsWith('ocp_route_').max(106),
    branchId: z.string().min(1).max(256), questionId: z.string().min(1).max(256), assistantId: z.string().min(1).max(256),
  }).strict().optional(),
}).strict().refine((value) => [value.historicalSource, value.existingHistoricalTurn, value.existingPreparedTurn].filter(Boolean).length <= 1, {
  message: 'compatible turn sources are mutually exclusive',
}).superRefine((value, context) => {
  const historical = Boolean(value.historicalSource || value.existingHistoricalTurn)
  if (!historical && !compatibleRouteSelectedPinsSchema.safeParse(value.selection).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['selection'], message: 'New compatible sends require exact selected pins.' })
  }
  if (historical && !compatibleRouteSelectionSchema.safeParse(value.selection).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['selection'], message: 'Historical compatible sends accept only source identity.' })
  }
})
const abortSchema = z.object({ requestId: requestIdSchema }).strict()

type Sender = Readonly<{
  id: number
  send: (channel: string, payload: unknown) => void
  isDestroyed?: () => boolean
  once: (event: 'destroyed', listener: () => void) => unknown
  removeListener: (event: 'destroyed', listener: () => void) => unknown
}>

export function registerCompatibleChatIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  service: CompatibleChatRuntimeService
}>): string[] {
  input.registerInvoke('compatible-chat:preflight', async (_event, raw) => {
    return input.service.preflight(compatibleRouteSelectedPinsSchema.parse(raw))
  })
  input.registerInvoke('compatible-chat:start', async (event, raw) => {
    const command = startSchema.parse(raw)
    const sender = senderFromEvent(event)
    const onDestroyed = () => { input.service.abortOwner(sender.id) }
    sender.once('destroyed', onDestroyed)
    try {
      const prepared = await input.service.start({ ...command, ownerWebContentsId: sender.id } as never, (wireEvent) => {
        if (sender.isDestroyed?.()) return
        sender.send(COMPATIBLE_CHAT_EVENT_CHANNEL, { requestId: command.requestId, event: rendererSafeEvent(wireEvent) })
      }, (preparedTurn) => {
        if (!sender.isDestroyed?.()) sender.send(COMPATIBLE_CHAT_PREPARED_CHANNEL, { requestId: command.requestId, prepared: preparedTurn })
      })
      const end = { requestId: command.requestId, ok: true as const, prepared }
      if (!sender.isDestroyed?.()) sender.send(COMPATIBLE_CHAT_END_CHANNEL, end)
      return end
    } catch (error) {
      const end = { requestId: command.requestId, ok: false as const, error: safeErrorCode(error) }
      if (!sender.isDestroyed?.()) sender.send(COMPATIBLE_CHAT_END_CHANNEL, end)
      return end
    } finally {
      sender.removeListener('destroyed', onDestroyed)
    }
  })
  input.registerInvoke('compatible-chat:abort', (event, raw) => {
    const command = abortSchema.parse(raw)
    const sender = senderFromEvent(event)
    return Object.freeze({ aborted: input.service.abort(command.requestId, sender.id) })
  })
  input.registerInvoke('compatible-chat:resolve-historical', async (_event, raw) => {
    const outcome = await input.service.resolveHistorical(compatibleHistoricalRouteLookupSchema.parse(raw))
    if (!outcome.ok) return Object.freeze({ ok: false as const, code: outcome.code })
    const route = outcome.value.route
    return Object.freeze({
      ok: true as const,
      route: {
        routeProvenanceId: route.routeProvenanceId,
        protocolKey: route.protocolKey,
        providerInstanceId: route.providerInstanceId,
        modelId: route.modelId,
      },
    })
  })
  return [...COMPATIBLE_CHAT_CHANNELS]
}

function rendererSafeEvent(event: CompatibleWireEvent): unknown {
  if (event.kind !== 'extension') return event
  return Object.freeze({
    kind: 'extension_observed', source: event.source, sequence: event.sequence,
    sourcePath: event.candidate.sourcePath,
    ...(event.candidate.choiceIndex === undefined ? {} : { choiceIndex: event.candidate.choiceIndex }),
  })
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code
  }
  if (error instanceof Error && /^compatible_[a-z0-9_:.-]+$/u.test(error.message)) return error.message
  return 'compatible_runtime_failed'
}

function senderFromEvent(event: unknown): Sender {
  const sender = event && typeof event === 'object' && 'sender' in event ? (event as { sender?: unknown }).sender : null
  if (!sender || typeof sender !== 'object') throw new Error('compatible_config_invalid')
  const candidate = sender as Partial<Sender>
  if (!Number.isInteger(candidate.id) || Number(candidate.id) < 1 || typeof candidate.send !== 'function' ||
      typeof candidate.once !== 'function' || typeof candidate.removeListener !== 'function') throw new Error('compatible_config_invalid')
  return candidate as Sender
}
