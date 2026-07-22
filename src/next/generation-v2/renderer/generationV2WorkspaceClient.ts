import type { CatalogQueryItem } from '../../modelCatalog/catalogQueryService'
import type { RuntimeProviderKey } from '../../provider/runtimeSelection'
import type { CompatibleConfigurationSelection } from '../../provider/openai-chat-compatible/ui/compatibleConfigurationSelection'

type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; code: string }>
function bridge() {
  const value = window.generationV2?.workspace
  if (!value) throw new Error('GENERATION_V2_WORKSPACE_BRIDGE_UNAVAILABLE')
  return value
}
function unwrap<T>(value: unknown): T {
  const result = value as Result<T>
  if (!result || result.ok !== true) throw new Error(result && 'code' in result ? result.code : 'GENERATION_V2_WORKSPACE_COMMAND_FAILED')
  return result.value
}
export type GenerationV2ProjectView = Readonly<{ projectId: string; name: string; createdAtMs: number; updatedAtMs: number }>
export type GenerationV2ConversationView = Readonly<{ conversationId: string; projectId: string; title: string; updatedAtMs: number;
  branches: readonly Readonly<{ branchId: string; name: string | null; headMessageId: string | null; updatedAtMs: number }>[] }>
export type GenerationV2BranchView = Readonly<{ branchId: string; conversationId: string; projectId: string; title: string;
  branchName: string | null; headMessageId: string | null; turns: readonly Readonly<{ questionId: string; questionBody: string; questionCreatedAtMs:number;
    chosenAnswerRootId: string; contextFilter:Readonly<{questionMode:'include'|'exclude';answerMode:'include'|'exclude';effectiveMode:'include'|'exclude';lockedByQuestionExclude:boolean}>; answers: readonly Readonly<{ answerRootId: string; status: 'streaming'|'completed'|'failed'|'cancelled';
      body: string; createdAtMs: number; updatedAtMs: number; chosen: boolean; operationId: string; actionKind: string;
      providerId: string; modelId: string; errorCode: string|null; errorMessage: string|null;
      endpointProfileId:string; protocolContractId:string;
      reasoningDetails:readonly Readonly<Record<string,unknown>>[];
      attachments:readonly (Readonly<{kind:'managed_file';assetId:string;assetRevisionId:string;assetSha256:string;include:boolean;
        sendAs:'provider_file'|'inline_text'|'image_reference'|'converted_document';conversion:'none'|'pdf'|'plain_text'|'images';
        filename:string;assetKind:'file'|'image';mime:string;sourceKind:'user_import'|'url_import'|'generated'|'derived'}>
        | Readonly<{kind:'url_reference';referenceId:string;referenceRevision:string;urlDigest:string;
          mediaKind:'image'|'document'|'audio'|'video'|'other';capturedAtMs:number;provenance:'user_supplied';
          include:boolean;sendAs:'url_reference';conversion:'none'}>)[];
      images: readonly Readonly<{assetId:string;assetRevisionId:string;sha256:string;mime:string;storageRef:string}>[] }>[] }>[] }>
export type GenerationV2LocalEndpointProfile = Readonly<{ endpointProfileId:string; providerId:'lmstudio'|'ollama'|'generic_local';
  protocolContractId:'lmstudio-openresponses'|'lmstudio-openai-chat-completions'|'ollama-chat-v1'|'generic-local-openai-chat-completions';
  baseUrl:string; credentialMode:'none'; credentialScopeId:string; protocolConfig:Readonly<Record<string,unknown>>;
  revisionGeneration:number; profileRevision:string; profileDigest:string; createdAtMs:number; updatedAtMs:number }>
export type GenerationV2ConfigLayerView = Readonly<{ ownerKind:'global'|'project'|'conversation'; ownerId:string;
  configRevision:string; semanticLayer:Readonly<Record<string,unknown>> }>
export type GenerationV2QuestionCandidate = Readonly<{ questionId:string; createdAtMs:number; status:'completed' }>
export type GenerationV2OpenRouterModelCatalogResult = Readonly<
  {ok:true;responseDigest:string|null;status:'not_synced'|'syncing'|'synced'|'failed';observedAtMs:number|null;
    items:readonly CatalogQueryItem[];modelCount:number;visibleModelCount:number;hiddenModelCount:number;errorCode:string|null}
  | {ok:false;code:string}>

