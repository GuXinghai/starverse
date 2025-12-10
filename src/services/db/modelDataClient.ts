/**
 * 模型数据数据库客户端
 * 
 * 提供模型列表的持久化接口（SQLite 数据库）
 */

import { dbBridge } from '../../utils/electronBridge'
import { sanitizeForIpc } from '../../utils/ipcSanitizer'
import type { ModelDataRecord, SaveModelDataInput } from '../../../infra/db/types'
import type { ModelData } from '../../types/store'
import type { DbMethod } from '../../../infra/db/types'

/**
 * 调用数据库方法
 */
async function query<T = unknown>(method: DbMethod, params?: unknown): Promise<T> {
  return await dbBridge.invoke<T>(method, params)
}

/**
 * 保存多个模型到数据库
 */
export async function saveModels(models: ModelData[]): Promise<void> {
  console.log('[modelDataClient] 📦 准备保存模型', {
    count: models.length,
    sample: models[0]?.id
  })

  // 🧹 清理数据：移除不可序列化的对象（函数、Symbol、循环引用等）
  const cleanedModels = sanitizeForIpc(models) as ModelData[]
  
  console.log('[modelDataClient] ✅ 数据清理完成', {
    originalCount: models.length,
    cleanedCount: cleanedModels.length
  })

  const inputs: SaveModelDataInput[] = cleanedModels.map(model => {
    // 确保 id 是字符串类型
    const modelId = String(model.id)
    
    // 清理 meta 数据（去除所有可能的问题字段）
    const cleanMeta = {
      architecture: model.architecture ? sanitizeForIpc(model.architecture) : undefined,
      modality: model.modality ? sanitizeForIpc(model.modality) : undefined,
      per_request_limits: model.per_request_limits ? sanitizeForIpc(model.per_request_limits) : undefined,
      top_provider: model.top_provider ? sanitizeForIpc(model.top_provider) : undefined,
      _raw: (model as any)._raw ? sanitizeForIpc((model as any)._raw) : undefined
    }
    
    const pricing = model.pricing ? sanitizeForIpc(model.pricing) : undefined
    
    return {
      id: modelId,
      provider: extractProvider(modelId),
      name: model.name || modelId,
      description: model.description,
      contextLength: model.context_length,
      pricing: pricing && typeof pricing === 'object' && pricing !== null ? (pricing as Record<string, unknown>) : undefined,
      meta: cleanMeta
    }
  })
  
  console.log('[modelDataClient] 📤 准备发送到 Worker', {
    inputsCount: inputs.length,
    sampleInput: inputs[0]
  })

  await query('model.saveMany', { models: inputs })
  
  console.log('[modelDataClient] ✅ 模型保存成功')
}

/**
 * 替换指定提供商的所有模型
 */
export async function replaceModelsByProvider(provider: string, models: ModelData[]): Promise<void> {
  // 🧹 清理数据
  const cleanedModels = sanitizeForIpc(models) as ModelData[]
  
  const inputs: SaveModelDataInput[] = cleanedModels.map(model => {
    // 确保 id 是字符串类型
    const modelId = String(model.id)
    
    // 清理 meta 数据
    const cleanMeta = {
      architecture: model.architecture ? sanitizeForIpc(model.architecture) : undefined,
      modality: model.modality ? sanitizeForIpc(model.modality) : undefined,
      per_request_limits: model.per_request_limits ? sanitizeForIpc(model.per_request_limits) : undefined,
      top_provider: model.top_provider ? sanitizeForIpc(model.top_provider) : undefined,
      _raw: (model as any)._raw ? sanitizeForIpc((model as any)._raw) : undefined
    }
    
    const pricing = model.pricing ? sanitizeForIpc(model.pricing) : undefined
    
    return {
      id: modelId,
      provider: extractProvider(modelId),
      name: model.name || modelId,
      description: model.description,
      contextLength: model.context_length,
      pricing: pricing && typeof pricing === 'object' && pricing !== null ? (pricing as Record<string, unknown>) : undefined,
      meta: cleanMeta
    }
  })

  await query('model.replaceByProvider', { provider, models: inputs })
}

/**
 * 获取所有模型
 */
export async function getAllModels(): Promise<ModelData[]> {
  const records = await query('model.getAll', {}) as ModelDataRecord[]
  return records.map(recordToModelData)
}

/**
 * 根据提供商获取模型列表
 */
export async function getModelsByProvider(provider: string): Promise<ModelData[]> {
  const records = await query('model.getByProvider', { provider }) as ModelDataRecord[]
  return records.map(recordToModelData)
}

/**
 * 根据 ID 获取单个模型
 */
export async function getModelById(modelId: string): Promise<ModelData | null> {
  const record = await query('model.getById', { modelId }) as ModelDataRecord | null
  return record ? recordToModelData(record) : null
}

/**
 * 清空所有模型数据
 */
export async function clearAllModels(): Promise<void> {
  await query('model.clear', {})
}

// ========== 辅助函数 ==========

/**
 * 从模型 ID 提取提供商名称
 */
function extractProvider(modelId: string): string {
  // 类型安全检查：确保 modelId 是字符串
  if (typeof modelId !== 'string') {
    console.error('extractProvider: modelId 不是字符串类型:', typeof modelId, modelId)
    return 'unknown'
  }
  
  // 例如 "openrouter/anthropic/claude-3" -> "openrouter"
  const parts = modelId.split('/')
  return parts[0] || 'unknown'
}

/**
 * 将数据库记录转换为 ModelData
 */
function recordToModelData(record: ModelDataRecord): ModelData {
  const meta = record.meta || {}
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    context_length: record.contextLength,
    pricing: record.pricing as any,
    architecture: meta.architecture as any,
    modality: meta.modality as any,
    per_request_limits: meta.per_request_limits as any,
    top_provider: meta.top_provider as any,
    _raw: meta._raw
  }
}
