/**
 * 分支树管理 Store
 * 
 * 职责：
 * - 分支树核心操作（添加、删除、切换版本）
 * - Token 和图片追加（流式生成）
 * - 推理内容管理
 * - 分支路径计算
 * - 消息内容更新
 */

import { defineStore } from 'pinia'
import { useConversationStore } from './conversation'
import { usePersistenceStore } from './persistence'
import type { MessagePart } from '../types/chat'
import type { DisplayMessage, VersionMetadata } from '../types/store'
import {
  addBranch,
  addVersionToBranch,
  switchVersion,
  deleteBranch,
  removeBranchVersion as removeBranchVersionFromTree,
  getCurrentPathMessages,
  appendTokenToBranch,
  appendImageToBranch,
  updateBranchContent,
  patchBranchMetadata,
  appendReasoningDetailToBranch,
  setReasoningSummaryForBranch,
  getCurrentVersion,
  extractTextFromBranch,
  getPathToBranch
} from './branchTreeHelpers'

export const useBranchStore = defineStore('branch', () => {
  const conversationStore = useConversationStore()
  const persistenceStore = usePersistenceStore()

  // ========== 辅助函数 ==========

  /**
   * 获取对话的分支树
   */
  const getTree = (conversationId: string) => {
    const conversation = conversationStore.getConversationById(conversationId)
    if (!conversation) {
      throw new Error(`[BranchStore] Conversation not found: ${conversationId}`)
    }
    return conversation.tree
  }

  // ========== Actions - 分支管理 ==========

  /**
   * 添加新分支
   * 
   * @param conversationId - 对话 ID
  * @param role - OpenAI 语义：'user' | 'assistant' | 'tool'
   * @param parts - 消息内容
   * @param parentBranchId - 父分支 ID，null 表示根分支
   * @returns 新分支 ID
   */
  const addMessageBranch = (
    conversationId: string,
    role: 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter',
    parts: MessagePart[],
    parentBranchId: string | null = null
  ): string => {
    console.log('[BranchStore] addMessageBranch 调用', {
      conversationId,
      role,
      partsCount: parts.length,
      parentBranchId,
      timestamp: Date.now(),
      stackTrace: new Error().stack?.split('\n').slice(2, 4).join('\n')
    })
    
    const tree = getTree(conversationId)
    const newBranchId = addBranch(tree, role as 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter', parts, parentBranchId)
    
    console.log('[BranchStore] 新分支已创建', {
      newBranchId,
      role,
      conversationId
    })
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏数据，需要持久化
    persistenceStore.markConversationDirty(conversationId)
    
    return newBranchId
  }

  /**
   * 添加分支版本（用于重新生成）
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param parts - 新版本内容
   * @returns 新版本 ID
   */
  const addBranchVersion = (
    conversationId: string,
    branchId: string,
    parts: MessagePart[],
    inheritChildren: boolean = false
  ): string => {
    const tree = getTree(conversationId)
    const versionId = addVersionToBranch(tree, branchId, parts, inheritChildren)
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 🔧 标记对话需要持久化
    persistenceStore.markConversationDirty(conversationId)
    
    return versionId
  }

  /**
   * 切换分支版本
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param direction - +1 下一个版本，-1 上一个版本
   */
  const switchBranchVersion = (
    conversationId: string,
    branchId: string,
    direction: 1 | -1
  ): void => {
    const tree = getTree(conversationId)
    switchVersion(tree, branchId, direction)
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏状态，触发持久化保存
    persistenceStore.markConversationDirty(conversationId)
  }

  /**
   * 创建一个临时的 notice 消息（仅内存，不持久化）
   * 
   * 使用 role: 'notice' 标识系统临时通知
   * 这些消息会在流式完成后自动清除
   */
  const addNoticeMessage = (
    conversationId: string,
    noticeText: string
  ): string => {
    const noticeBranchId = addMessageBranch(
      conversationId,
      'notice',
      [{ type: 'text', text: noticeText }]
    )
    return noticeBranchId
  }

  /**
   * 更新 notice 消息文本
   */
  const updateNoticeMessageText = (
    conversationId: string,
    branchId: string,
    noticeText: string
  ): void => {
    updateBranchParts(conversationId, branchId, [{ type: 'text', text: noticeText }])
  }

  /**
   * 删除一条消息分支
   */
  const removeMessageBranch = (conversationId: string, branchId: string): void => {
    removeBranch(conversationId, branchId, true)
  }

  /**
   * 删除分支
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param deleteAllVersions - 是否删除所有版本（默认 true）
   */
  const removeBranch = (
    conversationId: string,
    branchId: string,
    deleteAllVersions: boolean = true
  ): void => {
    const tree = getTree(conversationId)
    deleteBranch(tree, branchId, deleteAllVersions)
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏状态，触发持久化保存
    persistenceStore.markConversationDirty(conversationId)
  }

  /**
   * 删除分支版本
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param versionId - 版本 ID（而不是索引）
   */
  const removeBranchVersionById = (
    conversationId: string,
    branchId: string,
    versionId: string
  ): void => {
    const tree = getTree(conversationId)
    removeBranchVersionFromTree(tree, branchId, versionId)
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏状态，触发持久化保存
    persistenceStore.markConversationDirty(conversationId)
  }

  // ========== Actions - 内容追加（流式生成）==========

  /**
   * 追加 Token 到分支（流式生成）
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param token - Token 文本
   */
  const appendToken = (
    conversationId: string,
    branchId: string,
    token: string
  ): void => {
    const tree = getTree(conversationId)
    appendTokenToBranch(tree, branchId, token)
    
    // 标记对话为脏数据（Token 追加时延迟标记，由 finally 块统一保存）
    persistenceStore.markConversationDirty(conversationId)
  }

  /**
   * 追加图片到分支
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param imageUrl - 图片 URL（base64 data URI）
   */
  const appendImage = (
    conversationId: string,
    branchId: string,
    imageUrl: string
  ): void => {
    const tree = getTree(conversationId)
    appendImageToBranch(tree, branchId, imageUrl)
  }

  /**
   * 更新分支内容（用于编辑消息）
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param parts - 新内容
   */
  const updateBranchParts = (
    conversationId: string,
    branchId: string,
    parts: MessagePart[]
  ): void => {
    const tree = getTree(conversationId)
    updateBranchContent(tree, branchId, parts)
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏状态，触发持久化保存
    persistenceStore.markConversationDirty(conversationId)
  }

  /**
   * 修补分支元数据
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param metadataPatcher - 元数据修补函数
   */
  const patchMetadata = (
    conversationId: string,
    branchId: string,
    metadataPatcher: (current: VersionMetadata | undefined) => VersionMetadata | undefined
  ): void => {
    const tree = getTree(conversationId)
    patchBranchMetadata(tree, branchId, metadataPatcher)
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏状态，触发持久化保存
    persistenceStore.markConversationDirty(conversationId)
  }

  // ========== Actions - 推理内容管理 ==========

  /**
   * 追加推理细节
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param detail - 推理细节对象
   */
  const appendReasoningDetail = (
    conversationId: string,
    branchId: string,
    detail: { title?: string; content: string }
  ): void => {
    console.log('[BranchStore] 🔍 appendReasoningDetail called:', {
      conversationId,
      branchId,
      detail
    })

    const tree = getTree(conversationId)
    appendReasoningDetailToBranch(tree, branchId, detail)
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏状态，触发持久化保存
    persistenceStore.markConversationDirty(conversationId)
  }

  /**
   * 追加推理流式文本
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param text - 流式文本
   */
  const appendReasoningStreamingText = (
    conversationId: string,
    branchId: string,
    text: string
  ): void => {
    console.log('[BranchStore] 🔍 appendReasoningStreamingText called:', {
      conversationId,
      branchId,
      textLength: text.length,
      textPreview: text.substring(0, 100)
    })

    const tree = getTree(conversationId)
    const branch = tree.branches.get(branchId)
    if (!branch) {
      console.warn('[BranchStore] ⚠️ Branch not found:', branchId)
      return
    }

    const version = getCurrentVersion(branch)
    if (!version) {
      console.warn('[BranchStore] ⚠️ No current version for branch:', branchId)
      return
    }

    // 使用正确的字段名 streamText
    const currentStreamingText = version.metadata?.reasoning?.streamText || ''
    console.log('[BranchStore] 📝 Current streamText length:', currentStreamingText.length)

    const updatedMetadata: VersionMetadata = {
      ...version.metadata,
      reasoning: {
        ...version.metadata?.reasoning,
        streamText: currentStreamingText + text
      }
    }

    console.log('[BranchStore] ✅ Updated reasoning metadata:', {
      totalStreamTextLength: updatedMetadata.reasoning?.streamText?.length,
      hasReasoning: !!updatedMetadata.reasoning
    })

    // patchBranchMetadata 需要一个函数
    patchBranchMetadata(tree, branchId, () => updatedMetadata)
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏状态，触发持久化保存
    persistenceStore.markConversationDirty(conversationId)
  }

  /**
   * 设置分支的推理摘要
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @param summaryData - 推理摘要数据 (字符串或对象)
   */
  const setReasoningSummary = (
    conversationId: string,
    branchId: string,
    summaryData: string | {
      summary?: string
      text?: string
      request?: any
      provider?: string
      model?: string
      excluded?: any
    }
  ): void => {
    const tree = getTree(conversationId)
    // setReasoningSummaryForBranch 接受对象而不是字符串
    if (typeof summaryData === 'string') {
      setReasoningSummaryForBranch(tree, branchId, { summary: summaryData })
    } else {
      setReasoningSummaryForBranch(tree, branchId, summaryData)
    }
    
    const conversation = conversationStore.getConversationById(conversationId)
    if (conversation) {
      conversation.updatedAt = Date.now()
    }
    
    // 标记对话为脏状态，触发持久化保存
    persistenceStore.markConversationDirty(conversationId)
  }

  // ========== Queries - 路径和消息查询 ==========

  /**
   * 获取当前对话路径的所有消息
   * 
   * ⚠️ 引用陷阱警告：
   * - 返回的 DisplayMessage[] 数组是新创建的（通过 .map()）
   * - 但数组中每个消息的 `parts` 字段仍是原始引用
   * - 如需快照（防止后续修改影响），调用方必须深拷贝：
   *   `messages.map(msg => ({ ...msg, parts: msg.parts.map(p => ({ ...p })) }))`
   * 
   * @param conversationId - 对话 ID
   * @returns 显示消息数组（浅拷贝，parts 为引用）
   * @internal 仅供内部 composables 调用（useMessageSending 等），UI 层禁止使用
   * @deprecated 对于 UI 渲染，请改用 displayBranchIds（见 useMessageDisplay）
   */
  const _buildMessageHistoryForAPI = (conversationId: string): DisplayMessage[] => {
    const tree = getTree(conversationId)
    const pathMessages = getCurrentPathMessages(tree)

    return pathMessages
      .filter((pm): pm is NonNullable<typeof pm> => pm !== null)
      .map((pm) => {
        const branch = tree.branches.get(pm.branchId)
        if (!branch) {
          throw new Error(`Branch ${pm.branchId} not found`)
        }

        // 根据 versionId 查找版本索引
        const versionIndex = branch.versions.findIndex(v => v.id === pm.versionId)
        if (versionIndex === -1) {
          throw new Error(`Version ${pm.versionId} not found in branch ${pm.branchId}`)
        }

        const totalVersions = branch.versions.length
        const currentVersionIndex = branch.currentVersionIndex

        return {
          id: pm.versionId,  // 🔧 添加 id 字段（用于 v-for key）
          branchId: pm.branchId,
          versionIndex,
          // 保持内部统一语义：AI 消息使用 'model'，用户消息使用 'user'
          role: pm.role,
          parts: pm.parts,
          timestamp: pm.timestamp,  // 🔧 添加 timestamp 字段
          currentVersionIndex,  // 🔧 添加 currentVersionIndex 字段
          totalVersions,  // 🔧 添加 totalVersions 字段
          hasMultipleVersions: totalVersions > 1,  // 🔧 添加 hasMultipleVersions 字段
          metadata: pm.metadata,
          modelUsed: undefined, // modelUsed 不在 MessageVersionMetadata 中
          generatedAt: pm.timestamp
        }
      })
  }

  /**
   * 获取到指定分支的路径
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 目标分支 ID
   * @returns 分支 ID 数组
   */
  const getPathTo = (
    conversationId: string,
    branchId: string
  ): string[] => {
    const tree = getTree(conversationId)
    return getPathToBranch(tree, branchId)
  }

  /**
   * 获取分支的文本内容
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @returns 文本内容
   */
  const getBranchText = (
    conversationId: string,
    branchId: string
  ): string => {
    const tree = getTree(conversationId)
    const branch = tree.branches.get(branchId)
    if (!branch) return ''
    
    return extractTextFromBranch(branch)
  }

  /**
   * 获取分支对象
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @returns 分支对象或 null
   */
  const getBranch = (conversationId: string, branchId: string) => {
    const tree = getTree(conversationId)
    return tree.branches.get(branchId) || null
  }

  /**
   * 获取分支当前版本
   * 
   * @param conversationId - 对话 ID
   * @param branchId - 分支 ID
   * @returns 版本对象或 null
   */
  const getBranchCurrentVersion = (conversationId: string, branchId: string) => {
    const branch = getBranch(conversationId, branchId)
    if (!branch) return null
    
    return getCurrentVersion(branch)
  }

  return {
    // 分支管理
    addMessageBranch,
    addBranchVersion,
    switchBranchVersion,
    removeBranch,
    removeBranchVersionById,

    // 内容追加
    appendToken,
      appendImage,
      updateBranchParts,
      patchMetadata,
      addNoticeMessage,
      updateNoticeMessageText,
      removeMessageBranch,

    // 推理管理
    appendReasoningDetail,
    appendReasoningStreamingText,
    setReasoningSummary,

    // 查询
    _buildMessageHistoryForAPI,  // 内部辅助函数（仅供 composables 使用）
    getPathTo,
    getBranchText,
    getBranch,
    getBranchCurrentVersion
  }
})
