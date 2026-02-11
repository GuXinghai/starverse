/* eslint-disable max-lines-per-function */
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeAppendReasoningDetailSegmentsResponse,
  decodeBranchBeginTurnResponse,
  decodeBranchForkQuestionResponse,
  decodeBranchRegenerateFromQuestionResponse,
  decodeBranchRetryReplaceQuestionResponse,
  decodeBranchSetHeadResponse,
  decodeBranchSwitchCandidateResponse,
  decodeBranchSwitchQuestionCandidateResponse,
  decodeConvoCreateResponse,
  decodeConvoDeleteManyResponse,
  decodeConvoListResponse,
  decodeConvoSetProjectManyResponse,
  decodeMessageAppendResponse,
  decodeMessageFinalizeReasoningDetailsResponse,
  decodeMessageListResponse,
  decodeMessageSetStatusResponse,
  decodeOpenRouterProviderRequireParametersResponse,
  decodeProjectCountConversationsBatchResponse,
  decodeProjectCountConversationsResponse,
  decodeProjectCreateResponse,
  decodeProjectFindByIdResponse,
  decodeProjectGetInboxResponse,
  decodeProjectListResponse,
  decodeSearchQueryResponse,
} from './dbBridgeContracts'
import { IpcContractDecodeError } from './decodeError'
import { switchQuestionCandidate } from '@/next/branch/branchClient'
import { listMessages, setMessageStatus } from '@/next/message/messageClient'

function expectProtocolInvalidError(error: unknown): void {
  expect(error).toBeInstanceOf(IpcContractDecodeError)
  const e = error as IpcContractDecodeError
  expect(e.appError.phase).toBe('local_protocol_error')
  expect(e.appError.category).toBe('protocol_invalid')
  expect(e.appError.grade).toBe(3)
}

type ContractCase = Readonly<{
  name: string
  decode: (raw: unknown) => unknown
  valid: unknown
  missing: unknown
  wrongType: unknown
}>

