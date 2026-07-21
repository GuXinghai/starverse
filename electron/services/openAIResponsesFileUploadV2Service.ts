import { session } from 'electron'
import {
  consumeVerifiedAttachmentSendBytesLeaseV2,
  type VerifiedAttachmentSendBytesLeaseV2,
} from '../../infra/db/repo/attachmentAssetV2Repo'
import {
  OpenAIResponsesFileDescriptorV2Repo,
  type OpenAIResponsesFileDescriptorV2,
} from '../../infra/db/repo/openAIResponsesFileDescriptorV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import { readVerifiedOpenAIResponsesEndpointProfileV2 } from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'

const FILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u
const MAX_RESPONSE_BYTES = 256 * 1024

export class OpenAIResponsesFileUploadV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_FILE_UPLOAD_INPUT_INVALID'
    | 'GENERATION_V2_OPENAI_FILE_UPLOAD_CREDENTIAL_INVALID'
    | 'GENERATION_V2_OPENAI_FILE_UPLOAD_NETWORK_FAILED'
    | 'GENERATION_V2_OPENAI_FILE_UPLOAD_RESPONSE_INVALID'
    | 'GENERATION_V2_OPENAI_FILE_UPLOAD_REJECTED') {
    super(code)
    this.name = 'OpenAIResponsesFileUploadV2ServiceError'
  }
}

function fail(code: OpenAIResponsesFileUploadV2ServiceError['code']): never {
  throw new OpenAIResponsesFileUploadV2ServiceError(code)
}

async function readBoundedResponseBytes(response: Response): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES)) {
    return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_RESPONSE_INVALID')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      const chunk = new Uint8Array(next.value)
      if (chunk.byteLength > MAX_RESPONSE_BYTES - total) {
        chunk.fill(0)
        await reader.cancel().catch(() => undefined)
        return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_RESPONSE_INVALID')
      }
      chunks.push(chunk)
      total += chunk.byteLength
    }
    const result = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.byteLength
    }
    return result
  } catch (error) {
    if (error instanceof OpenAIResponsesFileUploadV2ServiceError) throw error
    return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_RESPONSE_INVALID')
  } finally {
    for (const chunk of chunks) chunk.fill(0)
    reader.releaseLock()
  }
}

async function boundedJson(response: Response): Promise<Readonly<Record<string, unknown>>> {
  const bytes = await readBoundedResponseBytes(response)
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_RESPONSE_INVALID')
    return Object.freeze(value as Record<string, unknown>)
  } catch (error) {
    if (error instanceof OpenAIResponsesFileUploadV2ServiceError) throw error
    return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_RESPONSE_INVALID')
  } finally { bytes.fill(0) }
}

export function createOpenAIResponsesFileUploadV2Service(input: Readonly<{
  credentialService: Epoch2RuntimeCredentialService
  descriptorRepo: OpenAIResponsesFileDescriptorV2Repo
  fetchImpl?: typeof session.defaultSession.fetch
}>) {
  const endpoint = readVerifiedOpenAIResponsesEndpointProfileV2()
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  return Object.freeze({
    upload: async (request: Readonly<{
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      bytesLease: VerifiedAttachmentSendBytesLeaseV2
      signal?: AbortSignal
    }>): Promise<OpenAIResponsesFileDescriptorV2> => {
      if (!Number.isSafeInteger(request.expectedCredentialRevision) || request.expectedCredentialRevision < 0 ||
          typeof fetchImpl !== 'function') return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_INPUT_INVALID')
      return input.credentialService.withCredential({
        providerKey: 'openai_responses', expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (credential) => {
          if (!isEpoch2RuntimeCredentialLease(credential) || credential.providerKey !== 'openai_responses' ||
              credential.credentialScopeId !== request.expectedCredentialScopeId) {
            return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_CREDENTIAL_INVALID')
          }
          credential.assertCurrent()
          return consumeVerifiedAttachmentSendBytesLeaseV2(request.bytesLease, async (bytes) => {
            const body = new FormData()
            const payload = new Uint8Array(bytes)
            try {
              body.append('purpose', 'user_data')
              body.append('file', new Blob([payload], { type: request.bytesLease.mime }), request.bytesLease.filename)
              let response: Response
              try {
                response = await fetchImpl(new URL(endpoint.descriptor.filesPath, endpoint.descriptor.apiOrigin).toString(), {
                  method: 'POST', headers: { Authorization: `Bearer ${credential.credential}`, Accept: 'application/json' },
                  body, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: request.signal,
                })
              } catch { return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_NETWORK_FAILED') }
              if (!response.ok) {
                const discarded = await readBoundedResponseBytes(response)
                discarded.fill(0)
                return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_REJECTED')
              }
              const payloadJson = await boundedJson(response)
              if (typeof payloadJson.id !== 'string' || !FILE_ID_PATTERN.test(payloadJson.id) ||
                  payloadJson.purpose !== 'user_data') return fail('GENERATION_V2_OPENAI_FILE_UPLOAD_RESPONSE_INVALID')
              credential.assertCurrent()
              return input.descriptorRepo.insertOrGet({
                credentialScopeId: credential.credentialScopeId, assetRevisionId: request.bytesLease.assetRevisionId.value,
                assetSha256: request.bytesLease.assetSha256.value, fileId: payloadJson.id,
              })
            } finally { payload.fill(0) }
          })
        },
      })
    },
  })
}
