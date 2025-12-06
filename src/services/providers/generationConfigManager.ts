/**
 * generationConfigManager.ts - 4层配置覆盖系统
 * 
 * 职责：
 * - 管理全局、模型、对话、请求 4 层配置
 * - 提供配置合并算法
 * - 持久化配置到 electron-store
 * 
 * 设计原则：
 * - 分层清晰：每层只存储真正需要覆盖的字段
 * - 向下继承：下层优先级高于上层
 * - 可追溯：每个字段都能追溯到来源层
 * 
 * 配置优先级：
 * Global (最低) < Model < Conversation < Request (最高)
 */

import { ref, computed, type ComputedRef } from 'vue'
import type {
  GenerationConfig,
  PartialGenerationConfig,
  SourcedGenerationConfig,
} from '../../types/generation'
import { electronStore } from '../../utils/electronBridge'
import { DEFAULT_GENERATION_CONFIG } from '../../types/generation'

// ============================================================================
// SECTION 1: Storage Keys (存储键名)
// ============================================================================

const STORAGE_KEY_GLOBAL_CONFIG = 'generation.global'
const STORAGE_KEY_MODEL_CONFIGS = 'generation.models'
const STORAGE_KEY_CONVERSATION_CONFIGS = 'generation.conversations'

// ============================================================================
// SECTION 2: Configuration Manager (配置管理器)
// ============================================================================

/**
 * 生成配置管理器
 * 
 * 提供 4 层配置的 CRUD 接口
 */
export class GenerationConfigManager {
  /**
   * 全局默认配置
   */
  private globalConfig = ref<PartialGenerationConfig>({})

  /**
   * 模型级配置 Map
   * 
   * Key: modelId
   * Value: 该模型的配置覆盖
   */
  private modelConfigs = ref<Map<string, PartialGenerationConfig>>(new Map())

  /**
   * 对话级配置 Map
   * 
   * Key: conversationId
   * Value: 该对话的配置覆盖
   */
  private conversationConfigs = ref<Map<string, PartialGenerationConfig>>(new Map())