const cases: ContractCase[] = [
  {
    name: 'project.list',
    decode: decodeProjectListResponse,
    valid: [{ id: 'p1', name: 'Inbox', createdAt: 1, updatedAt: 2, meta: null }],
    missing: [{ id: 'p1', createdAt: 1 }],
    wrongType: [{ id: 'p1', name: 'Inbox', createdAt: '1' }],
  },
  {
    name: 'project.create',
    decode: decodeProjectCreateResponse,
    valid: { id: 'p1', name: 'Inbox', createdAt: 1, updatedAt: 2, alreadyExists: false, isSystemProject: true },
    missing: { id: 'p1', createdAt: 1 },
    wrongType: { id: 'p1', name: 'Inbox', createdAt: '1' },
  },
  {
    name: 'project.findById',
    decode: decodeProjectFindByIdResponse,
    valid: { id: 'p1', name: 'Inbox', createdAt: 1, updatedAt: 2, meta: null },
    missing: { id: 'p1', createdAt: 1 },
    wrongType: { id: 'p1', name: 'Inbox', createdAt: '1' },
  },
  {
    name: 'project.getInbox',
    decode: decodeProjectGetInboxResponse,
    valid: { id: 'p1', name: 'Inbox', createdAt: 1, updatedAt: 2, meta: null },
    missing: { id: 'p1', createdAt: 1 },
    wrongType: { id: 'p1', name: 'Inbox', createdAt: '1' },
  },
  {
    name: 'project.countConversations',
    decode: decodeProjectCountConversationsResponse,
    valid: { count: 7 },
    missing: {},
    wrongType: { count: '7' },
  },
  {
    name: 'project.countConversationsBatch',
    decode: decodeProjectCountConversationsBatchResponse,
    valid: { counts: { p1: 2, p2: 0 } },
    missing: {},
    wrongType: { counts: { p1: '2' } },
  },
  {
    name: 'convo.list',
    decode: decodeConvoListResponse,
    valid: [{ id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 2, projectId: null }],
    missing: [{ id: 'c1', createdAt: 1 }],
    wrongType: [{ id: 'c1', title: 'Chat 1', createdAt: '1' }],
  },
  {
    name: 'convo.create',
    decode: decodeConvoCreateResponse,
    valid: { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 2, projectId: null },
    missing: { id: 'c1', createdAt: 1 },
    wrongType: { id: 'c1', title: 'Chat 1', createdAt: '1' },
  },
  {
    name: 'convo.setProjectMany',
    decode: decodeConvoSetProjectManyResponse,
    valid: { moved: 3, failed: ['c4'] },
    missing: { moved: 3 },
    wrongType: { moved: '3', failed: [] },
  },
  {
    name: 'convo.deleteMany',
    decode: decodeConvoDeleteManyResponse,
    valid: { deleted: 4 },
    missing: {},
    wrongType: { deleted: '4' },
  },
  {
    name: 'message.list',
    decode: decodeMessageListResponse,
    valid: [{ id: 'm1', convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'hi', meta: null }],
    missing: [{ convoId: 'c1', role: 'assistant', seq: 1 }],
    wrongType: [{ id: 'm1', convoId: 'c1', role: 'assistant', seq: '1', createdAt: 1, body: 'hi' }],
  },
  {
    name: 'message.append',
    decode: decodeMessageAppendResponse,
    valid: { id: 'm1', convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'hi', meta: null },
    missing: { convoId: 'c1', role: 'assistant', seq: 1 },
    wrongType: { id: 'm1', convoId: 'c1', role: 'assistant', seq: '1', createdAt: 1, body: 'hi' },
  },
  {
    name: 'message.appendReasoningDetailSegments',
    decode: decodeAppendReasoningDetailSegmentsResponse,
    valid: { ok: true, received: 2, inserted: 2, skipped: 0, ignored: 0, sumDeltaLenInserted: 42 },
    missing: { ok: true, received: 2, inserted: 2, skipped: 0, ignored: 0 },
    wrongType: { ok: true, received: '2', inserted: 2, skipped: 0, ignored: 0, sumDeltaLenInserted: 42 },
  },
  {
    name: 'message.setStatus',
    decode: decodeMessageSetStatusResponse,
    valid: { ok: true },
    missing: {},
    wrongType: { ok: 'true' },
  },
  {
    name: 'message.finalizeReasoningDetails',
    decode: decodeMessageFinalizeReasoningDetailsResponse,
    valid: { ok: true },
    missing: {},
    wrongType: { ok: 'true' },
  },
  {
    name: 'branch.beginTurn',
    decode: decodeBranchBeginTurnResponse,
    valid: { ok: true, convoId: 'c1', questionId: 'u1', questionSeq: 1, assistantId: 'a1', assistantSeq: 2 },
    missing: { ok: true, convoId: 'c1', questionSeq: 1, assistantId: 'a1', assistantSeq: 2 },
    wrongType: { ok: true, convoId: 'c1', questionId: 'u1', questionSeq: '1', assistantId: 'a1', assistantSeq: 2 },
  },
  {
    name: 'branch.switchCandidate',
    decode: decodeBranchSwitchCandidateResponse,
    valid: { headMessageId: 'a1' },
    missing: {},
    wrongType: { headMessageId: 123 },
  },
  {
    name: 'branch.switchQuestionCandidate',
    decode: decodeBranchSwitchQuestionCandidateResponse,
    valid: { ok: true, headMessageId: 'a1' },
    missing: { ok: true },
    wrongType: { ok: true, headMessageId: 123 },
  },
  {
    name: 'branch.regenerateFromQuestion',
    decode: decodeBranchRegenerateFromQuestionResponse,
    valid: { ok: true, newAnswerRootId: 'a2', newAssistantSeq: 3 },
    missing: { ok: true, newAssistantSeq: 3 },
    wrongType: { ok: true, newAnswerRootId: 'a2', newAssistantSeq: '3' },
  },
  {
    name: 'branch.forkQuestion',
    decode: decodeBranchForkQuestionResponse,
    valid: { ok: true, baseMessageId: null, newQuestionId: 'u2', newQuestionSeq: 4, assistantId: 'a2', assistantSeq: 5 },
    missing: { ok: true, baseMessageId: null, newQuestionSeq: 4, assistantId: 'a2', assistantSeq: 5 },
    wrongType: { ok: true, baseMessageId: null, newQuestionId: 'u2', newQuestionSeq: '4', assistantId: 'a2', assistantSeq: 5 },
  },
  {
    name: 'branch.retryReplaceQuestion',
    decode: decodeBranchRetryReplaceQuestionResponse,
    valid: { ok: true, baseMessageId: null, newQuestionId: 'u2', newQuestionSeq: 4, assistantId: 'a2', assistantSeq: 5 },
    missing: { ok: true, baseMessageId: null, newQuestionSeq: 4, assistantId: 'a2', assistantSeq: 5 },
    wrongType: { ok: true, baseMessageId: null, newQuestionId: 'u2', newQuestionSeq: '4', assistantId: 'a2', assistantSeq: 5 },
  },
  {
    name: 'branch.setHead',
    decode: decodeBranchSetHeadResponse,
    valid: { ok: true },
    missing: {},
    wrongType: { ok: 'true' },
  },
  {
    name: 'search.query',
    decode: decodeSearchQueryResponse,
    valid: [{ entityType: 'message', entityId: 'm1', projectId: 'p1', convoId: 'c1', createdAtSec: 1, snippet: 'x', score: 0.2 }],
    missing: [{ entityType: 'message', projectId: 'p1', convoId: 'c1', createdAtSec: 1, snippet: 'x', score: 0.2 }],
    wrongType: [{ entityType: 'message', entityId: 'm1', projectId: 'p1', convoId: 'c1', createdAtSec: '1', snippet: 'x', score: 0.2 }],
  },
  {
    name: 'settings.getOpenRouterProviderRequireParameters',
    decode: decodeOpenRouterProviderRequireParametersResponse,
    valid: { value: true },
    missing: {},
    wrongType: { value: 'true' },
  },
]

