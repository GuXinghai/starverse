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
  role:string;status:string;providerId:string|null;modelId:string|null;completionOutcome?:'complete'|'unknown' }>
export function projectGenerationV2BranchForExistingUi(view:GenerationV2BranchView):Readonly<{
  rendered:GenerationV2UiRenderableTurns;messageMetaById:ReadonlyMap<string,GenerationV2MessageMetaProjection>}>{
  const rows:GenerationV2UiContextMessage[]=[];const meta=new Map<string,GenerationV2MessageMetaProjection>();let seq=0;let parent:string|null=null
  for(const turn of view.turns){const q:GenerationV2UiContextMessage={id:turn.questionId,convoId:view.conversationId,role:'user',seq:seq++,createdAt:turn.questionCreatedAtMs,parentId:parent,status:'completed',answerRootId:null,questionId:null,body:turn.questionBody,meta:null,routeProvenanceId:null,choiceIndex:null};rows.push(q);meta.set(q.id,{parentId:parent,questionId:null,answerRootId:null,role:'user',status:'completed',providerId:null,modelId:null});const answer=turn.answers.find(a=>a.answerRootId===turn.chosenAnswerRootId);if(!answer)throw new Error('GENERATION_V2_UI_CHOSEN_ANSWER_MISSING');const a:GenerationV2UiContextMessage={id:answer.answerRootId,convoId:view.conversationId,role:'assistant',seq:seq++,createdAt:answer.createdAtMs,parentId:turn.questionId,status:answer.status,answerRootId:answer.answerRootId,questionId:turn.questionId,body:answer.body,meta:Object.freeze({providerId:answer.providerId,modelId:answer.modelId,operationId:answer.operationId,errorCode:answer.errorCode,errorMessage:answer.errorMessage,reasoningDetailsRaw:answer.reasoningDetails,images:answer.images}),routeProvenanceId:null,choiceIndex:null};rows.push(a);meta.set(a.id,{parentId:turn.questionId,questionId:turn.questionId,answerRootId:a.id,role:'assistant',status:answer.status,providerId:answer.providerId,modelId:answer.modelId,...(answer.status==='completed'?{completionOutcome:'complete' as const}:answer.status==='failed'||answer.status==='cancelled'?{completionOutcome:'unknown' as const}:{})});parent=a.id}
  return Object.freeze({rendered:Object.freeze({messages:rows,turns:view.turns.map(turn=>Object.freeze({questionId:turn.questionId,chosenAnswerRootId:turn.chosenAnswerRootId,...turn.contextFilter}))}),messageMetaById:meta})
}
