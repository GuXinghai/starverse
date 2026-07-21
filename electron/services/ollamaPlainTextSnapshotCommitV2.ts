import { canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2,decodeAssistantAnswerGenerationSnapshotV2 } from '../../src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2'
import { projectGenerationIntentLayerV2 } from '../../src/next/generation-v2/domain/generationIntentProjectionV2'
import { projectDecodedProviderBindingRecordV2 } from '../../src/next/generation-v2/domain/providerBindingV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import type { DecodedRuntimeCapabilitySnapshotV2 } from '../../src/next/generation-v2/capability/runtimeCapabilitySnapshotV2'
import { isPendingAnswerActionForContextV2,isPendingEditedTurnForContextV2,isPendingInitialTurnForContextV2,type PendingAnswerActionV2,type PendingEditedTurnV2,type PendingInitialTurnV2 } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo,isGenerationExecutionOperationBundleForContextV2,type GenerationExecutionOperationBundleV2 } from '../../infra/db/repo/generationExecutionV2Repo'
import { isGenerationCommandFactsAuthorityForContextV2,type GenerationCommandFactsAuthorityV2 } from '../../infra/db/repo/generationCommandFactsAuthorityV2'
import type { GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { RuntimeCapabilityV2Repo } from '../../infra/db/repo/runtimeCapabilityV2Repo'
import type { LocalEndpointProfileV2 } from '../../infra/db/repo/localEndpointProfileV2Repo'
import { createOllamaChatProviderBindingV2 } from '../../src/next/generation-v2/providers/ollama-chat/verifiedContractV2'
import { isOllamaChatEditResendCommandV2,isOllamaChatInitialCommandV2,isOllamaChatRegenerateCommandV2,isOllamaChatRetryCommandV2,
  type OllamaChatEditResendCommandV2,type OllamaChatInitialCommandV2,type OllamaChatRegenerateCommandV2,type OllamaChatRetryCommandV2 } from '../../src/next/generation-v2/providers/ollama-chat/plainTextCommandsV2'
type Current=OllamaChatInitialCommandV2|OllamaChatRegenerateCommandV2|OllamaChatEditResendCommandV2
function allowed(f:GenerationCommandFactsAuthorityV2){const i=f.semanticIntent;if(i.generation.candidateCount!==undefined||i.generation.frequencyPenalty!==undefined||i.generation.presencePenalty!==undefined||
  i.web.mode!=='disabled'||i.image.mode!=='disabled'||i.tools.mode!=='disabled'||i.attachments.length||i.providerExtension.kind!=='none'||f.attachmentSet.attachments.length||f.attachmentSet.providerFileRequirements.length)throw new Error('GENERATION_V2_OLLAMA_EXPLICIT_FIELD_UNSUPPORTED')}
export function commitOllamaCurrentSnapshotV2(input:Readonly<{context:GenerationV2AuthorityTransactionContextV2;executionRepo:GenerationExecutionV2Repo;capabilityRepo:RuntimeCapabilityV2Repo;
  pending:PendingInitialTurnV2|PendingAnswerActionV2|PendingEditedTurnV2;command:Current;commandFacts:GenerationCommandFactsAuthorityV2;profile:LocalEndpointProfileV2;capability:DecodedRuntimeCapabilitySnapshotV2}>){
  const initial=isOllamaChatInitialCommandV2(input.command)&&isPendingInitialTurnForContextV2(input.pending,input.context)
  const regenerate=isOllamaChatRegenerateCommandV2(input.command)&&isPendingAnswerActionForContextV2(input.pending,input.context)&&input.pending.actionKind==='regenerate_question'
  const edit=isOllamaChatEditResendCommandV2(input.command)&&isPendingEditedTurnForContextV2(input.pending,input.context)
  if((!initial&&!regenerate&&!edit)||!isGenerationCommandFactsAuthorityForContextV2(input.commandFacts,input.context)||input.command.operationId.value!==input.pending.operationId.value||input.command.endpointProfileId.value!==input.profile.endpointProfileId)throw new Error('GENERATION_V2_OLLAMA_SNAPSHOT_INPUT_INVALID')
  allowed(input.commandFacts);const binding=createOllamaChatProviderBindingV2(input.profile,input.command.modelId.value)
  if(stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(binding))!==stableSerializeProviderRequestV2(projectDecodedProviderBindingRecordV2(input.capability.binding)))throw new Error('GENERATION_V2_OLLAMA_SNAPSHOT_CAPABILITY_INVALID')
  input.capabilityRepo.insertCanonical(input.context,input.capability.canonicalJson,input.pending.createdAtMs)
  const snapshot=decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({schemaVersion:2,answerRootId:input.pending.answerRootId.value,operationId:input.pending.operationId.value,
    semanticIntent:projectGenerationIntentLayerV2(input.commandFacts.semanticIntent),resolvedConfigRevisions:input.commandFacts.resolvedConfigRevisions.map(e=>({ownerKind:e.ownerKind,ownerId:e.ownerId,revision:e.revision.value})),providerBinding:projectDecodedProviderBindingRecordV2(binding),
    capabilityBinding:{capabilityRevision:input.capability.revision.value,evidenceDigest:input.capability.evidenceDigest.value,semanticFieldsDigest:input.capability.semanticFieldsDigest.value,snapshotHash:input.capability.snapshotHash.value},attachmentProviderFileBindings:[],toolAuthority:{kind:'none'}}))
  return Object.freeze({bundle:input.executionRepo.insertOperationAndSnapshot(input.context,{operationId:input.pending.operationId.value,actionKind:initial?'initial_send':regenerate?'regenerate_question':'edit_resend',branchId:input.pending.branchId.value,conversationId:input.pending.conversationId.value,
    questionId:input.pending.questionId.value,targetAnswerRootId:null,resultAnswerRootId:input.pending.answerRootId.value,snapshot:snapshot.canonicalJson,commandFingerprint:input.command.requestFingerprint,createdAtMs:input.pending.createdAtMs}).bundle})
}
export function commitOllamaRetrySnapshotV2(input:Readonly<{context:GenerationV2AuthorityTransactionContextV2;executionRepo:GenerationExecutionV2Repo;pending:PendingAnswerActionV2;command:OllamaChatRetryCommandV2;target:GenerationExecutionOperationBundleV2}>){
  if(!isPendingAnswerActionForContextV2(input.pending,input.context)||!isOllamaChatRetryCommandV2(input.command)||!isGenerationExecutionOperationBundleForContextV2(input.target,input.context)||input.pending.actionKind!==input.command.actionKind||input.target.operation.resultAnswerRootId.value!==input.command.targetAnswerRootId.value||input.target.snapshot.providerBinding.protocolContractId.value!=='ollama-chat-v1')throw new Error('GENERATION_V2_OLLAMA_SNAPSHOT_INPUT_INVALID')
  const payload=JSON.parse(input.target.snapshot.canonicalJson) as Record<string,unknown>;delete payload.snapshotHash
  const snapshot=decodeAssistantAnswerGenerationSnapshotV2(canonicalizeUnverifiedAssistantAnswerGenerationSnapshotV2({...payload,answerRootId:input.pending.answerRootId.value,operationId:input.command.operationId.value}))
  return Object.freeze({bundle:input.executionRepo.insertOperationAndSnapshot(input.context,{operationId:input.command.operationId.value,actionKind:input.command.actionKind,branchId:input.pending.branchId.value,conversationId:input.pending.conversationId.value,questionId:input.pending.questionId.value,targetAnswerRootId:input.command.targetAnswerRootId.value,resultAnswerRootId:input.pending.answerRootId.value,snapshot:snapshot.canonicalJson,commandFingerprint:input.command.requestFingerprint,createdAtMs:input.pending.createdAtMs}).bundle})
}