describe('db bridge contract decoders', () => {
  for (const c of cases) {
    it(`${c.name}: missing required field rejects with protocol_invalid`, () => {
      expect(() => c.decode(c.missing)).toThrowError(IpcContractDecodeError)
      try {
        c.decode(c.missing)
      } catch (error) {
        expectProtocolInvalidError(error)
      }
    })

    it(`${c.name}: wrong field type rejects with protocol_invalid`, () => {
      expect(() => c.decode(c.wrongType)).toThrowError(IpcContractDecodeError)
      try {
        c.decode(c.wrongType)
      } catch (error) {
        expectProtocolInvalidError(error)
      }
    })

    it(`${c.name}: unknown extra field is tolerated`, () => {
      const withExtra =
        Array.isArray(c.valid)
          ? c.valid.map((row) => ({ ...(row as Record<string, unknown>), __extra: 'ignore' }))
          : { ...(c.valid as Record<string, unknown>), __extra: 'ignore' }
      const decoded = c.decode(withExtra)
      if (Array.isArray(decoded)) {
        expect(decoded[0]).toBeDefined()
        if (decoded[0] && typeof decoded[0] === 'object') {
          expect(Object.prototype.hasOwnProperty.call(decoded[0], '__extra')).toBe(false)
        }
      } else if (decoded && typeof decoded === 'object') {
        expect(Object.prototype.hasOwnProperty.call(decoded, '__extra')).toBe(false)
      }
    })
  }
})

describe('client decode integration', () => {
  const originalBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalBridge
  })

  it('messageClient.listMessages keeps signature and surfaces decode errors', async () => {
    ;(globalThis as any).dbBridge = {
      invoke: async () => [{ id: 'm1', convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'ok', meta: null }],
    }
    const ok = await listMessages('c1')
    expect(ok).toHaveLength(1)
    expect(ok[0].id).toBe('m1')

    ;(globalThis as any).dbBridge = {
      invoke: async () => [{ convoId: 'c1', role: 'assistant', seq: 1, createdAt: 1, body: 'bad', meta: null }],
    }
    await expect(listMessages('c1')).rejects.toBeInstanceOf(IpcContractDecodeError)
    try {
      await listMessages('c1')
    } catch (error) {
      expectProtocolInvalidError(error)
    }
  })

  it('branchClient.switchQuestionCandidate keeps signature and surfaces decode errors', async () => {
    ;(globalThis as any).dbBridge = {
      invoke: async () => ({ ok: true, headMessageId: 'm2' }),
    }
    const ok = await switchQuestionCandidate('b1', null, 'q1')
    expect(ok.headMessageId).toBe('m2')

    ;(globalThis as any).dbBridge = {
      invoke: async () => ({ ok: true }),
    }
    await expect(switchQuestionCandidate('b1', null, 'q1')).rejects.toBeInstanceOf(IpcContractDecodeError)
    try {
      await switchQuestionCandidate('b1', null, 'q1')
    } catch (error) {
      expectProtocolInvalidError(error)
    }
  })

  it('messageClient.setMessageStatus accepts with/without metaPatch and decodes ack without protocol_invalid', async () => {
    const calls: Array<{ method: string; params: any }> = []
    const invoke = async (method: string, params?: unknown) => {
      calls.push({ method, params: params ?? null })
      return { ok: true }
    }
    ;(globalThis as any).dbBridge = { invoke }

    await expect(setMessageStatus({ messageId: 'm1', status: 'final' })).resolves.toBe(true)
    await expect(
      setMessageStatus({
        messageId: 'm1',
        status: 'final',
        metaPatch: { completionOutcome: 'truncated' },
      })
    ).resolves.toBe(true)

    expect(calls[0]?.method).toBe('message.setStatus')
    expect(calls[0]?.params?.metaPatch).toBeUndefined()
    expect(calls[1]?.method).toBe('message.setStatus')
    expect(calls[1]?.params?.metaPatch).toEqual({ completionOutcome: 'truncated' })
  })
})
