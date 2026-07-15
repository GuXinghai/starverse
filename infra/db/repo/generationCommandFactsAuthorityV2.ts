import {
  type GenerationConfigRevisionEntryV2,
} from '../../../src/next/generation-v2/config/generationConfigRevisionV2'
import {
  decodeGenerationIntentLayerV2,
} from '../../../src/next/generation-v2/domain/generationIntentV2'
import {
  projectGenerationIntentLayerV2,
} from '../../../src/next/generation-v2/domain/generationIntentProjectionV2'
import {
  decodeResolvedGenerationIntentV2,
  type ResolvedGenerationIntentV2,
} from '../../../src/next/generation-v2/domain/resolvedGenerationIntentV2'
import {
  AttachmentAssetV2Repo,
  isResolvedAttachmentSetAuthorityV2,
  type ResolvedAttachmentSetAuthorityV2,
} from './attachmentAssetV2Repo'
import {
  GenerationConfigV2Repo,
  isResolvedGenerationConfigAuthorityV2,
  type ResolvedGenerationConfigAuthorityV2,
} from './generationConfigV2Repo'
import {
  isGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

export type GenerationCommandFactsAuthorityV2 = Readonly<{
  trust: 'generation_command_facts_authority'
  usage: 'snapshot_semantics_and_attachment_provenance_only'
  executionAuthority: 'none'
  semanticIntent: ResolvedGenerationIntentV2
  resolvedConfigRevisions: readonly GenerationConfigRevisionEntryV2[]
  attachmentSet: ResolvedAttachmentSetAuthorityV2
}>

export class GenerationCommandFactsAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_COMMAND_ATTACHMENTS_REQUIRED'
    | 'GENERATION_V2_COMMAND_FACTS_INVALID') {
    super(code)
    this.name = 'GenerationCommandFactsAuthorityV2Error'
  }
}

const commandFactsAuthorities = new WeakSet<object>()
const authorityContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
const authorityDependencies = new WeakMap<object, Readonly<{
  config: ResolvedGenerationConfigAuthorityV2
  attachments: ResolvedAttachmentSetAuthorityV2
}>>()

export function isGenerationCommandFactsAuthorityV2(
  value: unknown,
): value is GenerationCommandFactsAuthorityV2 {
  if (!value || typeof value !== 'object' || !commandFactsAuthorities.has(value)) return false
  const context = authorityContexts.get(value)
  const dependencies = authorityDependencies.get(value)
  return Boolean(context && dependencies &&
    isGenerationV2AuthorityTransactionContextV2(context) &&
    isResolvedGenerationConfigAuthorityV2(dependencies.config) &&
    isResolvedAttachmentSetAuthorityV2(dependencies.attachments))
}

export function withSynchronousGenerationCommandFactsAuthorityV2<T>(
  context: GenerationV2AuthorityTransactionContextV2,
  configRepo: GenerationConfigV2Repo,
  attachmentRepo: AttachmentAssetV2Repo,
  conversationId: string,
  commandAttachments: unknown,
  expectedConfigRevisions: unknown | undefined,
  use: (authority: GenerationCommandFactsAuthorityV2) => T extends PromiseLike<unknown> ? never : T,
): T {
  if (!(configRepo instanceof GenerationConfigV2Repo) ||
      !(attachmentRepo instanceof AttachmentAssetV2Repo) || typeof use !== 'function') {
    throw new GenerationCommandFactsAuthorityV2Error('GENERATION_V2_COMMAND_FACTS_INVALID')
  }
  if (commandAttachments === undefined) {
    throw new GenerationCommandFactsAuthorityV2Error('GENERATION_V2_COMMAND_ATTACHMENTS_REQUIRED')
  }
  const attachmentLayer = decodeGenerationIntentLayerV2({
    schemaVersion: 2,
    attachments: commandAttachments,
  })
  if (attachmentLayer.attachments === undefined) {
    throw new GenerationCommandFactsAuthorityV2Error('GENERATION_V2_COMMAND_FACTS_INVALID')
  }
  const config = configRepo.resolveForConversation(context, conversationId, expectedConfigRevisions)
  const projectedConfig = projectGenerationIntentLayerV2(config.semanticIntent)
  const projectedAttachments = projectGenerationIntentLayerV2({
    schemaVersion: 2,
    attachments: attachmentLayer.attachments,
  }).attachments
  const resolvedIntent = decodeResolvedGenerationIntentV2({
    ...projectedConfig,
    attachments: projectedAttachments,
  })
  return attachmentRepo.withSynchronousResolvedIntentAttachmentSetAuthority(
    context,
    resolvedIntent,
    (attachmentSet) => {
      const authority = Object.freeze({
        trust: 'generation_command_facts_authority' as const,
        usage: 'snapshot_semantics_and_attachment_provenance_only' as const,
        executionAuthority: 'none' as const,
        semanticIntent: resolvedIntent.value,
        resolvedConfigRevisions: config.revisionSet,
        attachmentSet,
      })
      commandFactsAuthorities.add(authority)
      authorityContexts.set(authority, context)
      authorityDependencies.set(authority, Object.freeze({ config, attachments: attachmentSet }))
      try {
        return use(authority)
      } finally {
        commandFactsAuthorities.delete(authority)
        authorityContexts.delete(authority)
        authorityDependencies.delete(authority)
      }
    },
  )
}
