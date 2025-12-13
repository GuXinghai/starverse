/**
 * modelSync.ts - 模型同步核心逻辑
 * 
 * 本文件实现 OpenRouter 模型同步规范中定义的核心函数。
 * 参考规范文档：/docs/openrouter-model-sync-spec.md
 * 
 * 职责：
 * - normalizeModel: 将 OpenRouter API 响应规整为 AppModel
 * - shouldUpdate: 判断是否需要更新本地缓存
 * - 提供防御性编程的数据处理
 * 
 * ⚠️ 重要约束：
 * - 禁止基于模型 ID 字符串猜测能力
 * - 所有能力判断必须基于 supported_parameters 和 architecture
 */

import type { 
  AppModel, 
  ModelCapabilities, 
  ModelPricing,
  RouterSource 
} from '../types/appModel'

// ============================================================================
// 常量定义
// ============================================================================

/** 多模态标识 token 集合 */
const MULTIMODAL_TOKEN_SET = new Set(['image', 'audio', 'video', 'file'])

/** 默认价格值 */
const DEFAULT_PRICE = '0'

/**
 * OpenRouter Models API commit gate
 * 
 * 目的：防止异常快照覆盖本地（例如 401/429、错误 JSON、半列表响应）。
 * 
 * 规则：
 * - 非 200 -> abort
 * - json.error 存在 -> abort
 * - json.data 非数组 -> abort
 * - data 数量异常偏小 -> abort
 */
const COMMIT_GATE_ABS_MIN_MODELS = 100
const COMMIT_GATE_RATIO_MIN = 0.8

function computeCommitGateMinExpected(remoteHintExistingActive: number): number {
  if (remoteHintExistingActive > 0) {
    return Math.max(
      COMMIT_GATE_ABS_MIN_MODELS,
      Math.floor(remoteHintExistingActive * COMMIT_GATE_RATIO_MIN)
    )
  }
  return COMMIT_GATE_ABS_MIN_MODELS
}

// ============================================================================
// 核心函数: normalizeModel
// ============================================================================

/**
 * 将 OpenRouter API 返回的原始模型对象规整为 AppModel
 * 
 * 职责：
 * - 单条失败仅丢弃，不影响其他条目
 * - 所有能力判断基于 API 返回字段，禁止字符串猜测
 * - 处理时间戳字段（first_seen_at / last_seen_at）
 * 
 * @param raw - 来自 OpenRouter /api/v1/models 的单个模型对象
 * @param existingModel - 本地已存在的模型（用于保留 first_seen_at）
 * @param now - 当前时间戳 (ISO8601)，默认为 new Date().toISOString()
 * @returns 规整后的 AppModel，或 null（如果数据无效）
 */
