import type BetterSqlite3 from 'better-sqlite3'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import { createOpenRouterChatGenerationV2Runtime } from './openRouterChatGenerationV2Runtime'
import { createOpenRouterImageGenerationV2Runtime } from './openRouterImageGenerationV2Runtime'
import { createOpenRouterImageEndpointSelectionV2Service } from './openRouterImageEndpointSelectionV2Service'
import { readVerifiedOpenRouterFirstPartyEndpointProfileV2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'

export type OpenRouterFirstPartyGenerationV2Runtime = Readonly<{
  profileId: string
  chat: ReturnType<typeof createOpenRouterChatGenerationV2Runtime>
  images: ReturnType<typeof createOpenRouterImageGenerationV2Runtime>
  imageEndpoints: ReturnType<typeof createOpenRouterImageEndpointSelectionV2Service>
  abort: (operationId: string) => boolean
}>

/**
 * Shared profile/credential composition only. Chat and Images remain explicit
 * operation contracts with independent commands, codecs, runners and decoders.
 */
export function createOpenRouterFirstPartyGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  attachmentBlobStore: Epoch2AttachmentBlobStoreV2
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  nowMs?: () => number
}>): OpenRouterFirstPartyGenerationV2Runtime {
  const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  if (profile.endpointProfileId.value !== 'openrouter-first-party-v1') throw new Error('GENERATION_V2_OPENROUTER_PROFILE_INVALID')
  const chat = createOpenRouterChatGenerationV2Runtime(input)
  const images = createOpenRouterImageGenerationV2Runtime(input)
  const imageEndpoints = createOpenRouterImageEndpointSelectionV2Service(input)
  return Object.freeze({ profileId: profile.endpointProfileId.value, chat, images, imageEndpoints,
    abort: (operationId: string) => chat.abort(operationId) || images.abort(operationId) })
}
