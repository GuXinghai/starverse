import { describe, expect, it } from 'vitest'
import { projectGenerationV2BranchForExistingUi } from './generationV2BranchProjection'
import type { GenerationV2BranchView } from './generationV2WorkspaceClient'
import { createProviderFailureV2 } from '../../../shared/provider/providerFailureV2'

describe('Generation V2 branch projection', () => {
  it('exposes the original terminal error through error_summary for the existing UI', () => {
    const view: GenerationV2BranchView = {
      branchId: 'branch:1', conversationId: 'conversation:1', projectId: 'project:1', title: 'Conversation',
      branchName: 'Main', headMessageId: 'answer:1', beforeMessageId: null, hasMoreTurns: false, turns: [{
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
      providerId: 'google_ai_studio',
      modelId: 'gemini-3.1-flash-image',
      protocolContractId: 'gemini-interactions-v1beta',
      error_summary: {
        completionClass: 'error', provider: 'google_ai_studio',
        code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE',
        message: 'Unexpected SSE field: event',
        raw: { code: 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE', message: 'Unexpected SSE field: event' },
      },
    })
  })

  it('projects the persisted ProviderFailureV2 facts without replacing the Provider message', () => {
    const failure = createProviderFailureV2({
      context: { origin: 'http_response', phase: 'response_headers', provider: { namespace: 'generation_execution', id: 'google_ai_studio' },
        contractId: 'gemini-interactions-v1beta', operationId: 'operation:2', requestSequence: 1,
        starverseDiagnosticCode: 'PROVIDER_RESPONSE_HTTP_ERROR' },
      httpStatus: 400, httpStatusText: 'Bad Request',
      body: { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Provider says no.' } },
    })
    const view = {
      branchId: 'branch:1', conversationId: 'conversation:1', projectId: 'project:1', title: 'Conversation',
      branchName: 'Main', headMessageId: 'answer:2', beforeMessageId: null, hasMoreTurns: false, turns: [{
        questionId: 'question:1', questionBody: 'draw', questionCreatedAtMs: 1, chosenAnswerRootId: 'answer:2',
        contextFilter: { questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
        answers: [{ answerRootId: 'answer:2', status: 'failed', body: '', createdAtMs: 2, updatedAtMs: 3, chosen: true,
          operationId: 'operation:2', actionKind: 'initial_send', providerId: 'google_ai_studio', modelId: 'gemini-3.1-flash-image',
          errorCode: 'PROVIDER_RESPONSE_HTTP_ERROR', errorMessage: 'Provider says no.', errorFact: failure,
          endpointProfileId: 'profile:1', protocolContractId: 'gemini-interactions-v1beta', reasoningDetails: [], attachments: [], images: [] }],
      }],
    } satisfies GenerationV2BranchView
    const assistant = projectGenerationV2BranchForExistingUi(view).rendered.messages.find((message) => message.id === 'answer:2')!
    expect(assistant.meta).toMatchObject({ error_summary: {
      code: 'PROVIDER_RESPONSE_HTTP_ERROR', message: 'Provider says no.', phase: 'pre_stream', source: 'provider_http',
      raw: { httpStatus: 400, providerError: { status: 'INVALID_ARGUMENT', message: 'Provider says no.' } },
    } })
  })

  it('does not project Gemini citation-shaped facts through another V2 contract', () => {
    const view = {
      branchId: 'branch:1', conversationId: 'conversation:1', projectId: 'project:1', title: 'Conversation',
      branchName: 'Main', headMessageId: 'answer:3', beforeMessageId: null, hasMoreTurns: false, turns: [{
        questionId: 'question:1', questionBody: 'answer', questionCreatedAtMs: 1, chosenAnswerRootId: 'answer:3',
        contextFilter: { questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false },
        answers: [{
          answerRootId: 'answer:3', status: 'completed', body: 'done', createdAtMs: 2, updatedAtMs: 3, chosen: true,
          operationId: 'operation:3', actionKind: 'initial_send', providerId: 'openai_responses', modelId: 'gpt-5.6-sol',
          errorCode: null, errorMessage: null, endpointProfileId: 'profile:1', protocolContractId: 'openai-responses-v1',
          reasoningDetails: [{ type: 'url_citation', url_citation: { url: 'https://example.com' } }],
          attachments: [], images: [],
        }],
      }],
    } satisfies GenerationV2BranchView

    const assistant = projectGenerationV2BranchForExistingUi(view).rendered.messages
      .find((message) => message.id === 'answer:3')!
    expect(assistant.meta).toMatchObject({ annotations: [] })
  })
})