export function normalizeModel(
  raw: unknown,
  existingModel?: AppModel | null,
  now?: string
): AppModel | null {
  try {
    // 类型检查
    if (!raw || typeof raw !== 'object') {
      console.warn('[ModelSync] 跳过非对象模型条目:', raw)
      return null
    }

    const rawObj = raw as Record<string, unknown>

    // ID 必须存在
    if (!rawObj.id || typeof rawObj.id !== 'string') {
      console.warn('[ModelSync] 跳过缺少 id 的模型条目:', rawObj)
      return null
    }

    const modelId = rawObj.id

    // 解析 supported_parameters
    const params: string[] = Array.isArray(rawObj.supported_parameters)
      ? (rawObj.supported_parameters as string[])
      : []

    // 解析 architecture
    const arch = (rawObj.architecture && typeof rawObj.architecture === 'object')
      ? rawObj.architecture as Record<string, unknown>
      : {}
    
    const inputMods: string[] = Array.isArray(arch.input_modalities)
      ? (arch.input_modalities as string[])
      : []
    
    const outputMods: string[] = Array.isArray(arch.output_modalities)
      ? (arch.output_modalities as string[])
      : []

    // ========== 能力推导（严格基于 API 字段） ==========
    const hasReasoning = params.includes('reasoning')
    const hasTools = params.includes('tools')
    const hasJsonMode = params.includes('structured_outputs') || params.includes('response_format')
    const isMultimodal = 
      inputMods.some(m => MULTIMODAL_TOKEN_SET.has(m)) ||
      outputMods.some(m => MULTIMODAL_TOKEN_SET.has(m))

    const capabilities: ModelCapabilities = {
      hasReasoning,
      hasTools,
      hasJsonMode,
      isMultimodal,
    }

    // ========== 价格解析 ==========
    const rawPricing = (rawObj.pricing && typeof rawObj.pricing === 'object')
      ? rawObj.pricing as Record<string, unknown>
      : {}

    const pricing: ModelPricing = {
      promptUsdPerToken: String(rawPricing.prompt ?? DEFAULT_PRICE),
      completionUsdPerToken: String(rawPricing.completion ?? DEFAULT_PRICE),
      requestUsd: String(rawPricing.request ?? DEFAULT_PRICE),
      imageUsd: String(rawPricing.image ?? DEFAULT_PRICE),
      webSearchUsd: String(rawPricing.web_search ?? DEFAULT_PRICE),
      internalReasoningUsdPerToken: String(rawPricing.internal_reasoning ?? DEFAULT_PRICE),
      inputCacheReadUsdPerToken: String(rawPricing.input_cache_read ?? DEFAULT_PRICE),
      inputCacheWriteUsdPerToken: String(rawPricing.input_cache_write ?? DEFAULT_PRICE),
    }

    // ========== context_length ==========
    const context_length = typeof rawObj.context_length === 'number'
      ? rawObj.context_length
      : -1

    // ========== vendor 解析（从 id 前缀） ==========
    const vendor = modelId.includes('/') ? modelId.split('/')[0] : 'unknown'

    // ========== 时间戳处理 ==========
    const timestamp = now ?? new Date().toISOString()
    const first_seen_at = existingModel?.first_seen_at ?? timestamp
    const last_seen_at = timestamp

    // ========== 构建 AppModel ==========
    const appModel: AppModel = {
      id: modelId,
      name: String(rawObj.name || rawObj.canonical_slug || modelId),
      context_length,
      capabilities,
      pricing,
      is_archived: false,
      first_seen_at,
      last_seen_at,
      router_source: 'openrouter' as RouterSource,
      vendor,
      description: typeof rawObj.description === 'string' ? rawObj.description : undefined,
      max_output_tokens: typeof rawObj.max_output_tokens === 'number' ? rawObj.max_output_tokens : undefined,
      input_modalities: inputMods.length > 0 ? inputMods : undefined,
      output_modalities: outputMods.length > 0 ? outputMods : undefined,
      supported_parameters: params.length > 0 ? params : undefined,
    }

    return appModel
  } catch (e) {
    const rawId = (raw as Record<string, unknown>)?.id
    console.warn(`[ModelSync] 规范化模型失败，跳过: ${rawId}`, e)
    return null
  }
}

// ============================================================================
// 核心函数: shouldUpdate
// ============================================================================

/**
 * 判断是否需要用远程结果更新本地缓存
 * 
 * 规则：
 * 1. 只比较"活跃模型"（is_archived === false）
 * 2. 使用排序后的指纹（fingerprint）比较关键字段
 * 
 * @param local - 本地模型列表
 * @param remote - 远程模型列表（已通过 normalizeModel 处理）
 * @returns 是否需要更新
 */
export function shouldUpdate(local: AppModel[], remote: AppModel[]): boolean {
  // 只比较活跃模型
  const activeLocal = local.filter(m => !m.is_archived)

  // 长度不同，直接认为有变更
  if (activeLocal.length !== remote.length) {
    return true
  }

  // 计算指纹并比较
  const localFingerprint = computeFingerprint(activeLocal)
  const remoteFingerprint = computeFingerprint(remote)

  return localFingerprint !== remoteFingerprint
}

/**
 * 计算模型列表的指纹
 * 
 * @param models - 模型列表
 * @returns 指纹字符串
 */
