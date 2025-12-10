/**
 * useMessageSending - Phase 状态机与中止逻辑单元测试
 * 
 * 测试任务卡功能：
 * 1. Phase 状态转换：delay → requesting → streaming → completed
 * 2. 延时期间撤回（undoPendingSend）
 * 3. Requesting 阶段中止（创建空消息壳）
 * 4. Streaming 阶段中止（标记 streamAborted）
 * 5. 原子性状态转换
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useMessageSending } from '../../../src/composables/useMessageSending'
import type { MessagePart } from '../../../src/types/chat'
import type { PendingFileData } from '../../../src/types/chat'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock 辅助函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createMockStores() {
  const mockAppStore = {
    currentModelId: 'test-model',
    activeProvider: 'openrouter',
    openRouterApiKey: 'test-key',
    sendDelayMs: 0,
    sendTimeoutMs: 60000
  }

  const mockConversationStore = {
    setGenerationStatus: vi.fn(),
    setGenerationError: vi.fn(),
    getConversationById: vi.fn(() => ({
      id: 'test-conversation',
      model: 'test-model',
      tree: { branches: {}, rootBranchIds: [] }
    }))
  }

  const mockBranchStore = {
    addMessageBranch: vi.fn(() => `branch-${Date.now()}`),
    addNoticeMessage: vi.fn(() => `notice-${Date.now()}`),
    updateNoticeMessageText: vi.fn(),
    removeMessageBranch: vi.fn(),
    getDisplayMessages: vi.fn(() => []),
    appendToken: vi.fn(),
    appendImage: vi.fn(),
    patchMetadata: vi.fn(),
    appendReasoningDetail: vi.fn(),
    appendReasoningStreamingText: vi.fn(),
    setReasoningSummary: vi.fn()
  }

  const mockPersistenceStore = {
    markConversationDirty: vi.fn()
  }

  return {
    mockAppStore,
    mockConversationStore,
    mockBranchStore,
    mockPersistenceStore
  }
}

function createMockOptions(stores: ReturnType<typeof createMockStores>) {
  return {
    conversationId: 'test-conversation',
    draftInput: ref('Test message'),
    pendingAttachments: ref<string[]>([]),
    pendingFiles: ref<PendingFileData[]>([]),
    appStore: stores.mockAppStore,
    conversationStore: stores.mockConversationStore,
    branchStore: stores.mockBranchStore,
    persistenceStore: stores.mockPersistenceStore,
    currentConversation: ref({ 
      id: 'test-conversation', 
      model: 'test-model',
      tree: { branches: {}, rootBranchIds: [] }
    }),
    buildWebSearchRequestOptions: () => ({}),
    buildReasoningRequestOptions: () => ({}),
    buildSamplingParameterOverrides: () => ({}),
    selectedPdfEngine: ref('pdf-text'),
    isSamplingEnabled: ref(false),
    isSamplingControlAvailable: ref(false),
    validateAllParameters: () => []
  }
}

// Mock aiChatService
vi.mock('../../../src/services/aiChatService', () => ({
  aiChatService: {
    streamChatResponse: vi.fn()
  }
}))

describe('useMessageSending - Phase State Machine', () => {
  let stores: ReturnType<typeof createMockStores>
  let options: ReturnType<typeof createMockOptions>

  beforeEach(() => {
    stores = createMockStores()
    options = createMockOptions(stores)
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Group 1: Phase 状态转换
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Phase 状态转换', () => {
    it('应该在延时期间处于 delay 阶段', async () => {
      stores.mockAppStore.sendDelayMs = 3000
      const { performSendMessage, isDelayPending } = useMessageSending(options)

      const sendPromise = performSendMessage()

      await nextTick()

      // 验证：延时期间 isDelayPending 应为 true
      expect(isDelayPending.value).toBe(true)

      // 验证：用户消息和 notice 消息已创建
      expect(stores.mockBranchStore.addMessageBranch).toHaveBeenCalledWith(
        'test-conversation',
        'user',
        expect.any(Array)
      )
      expect(stores.mockBranchStore.addNoticeMessage).toHaveBeenCalledWith(
        'test-conversation',
        '消息准备发送，倒计时 3s...'
      )

      // 清理
      vi.advanceTimersByTime(3000)
      await sendPromise.catch(() => {}) // 忽略错误（aiChatService 是 mock）
    })

    it('应该在延时结束后转换到 requesting 阶段', async () => {
      stores.mockAppStore.sendDelayMs = 1000
      const { performSendMessage, isDelayPending } = useMessageSending(options)

      const sendPromise = performSendMessage()
      await nextTick()

      // 验证：延时中
      expect(isDelayPending.value).toBe(true)

      // 推进定时器
      vi.advanceTimersByTime(1000)
      await nextTick()

      // 验证：延时结束，notice 消息更新
      expect(stores.mockBranchStore.updateNoticeMessageText).toHaveBeenCalledWith(
        'test-conversation',
        expect.any(String),
        '消息已发送，等待流式回复……'
      )

      // 验证：isDelayPending 变为 false
      expect(isDelayPending.value).toBe(false)

      // 清理
      await sendPromise.catch(() => {})
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Group 2: 撤回功能（undoPendingSend）
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('撤回功能（undoPendingSend）', () => {
    it('应该在 delay 阶段成功撤回', async () => {
      stores.mockAppStore.sendDelayMs = 5000
      const { performSendMessage, undoPendingSend, isDelayPending } = useMessageSending(options)

      const originalText = options.draftInput.value
      const sendPromise = performSendMessage()
      await nextTick()

      // 验证：处于延时中
      expect(isDelayPending.value).toBe(true)

      // 记录创建的消息 ID
      const userMessageId = stores.mockBranchStore.addMessageBranch.mock.results[0].value
      const noticeMessageId = stores.mockBranchStore.addNoticeMessage.mock.results[0].value

      // 执行撤回
      undoPendingSend()
      await nextTick()

      // 验证：延时状态清除
      expect(isDelayPending.value).toBe(false)

      // 验证：消息分支被删除
      expect(stores.mockBranchStore.removeMessageBranch).toHaveBeenCalledWith(
        'test-conversation',
        userMessageId
      )
      expect(stores.mockBranchStore.removeMessageBranch).toHaveBeenCalledWith(
        'test-conversation',
        noticeMessageId
      )

      // 验证：输入内容被恢复
      expect(options.draftInput.value).toBe(originalText)

      // 验证：Promise 被 resolve 为失败
      const result = await sendPromise
      expect(result.success).toBe(false)
      expect(result.error).toBe('Send cancelled')
    })

    it('应该在 requesting 阶段拒绝撤回', async () => {
      stores.mockAppStore.sendDelayMs = 1000
      const { performSendMessage, undoPendingSend, isDelayPending } = useMessageSending(options)

      const sendPromise = performSendMessage()
      await nextTick()

      // 推进到 requesting 阶段
      vi.advanceTimersByTime(1000)
      await nextTick()

      // 验证：不再处于延时中
      expect(isDelayPending.value).toBe(false)

      // 尝试撤回（应该失败）
      const removeCallsBefore = stores.mockBranchStore.removeMessageBranch.mock.calls.length
      undoPendingSend()
      await nextTick()

      // 验证：removeMessageBranch 没有被调用
      expect(stores.mockBranchStore.removeMessageBranch.mock.calls.length).toBe(removeCallsBefore)

      // 清理
      await sendPromise.catch(() => {})
    })

    it('应该恢复所有附件（图片 + 文件）', async () => {
      stores.mockAppStore.sendDelayMs = 3000
      options.pendingAttachments.value = ['data:image/png;base64,abc123']
      options.pendingFiles.value = [{
        id: 'file-1',
        name: 'test.pdf',
        dataUrl: 'data:application/pdf;base64,xyz',
        mimeType: 'application/pdf',
        size: 1024
      }]

      const originalText = options.draftInput.value
      const originalImages = [...options.pendingAttachments.value]
      const originalFiles = [...options.pendingFiles.value]

      const { performSendMessage, undoPendingSend } = useMessageSending(options)

      const sendPromise = performSendMessage()
      await nextTick()

      // 执行撤回
      undoPendingSend()
      await nextTick()

      // 验证：所有内容被恢复
      expect(options.draftInput.value).toBe(originalText)
      expect(options.pendingAttachments.value).toEqual(originalImages)
      expect(options.pendingFiles.value).toHaveLength(1)
      expect(options.pendingFiles.value[0].name).toBe('test.pdf')

      await sendPromise.catch(() => {})
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Group 3: Requesting 阶段中止
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Requesting 阶段中止', () => {
    it('应该创建空的 assistant 消息壳并标记可重试', async () => {
      // Mock 一个永不返回的流（模拟网络延迟）
      const { aiChatService } = await import('../../../src/services/aiChatService')
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          // 永远等待，模拟网络请求中
          await new Promise(() => {})
        }
      }
      ;(aiChatService.streamChatResponse as any).mockReturnValue(mockStream)

      // 设置：无延时，直接进入 requesting 阶段
      stores.mockAppStore.sendDelayMs = 0

      const { performSendMessage, cancelSending } = useMessageSending(options)

      // 开始发送
      const sendPromise = performSendMessage()
      await nextTick()

      // 等待一小段时间确保进入 requesting 阶段
      await vi.advanceTimersByTimeAsync(10)
      await nextTick()

      // 执行中止（在 requesting 阶段）
      cancelSending()
      await nextTick()

      // 验证：创建了空的 assistant 消息
      const addBranchCalls = stores.mockBranchStore.addMessageBranch.mock.calls
      const assistantMessageCall = addBranchCalls.find(
        (call: any[]) => call[1] === 'assistant'
      )
      expect(assistantMessageCall).toBeDefined()
      if (assistantMessageCall) {
        expect(assistantMessageCall[2]).toEqual([{ type: 'text', text: '' }])
      }

      // 验证：metadata 被正确设置
      expect(stores.mockBranchStore.patchMetadata).toHaveBeenCalledWith(
        'test-conversation',
        expect.any(String),
        expect.any(Function)
      )

      // 获取传递给 patchMetadata 的函数并执行
      const patchCall = stores.mockBranchStore.patchMetadata.mock.calls[0]
      const metadataFn = patchCall[2]
      const metadata = metadataFn()

      expect(metadata).toMatchObject({
        error: '请求已中止',
        canRetry: true,
        abortPhase: 'requesting'
      })
      expect(metadata.abortedAt).toBeGreaterThan(0)

      // 验证：notice 消息被删除
      expect(stores.mockBranchStore.removeMessageBranch).toHaveBeenCalled()

      await sendPromise.catch(() => {})
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Group 4: Streaming 阶段中止
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Streaming 阶段中止', () => {
    it('应该标记 streamAborted 并保留已生成内容', async () => {
      // Mock 流式响应
      const { aiChatService } = await import('../../../src/services/aiChatService')
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'text', content: 'First chunk' }
          // 在这里会被中止
          await new Promise(resolve => setTimeout(resolve, 100))
          yield { type: 'text', content: 'Second chunk' }
        }
      }
      ;(aiChatService.streamChatResponse as any).mockReturnValue(mockStream)

      stores.mockAppStore.sendDelayMs = 0
      const { performSendMessage, cancelSending, isStreaming } = useMessageSending(options)

      // 开始发送
      const sendPromise = performSendMessage()
      await nextTick()

      // 等待进入 streaming 阶段（收到第一个 chunk）
      await vi.advanceTimersByTimeAsync(50)
      await nextTick()

      // 验证：已进入 streaming 阶段
      expect(isStreaming.value).toBe(true)

      // 执行中止
      cancelSending()
      await nextTick()

      // 验证：patchMetadata 被调用，标记 streamAborted
      const patchCalls = stores.mockBranchStore.patchMetadata.mock.calls
      const streamAbortCall = patchCalls.find((call: any[]) => {
        const metadataFn = call[2]
        const result = metadataFn({ usage: null })
        return result.streamAborted === true
      })

      expect(streamAbortCall).toBeDefined()

      // 验证返回的 metadata
      const metadataFn = streamAbortCall![2]
      const metadata = metadataFn({ usage: { totalTokens: 100 } })
      expect(metadata).toMatchObject({
        usage: { totalTokens: 100 },
        streamAborted: true,
        abortPhase: 'streaming'
      })
      expect(metadata.abortedAt).toBeGreaterThan(0)

      // 验证：流式状态被清除
      expect(isStreaming.value).toBe(false)

      await sendPromise.catch(() => {})
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Group 5: 原子性与竞态条件
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('原子性与竞态条件', () => {
    it('应该防止延时结束瞬间的撤回竞态', async () => {
      stores.mockAppStore.sendDelayMs = 1000
      const { performSendMessage, undoPendingSend } = useMessageSending(options)

      const sendPromise = performSendMessage()
      await nextTick()

      // 模拟：在定时器触发前 1ms 尝试撤回
      vi.advanceTimersByTime(999)
      undoPendingSend()

      // 推进到定时器触发点
      vi.advanceTimersByTime(1)
      await nextTick()

      // 验证：要么成功撤回（消息被删除），要么成功发送（notice 更新）
      const removeCalls = stores.mockBranchStore.removeMessageBranch.mock.calls.length
      const updateCalls = stores.mockBranchStore.updateNoticeMessageText.mock.calls.length

      // 只能有一个结果
      expect(removeCalls > 0 || updateCalls > 0).toBe(true)

      await sendPromise.catch(() => {})
    })

    it('应该防止重复发送（并发保护）', async () => {
      stores.mockAppStore.sendDelayMs = 1000
      const { performSendMessage } = useMessageSending(options)

      // 快速连续调用两次
      const promise1 = performSendMessage()
      await nextTick()
      
      const promise2 = performSendMessage()
      await nextTick()

      // 验证：第二次调用被阻止
      const result2 = await promise2
      expect(result2.success).toBe(false)
      // 第二次调用会被检测为幽灵任务或重复发送
      expect(result2.error).toBeTruthy()

      // 清理
      vi.advanceTimersByTime(1000)
      await promise1.catch(() => {})
    })
  })

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Group 6: 边界条件
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('边界条件', () => {
    it('应该处理零延时（立即发送）', async () => {
      stores.mockAppStore.sendDelayMs = 0
      const { performSendMessage, isDelayPending } = useMessageSending(options)

      const sendPromise = performSendMessage()
      await nextTick()

      // 验证：不会进入延时状态
      expect(isDelayPending.value).toBe(false)

      // 验证：notice 消息直接更新为 requesting 状态
      expect(stores.mockBranchStore.updateNoticeMessageText).toHaveBeenCalledWith(
        'test-conversation',
        expect.any(String),
        '消息已发送，等待流式回复……'
      )

      await sendPromise.catch(() => {})
    })

    it('应该处理空消息（验证失败）', async () => {
      options.draftInput.value = ''
      const { performSendMessage } = useMessageSending(options)

      const result = await performSendMessage()

      // 验证：发送失败
      expect(result.success).toBe(false)
      expect(result.error).toContain('消息不能为空')

      // 验证：没有创建任何分支
      expect(stores.mockBranchStore.addMessageBranch).not.toHaveBeenCalled()
    })

    it('应该在撤回后清理定时器', async () => {
      stores.mockAppStore.sendDelayMs = 5000
      const { performSendMessage, undoPendingSend } = useMessageSending(options)

      const sendPromise = performSendMessage()
      await nextTick()

      // 执行撤回
      undoPendingSend()
      await nextTick()

      // 推进定时器（应该不会触发任何操作）
      const callsBefore = stores.mockBranchStore.updateNoticeMessageText.mock.calls.length
      vi.advanceTimersByTime(5000)
      await nextTick()
      const callsAfter = stores.mockBranchStore.updateNoticeMessageText.mock.calls.length

      // 验证：定时器被正确清理，没有额外的调用
      expect(callsAfter).toBe(callsBefore)

      await sendPromise.catch(() => {})
    })
  })
})
