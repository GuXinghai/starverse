import {
  type GenerationConfigRevisionEntryV2,
} from '../../../src/core/generation-v2/config/generationConfigRevisionV2'
import {
  decodeGenerationIntentLayerV2,
} from '../../../src/core/generation-v2/domain/generationIntentV2'
import {
  projectGenerationIntentLayerV2,
} from '../../../src/core/generation-v2/domain/generationIntentProjectionV2'
import {
  decodeResolvedGenerationIntentV2,
  type ResolvedGenerationIntentV2,
} from '../../../src/core/generation-v2/domain/resolvedGenerationIntentV2'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../../src/core/generation-v2/domain/conversationGraphV2'
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
  registerGenerationV2AuthorityTransactionParticipantForContextV2,
  readGenerationV2AuthorityTransactionDatabaseV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'
import type { ResolvedCapabilityV2 } from '../../../src/core/generation-v2/capability/resolvedCapabilityV2'
import { compatibleGenerationIntentV2, type RequestAttachmentMetadataV2 } from '../../../src/core/generation-v2/compiler/compatibleGenerationIntentV2'
import { clearRequestAdaptationsV2, readRequestAdaptationDecisionsV2, recordRequestAdaptationV2 } from '../../../src/core/generation-v2/compiler/requestAdaptationV2'
import { createEffectiveRequestPlanV2, type EffectiveRequestPlanV2 } from '../../../src/core/generation-v2/compiler/effectiveRequestPlanV2'
import { inspectRequestTextEncodingV2 } from './portableGenerationHistoryV2'
import { readGenerationRequestRulesV2 } from './generationRequestRulesV2Repo'
import { ResolvedModelFactsV1Repo } from './resolvedModelFactsV1Repo'
import { SourcePriorityConfigV1Repo } from './sourcePriorityConfigV1Repo'
import { resolveRequestRulesV2 } from '../../../src/core/generation-v2/capability-rules/requestRuleResolverV2'
import { projectRequestFactOverlayV2 } from '../../../src/core/generation-v2/capability-rules/requestFactOverlayV2'
import { createResolvedInvocationV2 } from '../../../src/core/generation-v2/compiler/resolvedInvocationV2'
import { adaptRequestAttachmentTransportV2 } from '../../../src/core/generation-v2/compiler/requestAttachmentTransportV2'
import { ToolRegistryV2Repo } from './toolRegistryV2Repo'

