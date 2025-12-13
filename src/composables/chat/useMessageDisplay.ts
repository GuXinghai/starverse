/**
 * 消息展示 Composable (重构版 - 基于 ID 的细粒度响应式)
 * 
 * 核心功能：
 * - displayBranchIds: 返回消息 ID 列表（拓扑结构）
 * - isMessageStreaming: 流式状态判断
 * 
 * 架构变更说明：
 * - 移除数据转换层：不再组装 DisplayMessage 对象
 * - 职责分离：Composable 只负责"显示哪些消息"，不负责"消息内容是什么"
 * - 组件直连 Store：子组件通过 branchId 直接从 Store 读取数据
 * - 性能优化：消除中间层缓存，利用 Vue 原生响应式系统
 */

import { computed } from 'vue'
import type { ComputedRef } from 'vue'

export interface UseMessageDisplayOptions {
  currentConversation: ComputedRef<any>
  isComponentActive: ComputedRef<boolean>
}

export interface UseMessageDisplayReturn {
  displayBranchIds: ComputedRef<string[]>
  isMessageStreaming: (branchId: string) => boolean
}

export function useMessageDisplay(options: UseMessageDisplayOptions): UseMessageDisplayReturn {
  const { currentConversation, isComponentActive } = options

  /**
   * 消息 ID 列表（拓扑结构）
   * 
   * 只返回 branchId 数组，不组装消息内容
   * 
   * 架构优势：
   * - 性能：currentPath 不变时此 computed 不会重新计算（Vue 缓存）
   * - 简洁：将内容获取职责下放给子组件
   * - 响应式：子组件直接追踪 Store 中的数据变化
   */
  const displayBranchIds = computed<string[]>(() => {
    // 性能优化：非激活状态下返回空数组（隐藏标签页不渲染）
    if (!isComponentActive.value) {
      return []
    }

    const conversation = currentConversation.value
    if (!conversation?.tree) {
      return []
    }

    // 直接返回当前路径（ID 列表）
    return conversation.tree.currentPath
  })

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

  return {
    displayBranchIds,
    isMessageStreaming
  }
}
