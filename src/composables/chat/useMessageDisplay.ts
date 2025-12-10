/**
 * 消息展示 Composable
 * 
 * 封装消息列表计算、缓存优化、流式状态判断等逻辑
 * 
 * 核心功能：
 * - displayMessages: 从 BranchStore 生成扁平化的消息列表
 * - 缓存优化: 避免每个 token 都触发完整遍历
 * - 流式状态判断: isMessageStreaming
 * 
 * 性能优化策略：
 * 1. 对象复用缓存 (displayMessageCache): 减少 Vue 响应式追踪开销
 * 2. 快速路径缓存 (lastComputedPath): 流式响应时优化为 O(1)
 */

import { ref, computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { MessagePart, MessageVersionMetadata } from '../../types/chat'
import { getCurrentVersion } from '../../stores/branchTreeHelpers'

// ========== 类型定义 ==========

/**
 * DisplayMessage 类型
 * 
 * 用途：在 UI 层展示的消息格式，从树形结构转换而来
 * 
 * 关系映射：
 * - Store: 完整的树形结构，包含所有分支和版本
 * - DisplayMessage: 扁平化的当前路径，只包含当前显示的版本
 * 
 * 字段说明：
 * - id: 版本的唯一 ID（不是分支 ID）
 * - branchId: 所属分支的 ID
 * - role: 消息角色（OpenAI 语义：'user' | 'assistant' | 'tool'）
 * - parts: 消息内容（多模态支持，可包含文本和图片）
 * - timestamp: 创建时间戳
 * - currentVersionIndex: 当前显示的版本索引（从 0 开始）
 * - totalVersions: 该分支的总版本数
 * - hasMultipleVersions: 是否有多个版本（用于显示版本切换按钮）
 * - metadata: 元数据（错误信息、用量统计等）
 */
export type DisplayMessage = {
  id: string
  branchId: string
  role: 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter'
  parts: MessagePart[]
  timestamp: number
  currentVersionIndex: number
  totalVersions: number
  hasMultipleVersions: boolean
  metadata?: MessageVersionMetadata | undefined
}

export interface UseMessageDisplayOptions {
  currentConversation: ComputedRef<any>
  isComponentActive: ComputedRef<boolean>
}

export interface UseMessageDisplayReturn {
  displayMessages: ComputedRef<DisplayMessage[]>
  isMessageStreaming: (branchId: string) => boolean
}

// ========== Composable 主函数 ==========

export function useMessageDisplay(options: UseMessageDisplayOptions): UseMessageDisplayReturn {
  const { currentConversation, isComponentActive } = options

  // ========== 缓存状态 ==========

  /**
   * 对象复用缓存
   * 
   * 目的：避免每次 computed 重算都创建新对象，减少 Vue 的 diff 开销
   * 
   * 工作原理：
   * 1. computed 每次执行时，检查缓存中是否有可复用的对象
   * 2. 如果所有字段都没变，直接复用缓存对象（浅比较）
   * 3. 如果有字段变化，创建新对象并更新缓存
   * 4. 旧的缓存条目会被自动清理
   * 
   * 收益：减少 Vue 的响应式追踪开销和 diff 计算
   */
  const displayMessageCache = new Map<string, DisplayMessage>()

  /**
   * displayMessages 快速路径缓存
   * 
   * 目的：流式响应时避免每个 token 都触发完整的消息遍历
   * 
   * 工作原理：
   * 1. 缓存上次计算时的 currentPath 引用
   * 2. 如果 currentPath 引用未变，说明消息列表结构没变
   * 3. 此时可能只有最后一条消息的内容在变化（流式响应）
   * 4. 直接更新缓存中的那条消息，返回更新后的数组
   * 
   * 适用场景：
   * - 流式响应时（appendTokenToBranch）
   * - currentPath 不变，只有消息内容变化
   * 
   * 收益：将 O(n) 的遍历优化为 O(1) 的缓存查找
   */
  const lastComputedPath = ref<string[] | null>(null)
  const lastComputedMessages = ref<DisplayMessage[]>([])

  // ========== 核心计算属性 ==========

  /**
   * 显示消息列表
   * 
   * 从分支树的 currentPath 生成扁平化的消息数组，用于 UI 渲染
   * 
   * 性能优化：
   * 1. 非激活状态下返回空数组（避免隐藏标签页的计算开销）
   * 2. 快速路径：currentPath 引用未变时，只更新变化的消息（流式响应优化）
   * 3. 完整路径：currentPath 引用变化时，执行完整遍历并更新缓存
   * 
   * 缓存策略：
   * - displayMessageCache: 对象级缓存，避免创建重复对象
   * - lastComputedPath + lastComputedMessages: 快速路径缓存
   */
  const displayMessages = computed<DisplayMessage[]>(() => {
    // 性能优化：非激活状态下不执行昂贵的消息列表计算
    // 这可以显著减少多实例场景下的响应式追踪开销
    if (!isComponentActive.value) {
      return []
    }

    const conversation = currentConversation.value
    if (!conversation?.tree) {
      if (displayMessageCache.size > 0) {
        displayMessageCache.clear()
      }
      lastComputedPath.value = null
      lastComputedMessages.value = []
      return []
    }

    const tree = conversation.tree
    const currentPath = tree.currentPath

    // 🚀 快速路径：如果 currentPath 引用未变，说明消息结构未变
    // 适用场景：流式响应时，只有消息内容在变化
    // 优化效果：将 O(n) 遍历降低为 O(1) 缓存查找
    if (currentPath === lastComputedPath.value && lastComputedMessages.value.length > 0) {
      console.log('[useMessageDisplay] 🚀 快速路径：currentPath 引用未变')
      // currentPath 未变，但可能最后一条消息的 parts 引用变了（流式追加 token）
      // 只需要检查和更新受影响的消息即可
      const updatedMessages = [...lastComputedMessages.value]
      let hasUpdate = false

      for (let i = 0; i < currentPath.length; i++) {
        const branchId = currentPath[i]
        const branch = tree.branches.get(branchId)
        if (!branch) continue

        const version = getCurrentVersion(branch)
        if (!version) continue

        const cached = updatedMessages[i]
        if (!cached) continue

        const partsRef = version.parts as MessagePart[]
        const metadataRef = version.metadata as MessageVersionMetadata | undefined
        const partsChanged = cached.parts !== partsRef
        const metadataChanged = cached.metadata !== metadataRef

        // 检查 parts / metadata 引用是否变化（流式响应会创建新数组或新 metadata）
        if (partsChanged || metadataChanged) {
          console.log('[useMessageDisplay] 📝 检测到变化:', {
            branchId,
            partsChanged,
            metadataChanged,
            index: i
          })
          // 部分字段变化，创建新对象
          updatedMessages[i] = {
            ...cached,
            parts: partsRef,
            metadata: metadataRef
          }
          // 同时更新 displayMessageCache
          displayMessageCache.set(version.id, updatedMessages[i])
          hasUpdate = true
        }
      }

      if (hasUpdate) {
        console.log('[useMessageDisplay] ✅ 快速路径：返回更新后的消息')
        lastComputedMessages.value = updatedMessages
        return updatedMessages
      }

      // 完全没有变化，直接返回缓存
      console.log('[useMessageDisplay] ⚡ 快速路径：无变化，返回缓存')
      return lastComputedMessages.value
    }

    // 🔄 完整路径：currentPath 引用变化，需要完整遍历
    // 发生场景：切换分支、删除消息、添加新消息等
    console.log('[useMessageDisplay] 🔄 完整路径：currentPath 引用变化或首次计算', {
      pathLength: currentPath.length,
      pathChanged: currentPath !== lastComputedPath.value
    })
    const nextCache = new Map<string, DisplayMessage>()
    const messages: DisplayMessage[] = []

    for (const branchId of currentPath) {
      const branch = tree.branches.get(branchId)
      if (!branch) continue

      const version = getCurrentVersion(branch)
      if (!version) continue

      const cacheKey = version.id
      const cached = displayMessageCache.get(cacheKey)
      const partsRef = version.parts as MessagePart[]
      const metadataRef = version.metadata as MessageVersionMetadata | undefined
      const totalVersions = branch.versions.length
      const currentVersionIndex = branch.currentVersionIndex

      const shouldReuse = Boolean(
        cached &&
        cached.branchId === branchId &&
        cached.role === branch.role &&
        cached.parts === partsRef &&
        cached.timestamp === version.timestamp &&
        cached.totalVersions === totalVersions &&
        cached.currentVersionIndex === currentVersionIndex &&
        cached.metadata === metadataRef
      )

      const message: DisplayMessage = shouldReuse && cached
        ? cached
        : {
            id: version.id,
            branchId,
            role: branch.role,
            parts: partsRef,
            timestamp: version.timestamp,
            currentVersionIndex,
            totalVersions,
            hasMultipleVersions: totalVersions > 1,
            metadata: metadataRef
          }

      // 🔍 DEBUG: 记录 AI 消息的 metadata
      if (branch.role === 'assistant' && metadataRef) {
        console.log('[useMessageDisplay] 🔍 Model message metadata:', {
          branchId,
          hasMetadata: !!metadataRef,
          hasReasoning: !!metadataRef.reasoning,
          reasoningKeys: metadataRef.reasoning ? Object.keys(metadataRef.reasoning) : [],
          streamText: metadataRef.reasoning?.streamText?.substring(0, 100),
          text: metadataRef.reasoning?.text?.substring(0, 100),
          summary: metadataRef.reasoning?.summary,
          details: metadataRef.reasoning?.details?.length || 0
        })
      }

      nextCache.set(cacheKey, message)
      messages.push(message)
    }

    displayMessageCache.clear()
    nextCache.forEach((value, key) => {
      displayMessageCache.set(key, value)
    })

    // 更新快速路径缓存
    lastComputedPath.value = currentPath
    lastComputedMessages.value = messages

    return messages
  })

  // ========== 辅助函数 ==========

  /**
   * 判断消息是否正在流式接收中
   * 
   * 用于优化渲染性能：流式中显示纯文本，完成后才进行 Markdown/LaTeX 渲染
   * 
   * @param branchId - 分支ID
   * @returns 是否正在流式生成
   */
  const isMessageStreaming = (branchId: string): boolean => {
    if (!currentConversation.value) return false
    
    const tree = currentConversation.value.tree
    const generationStatus = currentConversation.value.generationStatus
    
    // 只有当前路径的最后一个分支且状态为 sending 或 receiving 时才是流式中
    const isLastBranch = tree.currentPath[tree.currentPath.length - 1] === branchId
    const isGenerating = generationStatus === 'sending' || generationStatus === 'receiving'
    
    return isLastBranch && isGenerating
  }

  // ========== 返回 API ==========

  return {
    displayMessages,
    isMessageStreaming
  }
}