  constructor() {
    this.loadFromStorage()
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Global Config (全局配置)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 获取全局配置
   */
  getGlobalConfig(): PartialGenerationConfig {
    return { ...this.globalConfig.value }
  }

  /**
   * 更新全局配置
   * 
   * @param config - 新的全局配置（Partial，只更新提供的字段）
   */
  async setGlobalConfig(config: PartialGenerationConfig): Promise<void> {
    this.globalConfig.value = this.deepMerge(this.globalConfig.value, config)
    await this.saveGlobalConfig()
    console.log('[GenerationConfigManager] Global config updated')
  }

  /**
   * 重置全局配置为默认值
   */
  async resetGlobalConfig(): Promise<void> {
    this.globalConfig.value = {}
    await this.saveGlobalConfig()
    console.log('[GenerationConfigManager] Global config reset to default')
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Model Config (模型级配置)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 获取特定模型的配置
   * 
   * @param modelId - 模型 ID
   * @returns 该模型的配置覆盖（如果有）
   */
  getModelConfig(modelId: string): PartialGenerationConfig | null {
    return this.modelConfigs.value.get(modelId) ?? null
  }

  /**
   * 设置特定模型的配置
   * 
   * @param modelId - 模型 ID
   * @param config - 配置覆盖
   */
  async setModelConfig(modelId: string, config: PartialGenerationConfig): Promise<void> {
    const existing = this.modelConfigs.value.get(modelId) ?? {}
    this.modelConfigs.value.set(modelId, this.deepMerge(existing, config))
    await this.saveModelConfigs()
    console.log(`[GenerationConfigManager] Model config updated for ${modelId}`)
  }

  /**
   * 删除特定模型的配置
   * 
   * @param modelId - 模型 ID
   */
  async deleteModelConfig(modelId: string): Promise<void> {
    this.modelConfigs.value.delete(modelId)
    await this.saveModelConfigs()
    console.log(`[GenerationConfigManager] Model config deleted for ${modelId}`)
  }

  /**
   * 获取所有模型配置
   */
  getAllModelConfigs(): Map<string, PartialGenerationConfig> {
    return new Map(this.modelConfigs.value)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Conversation Config (对话级配置)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 获取特定对话的配置
   * 
   * @param conversationId - 对话 ID
   * @returns 该对话的配置覆盖（如果有）
   */
  getConversationConfig(conversationId: string): PartialGenerationConfig | null {
    return this.conversationConfigs.value.get(conversationId) ?? null
  }

  /**
   * 设置特定对话的配置
   * 
   * @param conversationId - 对话 ID
   * @param config - 配置覆盖
   */
  async setConversationConfig(conversationId: string, config: PartialGenerationConfig): Promise<void> {
    const existing = this.conversationConfigs.value.get(conversationId) ?? {}
    this.conversationConfigs.value.set(conversationId, this.deepMerge(existing, config))
    await this.saveConversationConfigs()
    console.log(`[GenerationConfigManager] Conversation config updated for ${conversationId}`)
  }

  /**
   * 删除特定对话的配置
   * 
   * @param conversationId - 对话 ID
   */
  async deleteConversationConfig(conversationId: string): Promise<void> {
    this.conversationConfigs.value.delete(conversationId)
    await this.saveConversationConfigs()
    console.log(`[GenerationConfigManager] Conversation config deleted for ${conversationId}`)
  }

  /**
   * 获取所有对话配置
   */
  getAllConversationConfigs(): Map<string, PartialGenerationConfig> {
    return new Map(this.conversationConfigs.value)
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Config Merging (配置合并)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 获取生效配置
   * 
   * 合并顺序：Default → Global → Model → Conversation → Request
   * 
   * @param options - 合并选项
   * @returns 最终生效的配置
   */
  getEffectiveConfig(options: {
    modelId?: string
    conversationId?: string
    requestOverride?: PartialGenerationConfig
  }): GenerationConfig {
    const { modelId, conversationId, requestOverride } = options

    let result: any = { ...DEFAULT_GENERATION_CONFIG }

    // 1. 合并全局配置
    result = this.deepMerge(result, this.globalConfig.value)

    // 2. 合并模型配置
    if (modelId) {
      const modelConfig = this.modelConfigs.value.get(modelId)
      if (modelConfig) {
        result = this.deepMerge(result, modelConfig)
      }
    }

    // 3. 合并对话配置
    if (conversationId) {
      const convoConfig = this.conversationConfigs.value.get(conversationId)
      if (convoConfig) {
        result = this.deepMerge(result, convoConfig)
      }
    }

    // 4. 合并请求级覆盖
    if (requestOverride) {
      result = this.deepMerge(result, requestOverride)
    }

    return result as GenerationConfig
  }

  /**
   * 获取配置栈（调试用）
   * 
   * 返回每层配置及其来源，便于追溯
   * 
   * @param options - 查询选项
   * @returns 配置栈
   */
  getConfigStack(options: {
    modelId?: string
    conversationId?: string
  }): SourcedGenerationConfig[] {
    const { modelId, conversationId } = options
    const stack: SourcedGenerationConfig[] = []

    // Global
    if (Object.keys(this.globalConfig.value).length > 0) {
      stack.push({ config: this.globalConfig.value, source: 'global' })
    }

    // Model
    if (modelId) {
      const modelConfig = this.modelConfigs.value.get(modelId)
      if (modelConfig && Object.keys(modelConfig).length > 0) {
        stack.push({ config: modelConfig, source: 'model' })
      }
    }

    // Conversation
    if (conversationId) {
      const convoConfig = this.conversationConfigs.value.get(conversationId)
      if (convoConfig && Object.keys(convoConfig).length > 0) {
        stack.push({ config: convoConfig, source: 'conversation' })
      }
    }

    return stack
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Persistence (持久化)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 从 electron-store 加载配置
   */
  private async loadFromStorage(): Promise<void> {
    try {
      // 加载全局配置
      const global = await electronStore.get(STORAGE_KEY_GLOBAL_CONFIG)
      if (global && typeof global === 'object') {
        this.globalConfig.value = global as PartialGenerationConfig
      }

      // 加载模型配置
      const models = await electronStore.get(STORAGE_KEY_MODEL_CONFIGS)
      if (models && typeof models === 'object') {
        this.modelConfigs.value = new Map(Object.entries(models))
      }

      // 加载对话配置
      const conversations = await electronStore.get(STORAGE_KEY_CONVERSATION_CONFIGS)
      if (conversations && typeof conversations === 'object') {
        this.conversationConfigs.value = new Map(Object.entries(conversations))
      }

      console.log('[GenerationConfigManager] Loaded config from storage')
    } catch (error) {
      console.error('[GenerationConfigManager] Failed to load config from storage:', error)
    }
  }

  /**
   * 保存全局配置到 electron-store
   */
  private async saveGlobalConfig(): Promise<void> {
    try {
      await electronStore.set(STORAGE_KEY_GLOBAL_CONFIG, this.globalConfig.value)
    } catch (error) {
      console.error('[GenerationConfigManager] Failed to save global config:', error)
    }
  }

  /**
   * 保存模型配置到 electron-store
   */
  private async saveModelConfigs(): Promise<void> {
    try {
      const obj = Object.fromEntries(this.modelConfigs.value)
      await electronStore.set(STORAGE_KEY_MODEL_CONFIGS, obj)
    } catch (error) {
      console.error('[GenerationConfigManager] Failed to save model configs:', error)
    }
  }

  /**
   * 保存对话配置到 electron-store
   */
  private async saveConversationConfigs(): Promise<void> {
    try {
      const obj = Object.fromEntries(this.conversationConfigs.value)
      await electronStore.set(STORAGE_KEY_CONVERSATION_CONFIGS, obj)
    } catch (error) {
      console.error('[GenerationConfigManager] Failed to save conversation configs:', error)
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Utility (辅助函数)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 深度合并两个配置对象
   * 
   * 规则：
   * - undefined 值不会覆盖已有值
   * - null 会覆盖已有值（表示显式清除）
   * 
   * @param base - 基础配置
   * @param override - 覆盖配置
   * @returns 合并后的配置
   */
  private deepMerge(base: any, override: any): any {
    if (!override || typeof override !== 'object') {
      return base
    }

    const result = { ...base }

    for (const key of Object.keys(override)) {
      const overrideValue = override[key]

      // undefined 不覆盖
      if (overrideValue === undefined) {
        continue
      }

      // 如果两者都是对象，递归合并
      if (
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key]) &&
        typeof overrideValue === 'object' &&
        !Array.isArray(overrideValue)
      ) {
        result[key] = this.deepMerge(result[key], overrideValue)
      } else {
        // 否则直接覆盖
        result[key] = overrideValue
      }
    }

    return result
  }
}

// ============================================================================
// SECTION 3: Singleton Instance (单例实例)
// ============================================================================

/**
 * 全局配置管理器单例
 */
export const generationConfigManager = new GenerationConfigManager()

// ============================================================================
// SECTION 4: Composable Wrapper (Composable 包装器)
// ============================================================================

/**
 * Composable: 使用生成配置管理器
 * 
 * 提供响应式的配置访问接口
 * 
 * @example
 * ```typescript
 * const { effectiveConfig, updateConversationConfig } = useGenerationConfig({
 *   modelId: computed(() => currentModel.value.id),
 *   conversationId: computed(() => currentConversation.value.id),
 * })
 * ```
 */
export function useGenerationConfig(options: {
  modelId?: ComputedRef<string | undefined>
  conversationId?: ComputedRef<string | undefined>
}) {
  const { modelId, conversationId } = options

  /**
   * 当前生效的配置（响应式）
   */
  const effectiveConfig = computed(() => {
    return generationConfigManager.getEffectiveConfig({
      modelId: modelId?.value,
      conversationId: conversationId?.value,
    })
  })

  /**
   * 配置栈（调试用）
   */
  const configStack = computed(() => {
    return generationConfigManager.getConfigStack({
      modelId: modelId?.value,
      conversationId: conversationId?.value,
    })
  })

  /**
   * 更新全局配置
   */
  const updateGlobalConfig = (config: PartialGenerationConfig) => {
    return generationConfigManager.setGlobalConfig(config)
  }

  /**
   * 更新当前模型配置
   */
  const updateModelConfig = (config: PartialGenerationConfig) => {
    const mId = modelId?.value
    if (!mId) {
      console.warn('[useGenerationConfig] Cannot update model config: modelId is undefined')
      return
    }
    return generationConfigManager.setModelConfig(mId, config)
  }

  /**
   * 更新当前对话配置
   */
  const updateConversationConfig = (config: PartialGenerationConfig) => {
    const cId = conversationId?.value
    if (!cId) {
      console.warn('[useGenerationConfig] Cannot update conversation config: conversationId is undefined')
      return
    }
    return generationConfigManager.setConversationConfig(cId, config)
  }

  return {
    effectiveConfig,
    configStack,
    updateGlobalConfig,
    updateModelConfig,
    updateConversationConfig,
  }
}
