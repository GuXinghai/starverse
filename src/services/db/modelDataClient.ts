/**
 * 模型数据数据库客户端
 * 
 * 提供模型列表的持久化接口（SQLite 数据库）
 * 参考规范：/docs/openrouter-model-sync-spec.md
 */

import { dbBridge } from '../../utils/electronBridge'
import { sanitizeForIpc } from '../../utils/ipcSanitizer'
import type { 
  ModelDataRecord, 
  SaveModelDataInput,
  ListModelParams,
  ModelPricingRecord,
  ModelCapabilitiesRecord 
} from '../../../infra/db/types'
import type { AppModel, ModelPricing, ModelCapabilities } from '../../types/appModel'
import type { DbMethod } from '../../../infra/db/types'

/**
 * 调用数据库方法
 */
async function query<T = unknown>(method: DbMethod, params?: unknown): Promise<T> {
  return await dbBridge.invoke<T>(method, params)
}

// ============================================================================
// AppModel 持久化接口（新规范）
// ============================================================================

/**
 * 保存多个 AppModel 到数据库
 * 
 * @param models - AppModel 数组
 */
export async function saveAppModels(models: AppModel[]): Promise<void> {
  console.log('[modelDataClient] 📦 准备保存 AppModel', {
    count: models.length,
    sample: models[0]?.id
  })

  const cleanedModels = sanitizeForIpc(models) as unknown as AppModel[]
  
  const inputs: SaveModelDataInput[] = cleanedModels.map(model => ({
    id: String(model.id),
    routerSource: model.router_source,
    vendor: model.vendor,
    name: model.name || model.id,
    description: model.description,
    contextLength: model.context_length,
    pricing: pricingToRecord(model.pricing),
    capabilities: model.capabilities as ModelCapabilitiesRecord,
    isArchived: model.is_archived,
    firstSeenAt: model.first_seen_at,
    lastSeenAt: model.last_seen_at,
    meta: {
      input_modalities: model.input_modalities,
      output_modalities: model.output_modalities,
      supported_parameters: model.supported_parameters,
      max_output_tokens: model.max_output_tokens,
    }
  }))
  
  console.log('[modelDataClient] 📤 准备发送到 Worker', {
    inputsCount: inputs.length,
    sampleInput: inputs[0]
  })

  await query('model.saveMany', { models: inputs })
  
  console.log('[modelDataClient] ✅ AppModel 保存成功')
}

/**
 * 获取所有 AppModel（默认不包含已归档）
 * 
 * @param params - 查询参数
 * @returns AppModel 数组
 */
export async function getAppModels(params?: ListModelParams): Promise<AppModel[]> {
  const records = await query('model.getAll', params ?? {}) as ModelDataRecord[]
  return records.map(recordToAppModel)
}

/**
 * 根据接入来源获取模型列表
 * 
 * @param routerSource - 接入来源 (如 'openrouter')
 * @param includeArchived - 是否包含已归档模型
 * @returns AppModel 数组
 */
export async function getAppModelsByRouterSource(
  routerSource: string, 
  includeArchived = false
): Promise<AppModel[]> {
  const records = await query('model.getByRouterSource', {
    routerSource,
    includeArchived
  }) as ModelDataRecord[]
  return records.map(recordToAppModel)
}

/**
 * 根据 ID 获取单个 AppModel
 * 
 * @param modelId - 模型 ID
 * @returns AppModel 或 null
 */
export async function getAppModelById(modelId: string): Promise<AppModel | null> {
  const record = await query('model.getById', { modelId }) as ModelDataRecord | null
  return record ? recordToAppModel(record) : null
}

/**
 * 替换指定接入来源的所有模型（软删除策略）
 * 
 * @param routerSource - 接入来源
 * @param models - 新的 AppModel 列表
 */
