import { describe, expect, it } from 'vitest'
import { projectGenerationV2BranchForExistingUi } from './generationV2BranchProjection'
import type { GenerationV2BranchView } from './generationV2WorkspaceClient'

describe('Generation V2 branch projection', () => {
  it('exposes the original terminal error through error_summary for the existing UI', () => {
    const view: GenerationV2BranchView = {
      branchId: 'branch:1', conversationId: 'conversation:1', projectId: 'project:1', title: 'Conversation',
      branchName: 'Main', headMessageId: 'answer:1', turns: [{
        questionId: 'question:1', questionBody: 'draw', questionCreatedAtMs: 1, chosenAnswerRootId: 'answer:1',
        contextFilter: { questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
        answers: [{
          answerRootId: 'answer:1', status: 'failed', body: '', createdAtMs: 2, updatedAtMs: 3, chosen: true,
          operationId: 'operation:1', actionKind: 'initial_send', providerId: 'google_ai_studio', modelId: 'gemini-3.1-flash-image',
          errorCode: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE',
          errorMessage: 'Unexpected SSE field: event', endpointProfileId: 'profile:1', protocolContractId: 'gemini-interactions-v1beta',
          reasoningDetails: [], attachments: [], images: [],
        }],
      }],
    }

    const projected = projectGenerationV2BranchForExistingUi(view)
    const assistant = projected.rendered.messages.find((message) => message.id === 'answer:1')!
    expect(assistant.meta).toMatchObject({
      error_summary: {
        completionClass: 'error', provider: 'google_ai_studio',
        code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE',
        message: 'Unexpected SSE field: event',
        raw: { code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE', message: 'Unexpected SSE field: event' },
      },
    })
  })
})
