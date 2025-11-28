/**
 * useConversationSearch - 对话搜索 Composable
 * 
 * 功能:
 * 1. 管理搜索状态 (搜索词、范围选择)
 * 2. 提供标题/内容搜索匹配逻辑
 * 3. 集成全文搜索服务 (FTS5)
 * 4. 处理搜索竞态条件和加载状态
 * 
 * 依赖:
 * - runFulltextSearch: 全文搜索服务
 * - SearchDslError: 搜索 DSL 错误类型
 * 
 * @example
 * const {
 *   searchQuery,
 *   searchInTitle,
 *   searchInContent,
 *   contentSearchHits,
 *   contentSearchLoading,
 *   contentSearchMessage,
 *   contentSearchMessageType,
 *   conversationMatchesContent,
 *   buildSearchScopes
 * } = useConversationSearch()
 */

import { ref, watch, type Ref } from 'vue'
import { runFulltextSearch, SearchDslError } from '@/services/searchService'

// ConversationRecord 类型定义 (从 ConversationList.vue 复制)
type ConversationRecord = {
  id: string
  title: string
  projectId?: string | null
  model: string
  createdAt: number
  tree?: {
    branches?: Map<string, any> | Record<string, any>
    currentPath?: string[]
  }
}

/**
 * 搜索消息提示音调类型
 */
export type SearchMessageTone = 'info' | 'warning' | 'error'

/**
 * 对话搜索状态接口
 */
export interface ConversationSearchState {
  /** 搜索关键词 */
  searchQuery: Ref<string>
  /** 是否在标题中搜索 */
  searchInTitle: Ref<boolean>
  /** 是否在内容中搜索 */
  searchInContent: Ref<boolean>
  /** 内容搜索命中的对话 ID 集合 */
  contentSearchHits: Ref<Set<string>>
  /** 内容搜索加载状态 */
  contentSearchLoading: Ref<boolean>
  /** 内容搜索提示消息 */
  contentSearchMessage: Ref<string>
  /** 内容搜索消息类型 */
  contentSearchMessageType: Ref<SearchMessageTone>
}

/**
 * 对话搜索 Composable
 * 
 * @param rawSearchQuery - 外部传入的搜索词 ref (可选，用于双向绑定)
 * @returns 搜索状态和方法
 */