export type GenerationCommandFactsAuthorityV2 = Readonly<{
  trust: 'generation_command_facts_authority'
  usage: 'snapshot_semantics_and_attachment_provenance_only'
  executionAuthority: 'none'
  conversationId: GraphIdentity<'conversation_id'>
  semanticIntent: ResolvedGenerationIntentV2
  requestPlan?: EffectiveRequestPlanV2
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

export function isGenerationCommandFactsAuthorityForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is GenerationCommandFactsAuthorityV2 {
  return isGenerationCommandFactsAuthorityV2(value) && authorityContexts.get(value) === context
}

export function withSynchronousGenerationCommandFactsAuthorityV2<T>(
  context: GenerationV2AuthorityTransactionContextV2,
  configRepo: GenerationConfigV2Repo,
  attachmentRepo: AttachmentAssetV2Repo,
  conversationId: string,
  commandAttachments: unknown,
  expectedConfigRevisions: unknown | undefined,
  use: (authority: GenerationCommandFactsAuthorityV2) => T extends PromiseLike<unknown> ? never : T,
  target?: Readonly<{ operationId: string; capability: ResolvedCapabilityV2 }>,
): T {
  if (!(configRepo instanceof GenerationConfigV2Repo) ||
      !(attachmentRepo instanceof AttachmentAssetV2Repo) || typeof use !== 'function') {
    throw new GenerationCommandFactsAuthorityV2Error('GENERATION_V2_COMMAND_FACTS_INVALID')
  }
  if (commandAttachments === undefined) {
    throw new GenerationCommandFactsAuthorityV2Error('GENERATION_V2_COMMAND_ATTACHMENTS_REQUIRED')
  }
  let exactConversationId: GraphIdentity<'conversation_id'>
  try {
    exactConversationId = ConversationGraphV2Identity.create('conversation_id', conversationId)
  } catch {
    throw new GenerationCommandFactsAuthorityV2Error('GENERATION_V2_COMMAND_FACTS_INVALID')
  }
  const attachmentLayer = decodeGenerationIntentLayerV2({
    schemaVersion: 2,
    attachments: commandAttachments,
  })
  if (attachmentLayer.attachments === undefined) {
    throw new GenerationCommandFactsAuthorityV2Error('GENERATION_V2_COMMAND_FACTS_INVALID')
  }
  const binding = target?.capability.executionContext.binding
  const config = configRepo.resolveForConversation(context, exactConversationId.value, expectedConfigRevisions,
    binding ? { providerId: binding.providerId.value, endpointProfileId: binding.endpointProfileId.value,
      protocolContractId: binding.protocolContractId.value, operation: binding.operation, modelId: binding.modelId.value } : undefined)
  const projectedConfig = projectGenerationIntentLayerV2(config.semanticIntent)
  const projectedAttachments = projectGenerationIntentLayerV2({
    schemaVersion: 2,
    attachments: attachmentLayer.attachments,
  }).attachments
  const requestedIntent = decodeResolvedGenerationIntentV2({
    ...projectedConfig,
    attachments: projectedAttachments,
  })
  // Verify every original reference before any request-only adaptation removes
  // or changes its transport shape. Conversion provenance remains unchanged.
  const metadata = attachmentRepo.withSynchronousResolvedIntentAttachmentSetAuthority(context, requestedIntent, set =>
    new Map<string, RequestAttachmentMetadataV2>(set.attachments.map(item => [item.revision.assetRevisionId.value,
      { mime: item.revision.blob.mime, sizeBytes: item.revision.blob.sizeBytes, assetKind: item.revision.assetKind,
        utf8Valid: inspectRequestTextEncodingV2(readGenerationV2AuthorityTransactionDatabaseV2(context), item.revision) }])))
  const db = readGenerationV2AuthorityTransactionDatabaseV2(context)
  const baseFacts = target?.capability.modelFactsResolution
    ? new ResolvedModelFactsV1Repo(db).readSnapshot(target.capability.modelFactsResolution.resolvedSnapshotRevision).resolvedFacts : undefined
  const rules = baseFacts ? readGenerationRequestRulesV2(db, baseFacts.input.subject) : undefined
  const sourcePriority = rules ? new SourcePriorityConfigV1Repo(db).get().config : undefined
  if (baseFacts && sourcePriority && baseFacts.input.sourcePriorityConfigRevision !== sourcePriority.sourcePriorityConfigRevision) {
    throw new Error('GENERATION_V2_RESOLVED_CAPABILITY_STALE')
  }
  // Only an existing V1 rules installation selects the named migration entry.
  // Fresh profiles use the new resolver even without packs: absence of Rules
  // must not silently execute model policies from the predecessor implementation.
  const legacyV1Installation = rules && rules.ownerSnapshotRevisions.length === 0 &&
    Boolean(db.prepare('SELECT 1 FROM capability_rule_owner_snapshot_v1 LIMIT 1').get())
  const hasRuleOnlyRawFields = requestedIntent.value.requestedParameters !== undefined ||
    requestedIntent.value.web.searchPrompt !== undefined
  if (target && hasRuleOnlyRawFields && (!baseFacts || !rules || legacyV1Installation)) {
    // New request-only raw fields must pass the reviewed V2 rule resolver.
    // Keep predecessor fixtures on the legacy path only when they contain no
    // fields that the old compatible policy cannot account for.
    throw new GenerationCommandFactsAuthorityV2Error('GENERATION_V2_COMMAND_FACTS_INVALID')
  }
  const toolRegistryContext = target && rules && !legacyV1Installation && requestedIntent.value.tools.mode === 'enabled'
    ? (() => {
      const toolRegistry = new ToolRegistryV2Repo(db).resolveCurrentForTools(context,
        requestedIntent.value.tools.allowedToolIds.map((toolId) => toolId.value))
      return Object.freeze({ registryRevision: toolRegistry.registry.revision,
        definitionsDigest: toolRegistry.registry.definitionsDigest,
        selectedDefinitions: toolRegistry.selectedDefinitions })
    })()
    : undefined
  const resolution = target && rules && !legacyV1Installation ? resolveRequestRulesV2({
    requested: requestedIntent.value, capability: target.capability, bundle: rules,
    ...(toolRegistryContext === undefined ? {} : { toolDefinitions: toolRegistryContext }),
    resolveFacts: baseFacts && sourcePriority ? claims => projectRequestFactOverlayV2({ base: baseFacts,
      capability: target.capability, sourcePriority, claims }) : undefined,
    attachmentTransport: (intent, capability) => adaptRequestAttachmentTransportV2(target.operationId, intent, capability, metadata),
  }) : undefined
  if (target && resolution) for (const decision of resolution.adaptations) recordRequestAdaptationV2(target.operationId,
    { ...decision, path: `settings.${decision.path}` })
  const resolvedIntent = resolution?.intent ?? (target
    ? compatibleGenerationIntentV2(target.operationId, requestedIntent.value, target.capability, metadata) : requestedIntent)
  const invocation = target && resolution && rules ? createResolvedInvocationV2({ requested: requestedIntent.value,
    capability: target.capability, bundle: rules, resolution }) : undefined
  const requestPlan = target ? createEffectiveRequestPlanV2({ requested: requestedIntent.value,
    effective: resolvedIntent.value, capability: target.capability,
    decisions: readRequestAdaptationDecisionsV2(target.operationId), resolution: invocation }) : undefined
  if (target) registerGenerationV2AuthorityTransactionParticipantForContextV2(context, {
    preCommit: () => undefined,
    committed: () => clearRequestAdaptationsV2(target.operationId),
    rolledBack: () => clearRequestAdaptationsV2(target.operationId),
  })
  return attachmentRepo.withSynchronousResolvedIntentAttachmentSetAuthority(
    context,
    resolvedIntent,
    (attachmentSet) => {
      const authority = Object.freeze({
        trust: 'generation_command_facts_authority' as const,
        usage: 'snapshot_semantics_and_attachment_provenance_only' as const,
        executionAuthority: 'none' as const,
        conversationId: exactConversationId,
        semanticIntent: resolvedIntent.value,
        ...(requestPlan === undefined ? {} : { requestPlan }),
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
