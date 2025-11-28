/**
 * useWebSearch - Web 搜索配置 Composable
 * 
 * 职责：
 * - Web 搜索开关管理
 * - 搜索深度级别配置（quick/normal/deep）
 * - OpenRouter 提供商限制检查
 * - 搜索请求参数构建
 */

import { computed, type ComputedRef } from 'vue'
import type { WebSearchLevel } from '../types/chat'

/**
 * 搜索级别配置
 */
export interface WebSearchLevelConfig {
  searchContextSize: 'low' | 'medium' | 'high'
  maxResults: number
}

/**
 * 搜索级别选项
 */
export interface WebSearchLevelOption {
  value: WebSearchLevel
  label: string
}

/**
 * Web 搜索配置
 */
export interface WebSearchConfig {
  enabled: boolean
  level: WebSearchLevel
}

/**
 * 搜索级别预设配置
 */
export const WEB_SEARCH_LEVEL_PRESETS: Readonly<Record<WebSearchLevel, WebSearchLevelConfig>> = {
  quick: { searchContextSize: 'low', maxResults: 3 },
  normal: { searchContextSize: 'medium', maxResults: 5 },
  deep: { searchContextSize: 'high', maxResults: 8 }
}

/**
 * 搜索级别显示文本
 */
export const WEB_SEARCH_LEVEL_TEXT: Readonly<Record<WebSearchLevel, string>> = {
  quick: '快速',
  normal: '普通',
  deep: '深入'
}

/**
 * 所有搜索级别列表
 */
export const WEB_SEARCH_LEVELS: ReadonlyArray<WebSearchLevel> = ['quick', 'normal', 'deep']

/**
 * 搜索级别选项列表
 */
export const WEB_SEARCH_LEVEL_OPTIONS: ReadonlyArray<WebSearchLevelOption> = WEB_SEARCH_LEVELS.map((level) => ({
  value: level,
  label: WEB_SEARCH_LEVEL_TEXT[level]
}))

/**
 * Composable 选项
 */
export interface WebSearchOptions {
  /** 当前对话的 Web 搜索配置（响应式） */
  webSearchConfig: ComputedRef<WebSearchConfig | undefined>
  /** 组件是否激活 */
  isActive: ComputedRef<boolean>
  /** 当前提供商 */
  activeProvider: ComputedRef<string>
  /** 搜索引擎名称 */
  webSearchEngine: ComputedRef<string>
  /** 更新搜索开关回调 */
  onUpdateEnabled: (enabled: boolean) => void
  /** 更新搜索级别回调 */
  onUpdateLevel: (level: WebSearchLevel) => void
}

/**
 * Web 搜索配置 Composable
 */
export function useWebSearch(options: WebSearchOptions) {
  const {
    webSearchConfig: currentWebSearchConfig,
    isActive,
    activeProvider,
    webSearchEngine,
    onUpdateEnabled,
    onUpdateLevel
  } = options

  // ========== 计算属性 ==========

  /**
   * Web 搜索是否可用（仅 OpenRouter 支持）
   */
  const isWebSearchAvailable = computed(() => {
    // 性能优化：非激活状态下跳过检查
    if (!isActive.value) {
      return false
    }

    // 仅 OpenRouter 支持
    return activeProvider.value === 'OpenRouter'
  })

  /**
   * Web 搜索是否启用
   */
  const webSearchEnabled = computed(() => {
    const enabled = currentWebSearchConfig.value?.enabled ?? false
    console.log('🔄 [useWebSearch] webSearchEnabled 计算', {
      config: currentWebSearchConfig.value,
      enabled
    })
    return enabled
  })

  /**
   * 当前搜索级别
   */
  const webSearchLevel = computed<WebSearchLevel>(() => {
    return currentWebSearchConfig.value?.level || 'normal'
  })

  /**
   * 搜索级别显示文本
   */
  const webSearchLevelLabel = computed(() => {
    return WEB_SEARCH_LEVEL_TEXT[webSearchLevel.value]
  })

  /**
   * Web 搜索按钮 Tooltip
   */
  const webSearchButtonTitle = computed(() => {
    if (!isWebSearchAvailable.value) {
      return '仅在 OpenRouter 模式下可用网络搜索'
    }
    return webSearchEnabled.value
      ? `点击关闭网络搜索（当前：${webSearchLevelLabel.value}）`
      : '点击启用网络搜索'
  })

  // ========== 方法 ==========

  /**
   * 切换 Web 搜索开关
   */
  function toggleWebSearch() {
    console.log('🔍 [useWebSearch] toggleWebSearch 调用', {
      isAvailable: isWebSearchAvailable.value,
      currentEnabled: webSearchEnabled.value,
      willSetTo: !webSearchEnabled.value,
      currentConfig: currentWebSearchConfig.value
    })
    
    if (!isWebSearchAvailable.value) {
      console.warn('⚠️ [useWebSearch] Web 搜索不可用，操作被阻止')
      return
    }
    
    onUpdateEnabled(!webSearchEnabled.value)
  }

  /**
   * 选择搜索级别
   * 
   * 如果当前搜索未启用，选择级别时会自动启用
   */
  function selectWebSearchLevel(level: WebSearchLevel) {
    if (!WEB_SEARCH_LEVELS.includes(level)) {
      return
    }
    
    // 选择级别时自动启用网络搜索
    if (!webSearchEnabled.value) {
      onUpdateEnabled(true)
    }
    
    onUpdateLevel(level)
  }

  /**
   * 构建 Web 搜索请求参数
   * 
   * 三个预设级别：
   * - quick（快速）：3个结果，low 上下文
   * - normal（普通）：5个结果，medium 上下文
   * - deep（深入）：8个结果，high 上下文
   * 
   * @returns Web 搜索配置对象，或 null（如果未启用或不可用）
   */
  function buildWebSearchRequestOptions() {
    if (!isWebSearchAvailable.value || !webSearchEnabled.value) {
      return null
    }

    const level = webSearchLevel.value
    const preset = WEB_SEARCH_LEVEL_PRESETS[level] || WEB_SEARCH_LEVEL_PRESETS.normal

    return {
      enabled: true,
      engine: webSearchEngine.value,
      maxResults: preset.maxResults,
      searchContextSize: preset.searchContextSize
    }
  }

  // ========== 导出 ==========

  return {
    // 常量
    WEB_SEARCH_LEVELS,
    WEB_SEARCH_LEVEL_TEXT,
    WEB_SEARCH_LEVEL_PRESETS,
    WEB_SEARCH_LEVEL_OPTIONS,
    
    // 状态
    isWebSearchAvailable,
    webSearchEnabled,
    webSearchLevel,
    webSearchLevelLabel,
    webSearchButtonTitle,
    
    // 方法
    toggleWebSearch,
    selectWebSearchLevel,
    buildWebSearchRequestOptions
  }
}