export function useConversationSearch(rawSearchQuery?: Ref<string>) {
  // ========================================
  // 状态变量
  // ========================================
  
  /** 搜索关键词 (内部状态) */
  const internalSearchQuery = ref('')
  
  /** 实际使用的搜索词 (优先使用外部传入) */
  const searchQuery = rawSearchQuery ?? internalSearchQuery
  
  /** 是否在标题中搜索 */
  const searchInTitle = ref(true)
  
  /** 是否在内容中搜索 */
  const searchInContent = ref(false)
  
  /** 内容搜索命中的对话 ID 集合 */
  const contentSearchHits = ref<Set<string>>(new Set())
  
  /** 内容搜索加载状态 */
  const contentSearchLoading = ref(false)
  
  /** 内容搜索提示消息 */
  const contentSearchMessage = ref('')
  
  /** 内容搜索消息类型 */
  const contentSearchMessageType = ref<SearchMessageTone>('info')
  
  /** 内容搜索请求 ID (防止竞态条件) */
  let contentSearchRequestId = 0
  
  // ========================================
  // 工具方法
  // ========================================
  
  /**
   * 重置内容搜索状态
   */
  const resetContentSearch = () => {
    contentSearchHits.value = new Set()
    contentSearchMessage.value = ''
    contentSearchMessageType.value = 'info'
    contentSearchLoading.value = false
  }
  
  /**
   * 构建搜索范围配置
   * 
   * 规则: 如果标题和内容都未勾选，默认搜索标题
   * 
   * @returns 搜索范围对象 { title: boolean, content: boolean }
   */
  const buildSearchScopes = () => {
    const scopes = {
      title: searchInTitle.value,
      content: searchInContent.value
    }
    // 如果两者都未勾选，默认搜索标题
    if (!scopes.title && !scopes.content) {
      scopes.title = true
    }
    return scopes
  }
  
  /**
   * 判断对话内容是否匹配搜索词
   * 
   * 算法: 遍历对话树的所有分支和版本，检查消息文本部分
   * 
   * 性能: O(n*m*k) 其中:
   * - n: 分支数量
   * - m: 当前路径上的消息数量
   * - k: 版本数量
   * 
   * TODO (在 TODO 8 中优化):
   * 1. 使用 WeakMap 缓存匹配结果
   * 2. 早期返回优化 (找到匹配立即返回)
   * 3. 考虑 Web Worker 处理大对话
   * 
   * @param conversation - 对话记录
   * @param query - 搜索关键词 (小写)
   * @returns 是否匹配
   */
  const conversationMatchesContent = (conversation: ConversationRecord, query: string): boolean => {
    const tree = conversation.tree
    if (!tree || !tree.branches) {
      return false
    }
    
    // 获取当前激活的路径
    const currentPath = tree.currentPath || []
    
    // 遍历当前路径上的所有消息
    for (const messageId of currentPath) {
      // 获取该消息的分支信息
      const getBranch = (branches: Map<string, any> | Record<string, any>, id: string) => {
        if (branches instanceof Map) {
          return branches.get(id)
        }
        return branches[id]
      }
      
      const branch = getBranch(tree.branches, messageId)
      if (!branch || !Array.isArray(branch.versions)) {
        continue
      }
      
      // 遍历该消息的所有版本
      for (const version of branch.versions) {
        const currentVersion = version.version ?? version
        if (!currentVersion || !Array.isArray(currentVersion.parts)) {
          continue
        }
        
        // 检查版本中的所有文本部分
        for (const part of currentVersion.parts) {
          if (
            part?.type === 'text' &&
            typeof part.text === 'string' &&
            part.text.toLowerCase().includes(query)
          ) {
            return true
          }
        }
      }
    }
    
    return false
  }
  
  // ========================================
  // 副作用: 监听搜索条件变化
  // ========================================
  
  /**
   * 监听搜索词和搜索范围变化，自动触发全文搜索
   * 
   * 竞态条件处理:
   * - 使用递增的 requestId 标记每次请求
   * - 只有最新请求的结果才会更新状态
   * - 旧请求的结果被静默丢弃
   * 
   * 注意:
   * - immediate: true 会在组件加载时触发一次搜索
   * - 已添加 query 和 searchContent 的空值检查
   */
  watch(
    [() => searchQuery.value, searchInContent],
    async ([query, searchContent]) => {
      // 如果未启用内容搜索或搜索词为空，重置状态
      if (!searchContent || !query) {
        resetContentSearch()
        return
      }
      
      // 生成新的请求 ID
      const requestId = ++contentSearchRequestId
      contentSearchLoading.value = true
      contentSearchMessage.value = ''
      contentSearchMessageType.value = 'info'
      
      try {
        // 调用全文搜索服务
        const results = await runFulltextSearch(query, { limit: 100, highlight: false })
        
        // 检查是否为最新请求
        if (requestId !== contentSearchRequestId) {
          return
        }
        
        // 更新搜索结果
        contentSearchHits.value = new Set(results.map(result => result.convoId))
        contentSearchMessageType.value = 'info'
        contentSearchMessage.value = results.length === 0 
          ? '未找到匹配内容' 
          : `命中 ${results.length} 条内容`
      } catch (error) {
        // 检查是否为最新请求
        if (requestId !== contentSearchRequestId) {
          return
        }
        
        // 处理错误
        contentSearchHits.value = new Set()
        if (error instanceof SearchDslError) {
          contentSearchMessageType.value = 'warning'
          contentSearchMessage.value = error.message
        } else {
          contentSearchMessageType.value = 'error'
          contentSearchMessage.value = '全文搜索失败，请稍后重试'
          console.error('全文搜索失败:', error)
        }
      } finally {
        // 只有最新请求才更新加载状态
        if (requestId === contentSearchRequestId) {
          contentSearchLoading.value = false
        }
      }
    },
    { immediate: true }
  )
  
  // ========================================
  // 返回接口
  // ========================================
  
  return {
    // 状态
    searchQuery,
    searchInTitle,
    searchInContent,
    contentSearchHits,
    contentSearchLoading,
    contentSearchMessage,
    contentSearchMessageType,
    
    // 方法
    conversationMatchesContent,
    buildSearchScopes,
    resetContentSearch
  }
}
