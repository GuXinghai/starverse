import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import {
  OpenAIResponsesFileDescriptorV2Repo,
  type OpenAIResponsesFileDescriptorV2,
} from '../../infra/db/repo/openAIResponsesFileDescriptorV2Repo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import {
  requiresProviderFileBindingV2,
  type AttachmentIntentV2,
} from '../../src/next/generation-v2/domain/generationIntentV2'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { createOpenAIResponsesFileUploadV2Service } from './openAIResponsesFileUploadV2Service'

export class OpenAIResponsesAttachmentPreflightV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_ATTACHMENT_BLOB_AUTHORITY_REQUIRED') {
    super(code)
    this.name = 'OpenAIResponsesAttachmentPreflightV2Error'
  }
}

type IncludedOpenAIFileIntentV2 = Extract<AttachmentIntentV2, Readonly<{
  kind: 'managed_file'
  sendAs: 'provider_file' | 'converted_document'
  conversion: 'none' | 'pdf'
}>>

export function isIncludedOpenAIResponsesFileIntentV2(
  attachment: AttachmentIntentV2,
): attachment is IncludedOpenAIFileIntentV2 {
  return requiresProviderFileBindingV2(attachment)
}

/**
 * Resolves an immutable OpenAI file descriptor for every included provider-file
 * attachment before the generation command mutates the conversation graph.
 * An already-persisted descriptor is reused; byte access remains limited to the
 * epoch-2 blob authority when an upload is necessary.
 */
export async function preflightOpenAIResponsesAttachmentDescriptorsV2(input: Readonly<{
  db: BetterSqlite3.Database
  attachmentRepo: AttachmentAssetV2Repo
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
  descriptorRepo: OpenAIResponsesFileDescriptorV2Repo
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  commandAttachments: readonly AttachmentIntentV2[]
  expectedCredentialRevision: number
  expectedCredentialScopeId: CredentialScopeIdV2
  signal?: AbortSignal
}>): Promise<readonly OpenAIResponsesFileDescriptorV2[]> {
  const includedProviderFiles = input.commandAttachments.filter(isIncludedOpenAIResponsesFileIntentV2)
  if (includedProviderFiles.length === 0) return Object.freeze([])
  const upload = createOpenAIResponsesFileUploadV2Service({
    credentialService: input.credentialService,
    descriptorRepo: input.descriptorRepo,
    fetchImpl: input.fetchImpl,
  })
  const descriptors: OpenAIResponsesFileDescriptorV2[] = []
  for (const intent of includedProviderFiles) {
    const existing = input.descriptorRepo.findByAttachment({
      credentialScopeId: input.expectedCredentialScopeId,
      assetRevisionId: intent.assetRevisionId.value,
      assetSha256: intent.assetSha256.value,
    })
    if (existing) {
      descriptors.push(existing)
      continue
    }
    if (!input.attachmentBlobStore) {
      throw new OpenAIResponsesAttachmentPreflightV2Error(
        'GENERATION_V2_OPENAI_ATTACHMENT_BLOB_AUTHORITY_REQUIRED',
      )
    }
    const bytesLease = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) =>
      input.attachmentBlobStore!.verifySnapshotAttachmentSendBytes({
        attachmentRepo: input.attachmentRepo,
        context,
        intent,
      }),
    )
    descriptors.push(await upload.upload({
      expectedCredentialRevision: input.expectedCredentialRevision,
      expectedCredentialScopeId: input.expectedCredentialScopeId,
      bytesLease,
      signal: input.signal,
    }))
  }
  return Object.freeze(descriptors)
}
