import { z } from 'zod'
import { providerInstanceIdSchema } from '../../src/shared/provider/openai-chat-compatible/identity'
import { buildCompatibleNetworkError } from '../../src/shared/network/compatibleNetworkError'
import type { CompatibleProviderTransportService } from '../services/compatibleProviderTransportService'
import type { RegisterInvoke } from './types'

export const COMPATIBLE_PROVIDER_TRANSPORT_CHANNELS = [
  'compatible-provider:test-connection',
  'compatible-provider:abort-connection-test',
] as const

const requestIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/u)
const testInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  requestId: requestIdSchema,
}).strict()
const abortInputSchema = z.object({ requestId: requestIdSchema }).strict()

type SenderLike = Readonly<{
  id: number
  once: (event: 'destroyed', listener: () => void) => unknown
  removeListener: (event: 'destroyed', listener: () => void) => unknown
}>

export function registerCompatibleProviderTransportIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  service: CompatibleProviderTransportService
}>): string[] {
  input.registerInvoke('compatible-provider:test-connection', async (event, raw) => {
    const command = testInputSchema.safeParse(raw)
    if (!command.success) return invalidConnectionTestResult()
    let sender: SenderLike
    try {
      sender = senderFromEvent(event)
    } catch {
      return invalidConnectionTestResult()
    }
    const onDestroyed = () => { input.service.abortOwner(sender.id) }
    sender.once('destroyed', onDestroyed)
    try {
      return await input.service.testConnection({ ...command.data, ownerWebContentsId: sender.id })
    } finally {
      sender.removeListener('destroyed', onDestroyed)
    }
  })
  input.registerInvoke('compatible-provider:abort-connection-test', (event, raw) => {
    const command = abortInputSchema.safeParse(raw)
    if (!command.success) return { aborted: false }
    let sender: SenderLike
    try {
      sender = senderFromEvent(event)
    } catch {
      return { aborted: false }
    }
    return input.service.abortConnectionTest({ ...command.data, ownerWebContentsId: sender.id })
  })
  return [...COMPATIBLE_PROVIDER_TRANSPORT_CHANNELS]
}

function invalidConnectionTestResult() {
  return Object.freeze({
    ok: false as const,
    requestId: 'invalid',
    error: buildCompatibleNetworkError({ code: 'compatible_config_invalid', stage: 'request' }),
  })
}

function senderFromEvent(event: unknown): SenderLike {
  const sender = event && typeof event === 'object' && 'sender' in event ? (event as { sender?: unknown }).sender : null
  if (!sender || typeof sender !== 'object') throw new Error('compatible_config_invalid')
  const candidate = sender as Partial<SenderLike>
  if (!Number.isInteger(candidate.id) || Number(candidate.id) < 1 || typeof candidate.once !== 'function' || typeof candidate.removeListener !== 'function') {
    throw new Error('compatible_config_invalid')
  }
  return candidate as SenderLike
}