export async function ensureGenerationV2DefaultWorkspace() { return unwrap<Readonly<{projectId:string;conversationId:string;branchId:string;created:boolean}>>(await bridge().ensureDefault()) }
export async function listGenerationV2Projects() { return unwrap<readonly GenerationV2ProjectView[]>(await bridge().listProjects()) }
export async function listGenerationV2Conversations(projectId:string) { return unwrap<readonly GenerationV2ConversationView[]>(await bridge().listConversations(projectId)) }
export async function readGenerationV2Branch(branchId:string) { return unwrap<GenerationV2BranchView>(await bridge().readBranch(branchId)) }
export async function listGenerationV2QuestionCandidates(branchId:string,baseMessageId:string|null,limit=200) {
  return unwrap<readonly GenerationV2QuestionCandidate[]>(await bridge().listQuestionCandidates(branchId,baseMessageId,limit))
}
export async function selectGenerationV2QuestionCandidate(payload:Readonly<{branchId:string;baseMessageId:string|null;
  expectedCurrentQuestionId:string;targetQuestionId:string;expectedHeadMessageId:string}>) {
  return unwrap<Readonly<{headMessageId:string;chosenAnswerRootId:string}>>(await bridge().selectQuestionCandidate(payload))
}
export async function selectGenerationV2Answer(payload:Readonly<{branchId:string;questionId:string;expectedChosenAnswerRootId:string;targetAnswerRootId:string}>) { return unwrap(await bridge().selectAnswer(payload)) }
export async function setGenerationV2ContextFilter(payload:Readonly<{branchId:string;targetType:'question'|'answer';targetId:string;mode:'include'|'exclude'}>) {
  return unwrap(await bridge().setContextFilter(payload))
}
export async function clearGenerationV2ContextFilter(payload:Readonly<{branchId:string;targetType:'question'|'answer';targetId:string}>) {
  return unwrap(await bridge().clearContextFilter(payload))
}
export async function createGenerationV2Project(name:string) { return unwrap<Readonly<{projectId:string}>>(await bridge().createProject(name)) }
export async function renameGenerationV2Project(projectId:string,name:string) { return unwrap(await bridge().renameProject(projectId,name)) }
export async function deleteGenerationV2Project(projectId:string) { return unwrap(await bridge().deleteProject(projectId)) }
export async function createGenerationV2Conversation(projectId:string,title='') { return unwrap<Readonly<{conversationId:string;branchId:string}>>(await bridge().createConversation(projectId,title)) }
export async function renameGenerationV2Conversation(conversationId:string,title:string) { return unwrap(await bridge().renameConversation(conversationId,title)) }
export async function moveGenerationV2Conversation(conversationId:string,projectId:string) { return unwrap(await bridge().moveConversation(conversationId,projectId)) }
export async function deleteGenerationV2Conversation(conversationId:string) { return unwrap(await bridge().deleteConversation(conversationId)) }
export async function forkGenerationV2Branch(sourceBranchId:string,headMessageId:string,name:string|null) { return unwrap<Readonly<{branchId:string}>>(await bridge().forkBranch(sourceBranchId,headMessageId,name)) }
export async function renameGenerationV2Branch(branchId:string,name:string|null) { return unwrap(await bridge().renameBranch(branchId,name)) }
export async function deleteGenerationV2Branch(branchId:string) { return unwrap(await bridge().deleteBranch(branchId)) }
export async function truncateGenerationV2BranchFromQuestion(payload:Readonly<{branchId:string;questionId:string;expectedHeadMessageId:string}>) {
  return unwrap<Readonly<{headMessageId:string|null}>>(await bridge().truncateFromQuestion(payload))
}
export async function getGenerationV2Config(ownerKind:'global'|'project'|'conversation',ownerId:string) {
  return unwrap<GenerationV2ConfigLayerView>(await bridge().getConfig(ownerKind,ownerId))
}
export async function updateGenerationV2Config(payload:Readonly<{ownerKind:'global'|'project'|'conversation';ownerId:string;
  expectedConfigRevision:string;semanticLayer:Readonly<Record<string,unknown>>}>) {
  return unwrap<GenerationV2ConfigLayerView>(await bridge().updateConfig(payload))
}
export async function listGenerationV2LocalProfiles() {
  const value = window.generationV2?.localProfiles
  if (!value) throw new Error('GENERATION_V2_LOCAL_PROFILE_BRIDGE_UNAVAILABLE')
  return unwrap<readonly GenerationV2LocalEndpointProfile[]>(await value.list())
}
export async function listGenerationV2OpenRouterModels():Promise<GenerationV2OpenRouterModelCatalogResult> {
  const value = window.generationV2?.models
  if (!value) throw new Error('GENERATION_V2_MODEL_BRIDGE_UNAVAILABLE')
  return await value.listOpenRouter() as GenerationV2OpenRouterModelCatalogResult
}
export async function createGenerationV2LocalProfile(payload:Readonly<{providerId:'lmstudio'|'ollama'|'generic_local';
  protocolContractId:GenerationV2LocalEndpointProfile['protocolContractId'];baseUrl:string;protocolConfig?:Readonly<Record<string,unknown>>}>) {
  const value = window.generationV2?.localProfiles
  if (!value) throw new Error('GENERATION_V2_LOCAL_PROFILE_BRIDGE_UNAVAILABLE')
  return unwrap<GenerationV2LocalEndpointProfile>(await value.create(payload))
}
export async function deleteGenerationV2LocalProfile(endpointProfileId:string) {
  const value = window.generationV2?.localProfiles
  if (!value) throw new Error('GENERATION_V2_LOCAL_PROFILE_BRIDGE_UNAVAILABLE')
  return unwrap<Readonly<{deleted:boolean}>>(await value.delete(endpointProfileId))
}
export type GenerationV2ConversationRoutePreferenceSelection =
  | Readonly<{ schemaVersion:1;kind:'provider_model';providerId:RuntimeProviderKey;modelId:string }>
  | Readonly<{ schemaVersion:1;kind:'openai_chat_compatible';selection:CompatibleConfigurationSelection }>
export type GenerationV2ConversationRoutePreferenceSnapshot = Readonly<{
  conversationId:string;revision:number;selection:GenerationV2ConversationRoutePreferenceSelection
}>

export async function getGenerationV2ConversationRoutePreference(conversationId:string) {
  return unwrap<GenerationV2ConversationRoutePreferenceSnapshot|null>(await bridge().getConversationRoutePreference(conversationId))
}
export async function updateGenerationV2ConversationRoutePreference(payload:Readonly<{
  conversationId:string;expectedRevision:number;selection:GenerationV2ConversationRoutePreferenceSelection
}>) {
  return unwrap<GenerationV2ConversationRoutePreferenceSnapshot>(await bridge().updateConversationRoutePreference(payload))
}
export async function clearGenerationV2ConversationRoutePreference(conversationId:string,expectedRevision:number) {
  return unwrap<null>(await bridge().clearConversationRoutePreference(conversationId,expectedRevision))
}