function computeFingerprint(models: AppModel[]): string {
  const sorted = [...models].sort((a, b) => a.id.localeCompare(b.id))
  
  return JSON.stringify(
    sorted.map(m => ({
      id: m.id,
      ctx: m.context_length,
      cap: m.capabilities,
      price: m.pricing,
    }))
  )
}

// ============================================================================
// 辅助函数: mergeWithArchived
// ============================================================================

/**
 * 将远程模型与本地归档模型合并
 * 
 * 策略：
 * - 远程存在的模型：使用远程数据（is_archived = false）
 * - 本地存在但远程缺失：标记为 is_archived = true，保留 last_seen_at
 * - 排序：活跃模型在前，归档模型在后，同类按 id 排序
 * 
 * @param remoteModels - 从远程获取并规范化的模型列表
 * @param localModels - 本地模型列表
 * @returns 合并后的模型列表
 */
export function mergeWithArchived(
  remoteModels: AppModel[],
  localModels: AppModel[]
): AppModel[] {
  const remoteIds = new Set(remoteModels.map(m => m.id))

  // 标记本地存在但远程缺失的模型为归档
  const archivedModels: AppModel[] = localModels
    .filter(m => !remoteIds.has(m.id))
    .map(m => ({
      ...m,
      is_archived: true,
      // last_seen_at 保持不变，不再更新
    }))

  // 合并并排序
  const merged = [...remoteModels, ...archivedModels]
  
  return merged.sort((a, b) => {
    // 活跃模型在前
    if (a.is_archived !== b.is_archived) {
      return a.is_archived ? 1 : -1
    }
    // 同类按 id 排序
    return a.id.localeCompare(b.id)
  })
}

// ============================================================================
// 辅助函数: batchNormalizeModels
// ============================================================================

/**
 * 批量规范化模型列表
 * 
 * 特点：
 * - 单条失败不影响整体
 * - 保留已存在模型的 first_seen_at
 * 
 * @param rawModels - 原始模型数组
 * @param existingModels - 本地已存在的模型（用于保留时间戳）
 * @param now - 当前时间戳
 * @returns 规范化后的模型列表（过滤掉失败的）
 */
export function batchNormalizeModels(
  rawModels: unknown[],
  existingModels?: AppModel[],
  now?: string
): AppModel[] {
  const timestamp = now ?? new Date().toISOString()
  const existingMap = new Map(existingModels?.map(m => [m.id, m]) ?? [])

  return rawModels
    .map(raw => {
      const rawId = (raw as Record<string, unknown>)?.id as string | undefined
      const existing = rawId ? existingMap.get(rawId) : undefined
      return normalizeModel(raw, existing, timestamp)
    })
    .filter((m): m is AppModel => m !== null)
}

// ============================================================================
// 辅助函数: extractVendor
// ============================================================================

/**
 * 从模型 ID 中提取厂商
 * 
 * @param modelId - 模型 ID (如 'openai/gpt-4o')
 * @returns 厂商名称 (如 'openai')
 */
export function extractVendor(modelId: string): string {
  if (!modelId || typeof modelId !== 'string') {
    return 'unknown'
  }
  return modelId.includes('/') ? modelId.split('/')[0] : 'unknown'
}

// ============================================================================
// 辅助函数: filterActiveModels
// ============================================================================

/**
 * 过滤出活跃（未归档）的模型
 * 
 * @param models - 模型列表
 * @returns 活跃模型列表
 */
export function filterActiveModels(models: AppModel[]): AppModel[] {
  return models.filter(m => !m.is_archived)
}

/**
 * 过滤出归档的模型
 * 
 * @param models - 模型列表
 * @returns 归档模型列表
 */
export function filterArchivedModels(models: AppModel[]): AppModel[] {
  return models.filter(m => m.is_archived)
}

// ============================================================================
// 核心函数: syncFromOpenRouter
// ============================================================================

/**
 * 同步结果类型
 */
export interface SyncResult {
  success: boolean
  models: AppModel[]
  error?: Error
  stats: {
    total: number
    active: number
    archived: number
    withReasoning: number
    withTools: number
    multimodal: number
  }
}