export async function replaceAppModelsByRouterSource(
  routerSource: string, 
  models: AppModel[]
): Promise<void> {
  const cleanedModels = sanitizeForIpc(models) as unknown as AppModel[]
  
  const inputs: SaveModelDataInput[] = cleanedModels.map(model => ({
    id: String(model.id),
    routerSource: model.router_source,
    vendor: model.vendor,
    name: model.name || model.id,
    description: model.description,
    contextLength: model.context_length,
    pricing: pricingToRecord(model.pricing),
    capabilities: model.capabilities as ModelCapabilitiesRecord,
    isArchived: model.is_archived,
    firstSeenAt: model.first_seen_at,
    lastSeenAt: model.last_seen_at,
    meta: {
      input_modalities: model.input_modalities,
      output_modalities: model.output_modalities,
      supported_parameters: model.supported_parameters,
      max_output_tokens: model.max_output_tokens,
    }
  }))

  await query('model.replaceByRouterSource', { routerSource, models: inputs })
}
/**
 * 仅清空模型表数据 (model_data)
 */
export async function clearModelTable(): Promise<void> {
  await query('model.clear', {})
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 将数据库记录转换为 AppModel
 */
function recordToAppModel(record: ModelDataRecord): AppModel {
  const meta = record.meta || {}
  
  // 解析 capabilities
  const capabilities: ModelCapabilities = record.capabilities ?? {
    hasReasoning: false,
    hasTools: false,
    hasJsonMode: false,
    isMultimodal: false,
  }
  
  // 解析 pricing（DB record 使用旧 key，AppModel 使用带单位的新 key）
  const pricing: ModelPricing = recordToPricing(record.pricing)
  
  return {
    id: record.id,
    name: record.name,
    context_length: record.contextLength ?? -1,
    capabilities,
    pricing,
    is_archived: record.isArchived ?? false,
    first_seen_at: record.firstSeenAt,
    last_seen_at: record.lastSeenAt,
    router_source: (record.routerSource ?? 'openrouter') as any,
    vendor: record.vendor ?? 'unknown',
    description: record.description,
    max_output_tokens: meta.max_output_tokens as number | undefined,
    input_modalities: meta.input_modalities as string[] | undefined,
    output_modalities: meta.output_modalities as string[] | undefined,
    supported_parameters: meta.supported_parameters as string[] | undefined,
  }
}

function recordToPricing(record: ModelPricingRecord | null | undefined): ModelPricing {
  const safe = record ?? {
    prompt: '0',
    completion: '0',
    request: '0',
    image: '0',
    web_search: '0',
    internal_reasoning: '0',
    input_cache_read: '0',
    input_cache_write: '0',
  }

  return {
    promptUsdPerToken: String(safe.prompt ?? '0'),
    completionUsdPerToken: String(safe.completion ?? '0'),
    requestUsd: String(safe.request ?? '0'),
    imageUsd: String(safe.image ?? '0'),
    webSearchUsd: String(safe.web_search ?? '0'),
    internalReasoningUsdPerToken: String(safe.internal_reasoning ?? '0'),
    inputCacheReadUsdPerToken: String(safe.input_cache_read ?? '0'),
    inputCacheWriteUsdPerToken: String(safe.input_cache_write ?? '0'),
  }
}

function pricingToRecord(pricing: ModelPricing | null | undefined): ModelPricingRecord {
  const safe = pricing ?? {
    promptUsdPerToken: '0',
    completionUsdPerToken: '0',
    requestUsd: '0',
    imageUsd: '0',
    webSearchUsd: '0',
    internalReasoningUsdPerToken: '0',
    inputCacheReadUsdPerToken: '0',
    inputCacheWriteUsdPerToken: '0',
  }

  return {
    prompt: String(safe.promptUsdPerToken ?? '0'),
    completion: String(safe.completionUsdPerToken ?? '0'),
    request: String(safe.requestUsd ?? '0'),
    image: String(safe.imageUsd ?? '0'),
    web_search: String(safe.webSearchUsd ?? '0'),
    internal_reasoning: String(safe.internalReasoningUsdPerToken ?? '0'),
    input_cache_read: String(safe.inputCacheReadUsdPerToken ?? '0'),
    input_cache_write: String(safe.inputCacheWriteUsdPerToken ?? '0'),
  }
}

