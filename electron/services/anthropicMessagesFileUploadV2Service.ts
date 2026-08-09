import { session } from 'electron'
import { consumeVerifiedAttachmentSendBytesLeaseV2, type VerifiedAttachmentSendBytesLeaseV2 } from '../../infra/db/repo/attachmentAssetV2Repo'
import { AnthropicMessagesFileDescriptorV2Repo, type AnthropicMessagesFileDescriptorV2 } from '../../infra/db/repo/anthropicMessagesFileDescriptorV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { isEpoch2RuntimeCredentialLease, type Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'

const FILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u

export class AnthropicMessagesFileUploadV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_FILE_UPLOAD_INPUT_INVALID'
    | 'GENERATION_V2_ANTHROPIC_FILE_UPLOAD_CREDENTIAL_INVALID'
    | 'GENERATION_V2_ANTHROPIC_FILE_UPLOAD_NETWORK_FAILED'
    | 'GENERATION_V2_ANTHROPIC_FILE_UPLOAD_RESPONSE_INVALID'
    | 'GENERATION_V2_ANTHROPIC_FILE_UPLOAD_REJECTED') {
    super(code); this.name = 'AnthropicMessagesFileUploadV2ServiceError'
  }
}
function fail(code: AnthropicMessagesFileUploadV2ServiceError['code']): never { throw new AnthropicMessagesFileUploadV2ServiceError(code) }

export function createAnthropicMessagesFileUploadV2Service(input: Readonly<{
  credentialService: Epoch2RuntimeCredentialService
  descriptorRepo: AnthropicMessagesFileDescriptorV2Repo
  fetchImpl?: typeof session.defaultSession.fetch
}>) {
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  return Object.freeze({
    upload: async (request: Readonly<{
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      bytesLease: VerifiedAttachmentSendBytesLeaseV2
      signal?: AbortSignal
    }>): Promise<AnthropicMessagesFileDescriptorV2> => {
      if (!Number.isSafeInteger(request.expectedCredentialRevision) || typeof fetchImpl !== 'function') fail('GENERATION_V2_ANTHROPIC_FILE_UPLOAD_INPUT_INVALID')
      return input.credentialService.withCredential({
        providerKey: 'anthropic', expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (lease) => {
          if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'anthropic' || lease.credentialScopeId !== request.expectedCredentialScopeId) fail('GENERATION_V2_ANTHROPIC_FILE_UPLOAD_CREDENTIAL_INVALID')
          lease.assertCurrent()
          return consumeVerifiedAttachmentSendBytesLeaseV2(request.bytesLease, async (bytes) => {
            const payload = new Uint8Array(bytes); const body = new FormData()
            try {
              body.append('file', new Blob([payload], { type: request.bytesLease.mime }), request.bytesLease.filename)
              let response: Response
              try {
                response = await fetchImpl('https://api.anthropic.com/v1/files', { method: 'POST', headers: {
                  'x-api-key': lease.credential, 'anthropic-version': '2023-06-01',
                  'anthropic-beta': 'files-api-2025-04-14', accept: 'application/json',
                }, body, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: request.signal })
              } catch { fail('GENERATION_V2_ANTHROPIC_FILE_UPLOAD_NETWORK_FAILED') }
              const raw = await response.text()
              let parsed: unknown
              try { parsed = JSON.parse(raw) } catch { fail('GENERATION_V2_ANTHROPIC_FILE_UPLOAD_RESPONSE_INVALID') }
              if (!response.ok) fail('GENERATION_V2_ANTHROPIC_FILE_UPLOAD_REJECTED')
              if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof (parsed as { id?: unknown }).id !== 'string' || !FILE_ID_PATTERN.test((parsed as { id: string }).id)) fail('GENERATION_V2_ANTHROPIC_FILE_UPLOAD_RESPONSE_INVALID')
              lease.assertCurrent()
              return input.descriptorRepo.insertOrGet({ credentialScopeId: lease.credentialScopeId, assetRevisionId: request.bytesLease.assetRevisionId.value, assetSha256: request.bytesLease.assetSha256.value, fileId: (parsed as { id: string }).id })
            } finally { payload.fill(0) }
          })
        },
      })
    },
  })
}