/**
 * 从 OpenRouter API 同步模型列表
 * 
 * 这是新架构的唯一入口，完全替代旧的 getModelParameters 批量调用。
 * 
 * 工作流程：
 * 1. 调用 GET /api/v1/models 获取完整模型列表
 * 2. 使用 batchNormalizeModels 将原始数据转换为 AppModel[]
 * 3. 与本地已存在模型合并（保留 first_seen_at，标记归档）
 * 4. 返回完整的同步结果
 * 
 * @param apiKey - OpenRouter API Key
 * @param existingModels - 本地已存在的模型列表（用于增量更新）
 * @param baseUrl - API 基础 URL，默认 'https://openrouter.ai'
 * @returns 同步结果
 */
export async function syncFromOpenRouter(
  apiKey: string,
  existingModels: AppModel[] = [],
  baseUrl: string = 'https://openrouter.ai'
): Promise<SyncResult> {
  const now = new Date().toISOString()
  
  try {
    console.log('[ModelSync] 🔄 开始从 OpenRouter 同步模型...')
    
    // 1. 调用 API
    const url = `${baseUrl}/models`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    // ========== Commit Gate (严格中止条件) ==========
    if (response.status !== 200) {
      throw new Error(`commit gate: non-200 response: ${response.status} ${response.statusText}`)
    }

    let data: any
    try {
      data = await response.json()
    } catch (e) {
      throw new Error(`commit gate: invalid json: ${String(e)}`)
    }

    // OpenRouter 错误结构：{ error: { code, message, metadata? } }
    if (data?.error) {
      const code = typeof data.error?.code === 'string' ? data.error.code : 'unknown'
      const message = typeof data.error?.message === 'string' ? data.error.message : JSON.stringify(data.error)
      throw new Error(`commit gate: api error: ${code}: ${message}`)
    }

    if (!data || !Array.isArray(data.data)) {
      throw new Error('commit gate: invalid response shape: missing data[]')
    }

    const rawModels = data.data as unknown[]

    const existingActive = existingModels.filter(m => !m.is_archived).length
    const minExpected = computeCommitGateMinExpected(existingActive)
    if (rawModels.length < minExpected) {
      throw new Error(
        `commit gate: too few models: remote=${rawModels.length}, existingActive=${existingActive}, minExpected=${minExpected}`
      )
    }

    console.log(`[ModelSync] 📥 收到 ${rawModels.length} 个原始模型`)

    // 2. 批量规范化
    const normalizedModels = batchNormalizeModels(rawModels, existingModels, now)
    console.log(`[ModelSync] ✅ 规范化成功: ${normalizedModels.length} 个模型`)

    // 3. 与本地合并（标记归档）
    const mergedModels = mergeWithArchived(normalizedModels, existingModels)

    // 4. 统计能力
    const stats = computeStats(mergedModels)
    
    console.log(`[ModelSync] ✅ 同步完成:`, {
      total: stats.total,
      active: stats.active,
      archived: stats.archived,
      withReasoning: stats.withReasoning,
      withTools: stats.withTools,
      multimodal: stats.multimodal,
    })

    return {
      success: true,
      models: mergedModels,
      stats,
    }
  } catch (error) {
    console.error('[ModelSync] ❌ 同步失败:', error)
    return {
      success: false,
      models: existingModels, // 返回原有数据
      error: error instanceof Error ? error : new Error(String(error)),
      stats: computeStats(existingModels),
    }
  }
}

/**
 * 计算模型统计信息
 */
function computeStats(models: AppModel[]): SyncResult['stats'] {
  const active = models.filter(m => !m.is_archived)
  
  return {
    total: models.length,
    active: active.length,
    archived: models.length - active.length,
    withReasoning: active.filter(m => (m.capabilities?.hasReasoning ?? false)).length,
    withTools: active.filter(m => (m.capabilities?.hasTools ?? false)).length,
    multimodal: active.filter(m => (m.capabilities?.isMultimodal ?? false)).length,
  }
}
