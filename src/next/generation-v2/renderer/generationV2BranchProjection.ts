import { projectProviderFailureForUiV2 } from '../../../shared/provider/providerFailureUiProjectionV2'
import type { ProviderFailureV2 } from '../../../shared/provider/providerFailureV2'
import type { GenerationV2BranchView } from './generationV2WorkspaceClient'

export type GenerationV2UiContextMessage = Readonly<{
  id:string;convoId:string;role:string;seq:number;createdAt:number;parentId:string|null;status:string;
  answerRootId:string|null;questionId:string|null;body:string;meta:unknown;routeProvenanceId:string|null;choiceIndex:number|null
}>
export type GenerationV2UiRenderableTurns = Readonly<{
  messages:GenerationV2UiContextMessage[]
  turns:ReadonlyArray<Readonly<{questionId:string;chosenAnswerRootId:string;questionMode:'include'|'exclude';
    answerMode:'include'|'exclude';effectiveMode:'include'|'exclude';lockedByQuestionExclude:boolean}>>
}>

export type GenerationV2MessageMetaProjection = Readonly<{ parentId:string|null;questionId:string|null;answerRootId:string|null;
  role:string;status:string;providerId:string|null;modelId:string|null;protocolContractId:string|null;
  completionOutcome?:'complete'|'unknown' }>

function projectProviderAnnotations(answer: GenerationV2BranchView['turns'][number]['answers'][number]):
readonly Readonly<Record<string,unknown>>[] {
  if (answer.providerId !== 'google_ai_studio' || answer.protocolContractId !== 'gemini-interactions-v1beta') {
    return Object.freeze([])
  }
  const reasoningDetails = answer.reasoningDetails
  return Object.freeze(reasoningDetails.filter((detail) => detail.type === 'url_citation').map((detail) => Object.freeze({
    type: 'url_citation', url_citation: detail.url_citation ?? detail,
  })))
}

function errorSource(origin: ProviderFailureV2['origin']): string {
  if (origin === 'http_response') return 'provider_http'
  if (origin === 'response_stream') return 'provider_stream'
  if (origin === 'network_transport') return 'transport'
  if (origin === 'response_decoder') return 'local_decoder'
  if (origin === 'starverse_internal') return 'persistence'
  return 'provider'
}

function errorPhase(failure: ProviderFailureV2): 'pre_stream' | 'mid_stream' | 'post_stream' {
  if (failure.phase === 'terminal_persistence') return 'post_stream'
  if (failure.phase === 'stream_read' || failure.phase === 'stream_decode') return 'mid_stream'
  return 'pre_stream'
}

function projectErrorSummary(answer: GenerationV2BranchView['turns'][number]['answers'][number]): Readonly<Record<string, unknown>> | null {
  if (answer.errorCode === null && answer.errorMessage === null && !answer.errorFact) return null
  const failure = answer.errorFact
  const providerMessage = failure?.providerError?.message ?? failure?.providerError?.rawText ?? null
  const transportMessage = failure?.transportError?.message ?? null
  return Object.freeze({
    completionClass: 'error',
    code: failure?.starverseDiagnosticCode ?? answer.errorCode,
    message: providerMessage ?? transportMessage ?? answer.errorMessage,
    provider: answer.providerId,
    ...(failure ? {
      phase: errorPhase(failure),
      source: errorSource(failure.origin),
      raw: projectProviderFailureForUiV2(failure),
    } : {
      raw: Object.freeze({ code: answer.errorCode, message: answer.errorMessage, provider: answer.providerId }),
    }),
  })
}

export function projectGenerationV2BranchForExistingUi(view:GenerationV2BranchView):Readonly<{
  rendered:GenerationV2UiRenderableTurns;messageMetaById:ReadonlyMap<string,GenerationV2MessageMetaProjection>}>{
  const rows:GenerationV2UiContextMessage[]=[];const meta=new Map<string,GenerationV2MessageMetaProjection>();let seq=0;let parent:string|null=null
  for(const turn of view.turns){
    const q:GenerationV2UiContextMessage={id:turn.questionId,convoId:view.conversationId,role:'user',seq:seq++,createdAt:turn.questionCreatedAtMs,parentId:parent,status:'completed',answerRootId:null,questionId:null,body:turn.questionBody,meta:null,routeProvenanceId:null,choiceIndex:null};rows.push(q);meta.set(q.id,{parentId:parent,questionId:null,answerRootId:null,role:'user',status:'completed',providerId:null,modelId:null,protocolContractId:null});
    const answer=turn.answers.find(a=>a.answerRootId===turn.chosenAnswerRootId);if(!answer)throw new Error('GENERATION_V2_UI_CHOSEN_ANSWER_MISSING');
    const errorSummary=projectErrorSummary(answer)
    const a:GenerationV2UiContextMessage={id:answer.answerRootId,convoId:view.conversationId,role:'assistant',seq:seq++,createdAt:answer.createdAtMs,parentId:turn.questionId,status:answer.status,answerRootId:answer.answerRootId,questionId:turn.questionId,body:answer.body,meta:Object.freeze({providerId:answer.providerId,modelId:answer.modelId,protocolContractId:answer.protocolContractId,operationId:answer.operationId,errorCode:answer.errorCode,errorMessage:answer.errorMessage,errorFact:answer.errorFact,reasoningDetailsRaw:answer.reasoningDetails,annotations:projectProviderAnnotations(answer),images:answer.images,...(errorSummary?{error_summary:errorSummary}:{})}),routeProvenanceId:null,choiceIndex:null};rows.push(a);meta.set(a.id,{parentId:turn.questionId,questionId:turn.questionId,answerRootId:a.id,role:'assistant',status:answer.status,providerId:answer.providerId,modelId:answer.modelId,protocolContractId:answer.protocolContractId,...(answer.status==='completed'?{completionOutcome:'complete' as const}:answer.status==='failed'||answer.status==='cancelled'?{completionOutcome:'unknown' as const}:{})});parent=a.id
  }
  return Object.freeze({rendered:Object.freeze({messages:rows,turns:view.turns.map(turn=>Object.freeze({questionId:turn.questionId,chosenAnswerRootId:turn.chosenAnswerRootId,...turn.contextFilter}))}),messageMetaById:meta})
}
