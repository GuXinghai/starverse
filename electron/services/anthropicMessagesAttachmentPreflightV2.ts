import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { AnthropicMessagesFileDescriptorV2Repo, type AnthropicMessagesFileDescriptorV2 } from '../../infra/db/repo/anthropicMessagesFileDescriptorV2Repo'
import type { AttachmentIntentV2, ManagedFileAttachmentIntentV2 } from '../../src/next/generation-v2/domain/generationIntentV2'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { createAnthropicMessagesFileUploadV2Service } from './anthropicMessagesFileUploadV2Service'

export class AnthropicMessagesAttachmentPreflightV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_ATTACHMENT_BLOB_AUTHORITY_REQUIRED'
    | 'GENERATION_V2_ANTHROPIC_ATTACHMENT_SHAPE_UNSUPPORTED') {
    super(code); this.name = 'AnthropicMessagesAttachmentPreflightV2Error'
  }
}
type IncludedFile = ManagedFileAttachmentIntentV2 & Readonly<{ sendAs: 'provider_file' | 'converted_document'; conversion: 'none' | 'pdf' }>
function isIncludedFile(attachment: AttachmentIntentV2): attachment is IncludedFile {
  return attachment.kind === 'managed_file' && attachment.include &&
    ((attachment.sendAs === 'provider_file' && attachment.conversion === 'none') ||
      (attachment.sendAs === 'converted_document' && attachment.conversion === 'pdf'))
}

export async function preflightAnthropicMessagesAttachmentDescriptorsV2(input: Readonly<{
  db: BetterSqlite3.Database
  attachmentRepo: AttachmentAssetV2Repo
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
  descriptorRepo: AnthropicMessagesFileDescriptorV2Repo
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  commandAttachments: readonly AttachmentIntentV2[]
  expectedCredentialRevision: number
  expectedCredentialScopeId: CredentialScopeIdV2
  signal?: AbortSignal
}>): Promise<readonly AnthropicMessagesFileDescriptorV2[]> {
  const included = input.commandAttachments.filter(isIncludedFile)
  if (input.commandAttachments.some((attachment) => attachment.include && attachment.kind === 'managed_file' &&
      attachment.sendAs === 'provider_file' && attachment.conversion === 'none' && !isIncludedFile(attachment))) {
    throw new AnthropicMessagesAttachmentPreflightV2Error('GENERATION_V2_ANTHROPIC_ATTACHMENT_SHAPE_UNSUPPORTED')
  }
  if (included.length === 0) return Object.freeze([])
  const upload = createAnthropicMessagesFileUploadV2Service({ credentialService: input.credentialService, descriptorRepo: input.descriptorRepo, fetchImpl: input.fetchImpl })
  const descriptors: AnthropicMessagesFileDescriptorV2[] = []
  for (const intent of included) {
    const existing = input.descriptorRepo.findByAttachment({ credentialScopeId: input.expectedCredentialScopeId, assetRevisionId: intent.assetRevisionId.value, assetSha256: intent.assetSha256.value })
    if (existing) { descriptors.push(existing); continue }
    if (!input.attachmentBlobStore) throw new AnthropicMessagesAttachmentPreflightV2Error('GENERATION_V2_ANTHROPIC_ATTACHMENT_BLOB_AUTHORITY_REQUIRED')
    const lease = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => input.attachmentBlobStore!.verifySnapshotAttachmentSendBytes({ attachmentRepo: input.attachmentRepo, context, intent }))
    descriptors.push(await upload.upload({ expectedCredentialRevision: input.expectedCredentialRevision, expectedCredentialScopeId: input.expectedCredentialScopeId, bytesLease: lease, signal: input.signal }))
  }
  return Object.freeze(descriptors)
}
