/**
 * useBranchNavigation - 分支导航 Composable
 * 
 * 职责：
 * - 分支版本切换（上一个/下一个）
 * - 分支版本信息显示
 * - 分支历史导航
 */

import { useBranchStore } from '@/stores/branch'
import { useConversationStore } from '@/stores/conversation'

export interface BranchNavigationOptions {
  conversationId: string
}

export function useBranchNavigation(options: BranchNavigationOptions) {
  const branchStore = useBranchStore()
  const conversationStore = useConversationStore()

  /**
   * 获取分支的版本信息
   */
  function getBranchVersionInfo(branchId: string) {
    const conversation = conversationStore.conversations.find(
      c => c.id === options.conversationId
    )
    
    if (!conversation?.tree) {
      return { current: 0, total: 0, canPrevious: false, canNext: false }
    }

    const branch = conversation.tree.branches.get(branchId)
    if (!branch) {
      return { current: 0, total: 0, canPrevious: false, canNext: false }
    }

    const total = branch.versions.length
    const currentIndex = branch.currentVersionIndex
    const current = currentIndex + 1 // 1-based

    return {
      current,
      total,
      canPrevious: currentIndex > 0,
      canNext: currentIndex < total - 1
    }
  }

  /**
   * 切换到上一个版本
   */
  function switchToPreviousVersion(branchId: string): boolean {
    const info = getBranchVersionInfo(branchId)
    if (!info.canPrevious) return false

    branchStore.switchBranchVersion(options.conversationId, branchId, -1)
    return true
  }

  /**
   * 切换到下一个版本
   */
  function switchToNextVersion(branchId: string): boolean {
    const info = getBranchVersionInfo(branchId)
    if (!info.canNext) return false

    branchStore.switchBranchVersion(options.conversationId, branchId, 1)
    return true
  }

  /**
   * 获取分支显示文本
   */
  function getBranchText(branchId: string): string {
    return branchStore.getBranchText(options.conversationId, branchId)
  }

  /**
   * 检查分支是否有多个版本
   */
  function hasMultipleVersions(branchId: string): boolean {
    const info = getBranchVersionInfo(branchId)
    return info.total > 1
  }

  /**
   * 获取当前分支路径（从根到叶子）
   */
  function getCurrentBranchPath(branchId: string): string[] {
    return branchStore.getPathTo(options.conversationId, branchId)
  }

  return {
    // 方法
    getBranchVersionInfo,
    switchToPreviousVersion,
    switchToNextVersion,
    getBranchText,
    hasMultipleVersions,
    getCurrentBranchPath
  }
}
