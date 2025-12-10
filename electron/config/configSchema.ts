/**
 * configSchema.ts - 应用配置 Schema 定义
 * 
 * 职责：
 * - 定义允许的配置字段白名单
 * - 配置版本管理和迁移逻辑
 * - 配置验证和清理规则
 * 
 * 设计原则：
 * - 配置文件仅存储轻量级偏好设置和 API Keys
 * - 大数据（模型列表、会话内容）必须存储在 SQLite 或独立缓存文件
 * - 配置体积正常应该 < 200 KB
 */

// ============================================================================
// SECTION 1: 配置版本定义
// ============================================================================

/**
 * 当前配置版本
 * 
 * 版本更新规则：
 * - 添加新字段：不需要升级版本（向后兼容）
 * - 重命名字段：需要升级版本并添加迁移逻辑
 * - 删除字段：需要升级版本并添加清理逻辑
 * - 修改字段类型：需要升级版本并添加转换逻辑
 */
export const CURRENT_CONFIG_VERSION = 2

/**
 * 配置版本历史
 * 
 * v1 (2024-12 之前): 
 *   - 无版本号标识
 *   - 可能包含 conversations-meta 等大字段
 *   - 使用 apiKey 字段（单一 provider）
 * 
 * v2 (2024-12 起):
 *   - 添加 configVersion 字段
 *   - 移除 conversations-meta、modelCapabilities 等大字段
 *   - 使用 geminiApiKey / openRouterApiKey（多 provider）
 *   - 添加字段白名单验证
 */

// ============================================================================
// SECTION 2: 配置字段白名单
// ============================================================================

/**
 * 允许的配置字段白名单
 * 
 * 分类说明：
 * - API Keys: 敏感凭证，加密存储
 * - Provider & Model: 提供商和模型选择配置
 * - User Preferences: 用户 UI/行为偏好
 * - Window State: 窗口位置和大小
 * - Project Management: 项目元数据（仅 ID 和基础信息，不含内容）
 * - Model Configs: 模型参数配置（仅元数据，不含完整模型列表）
 * 
 * ⚠️ 禁止添加的字段类型：
 * - 模型列表（使用 SQLite 或独立缓存）
 * - 会话内容（使用 SQLite）
 * - API 响应缓存（使用独立缓存文件）
 * - 任何可能超过 100 KB 的数据
 */
export const ALLOWED_CONFIG_KEYS = new Set([
  // ========== 元数据 ==========
  'configVersion',        // 配置版本号
  
  // ========== API Keys ==========
  'geminiApiKey',         // Google Gemini API Key
  'openRouterApiKey',     // OpenRouter API Key
  'openRouterBaseUrl',    // OpenRouter Base URL（自定义端点）
  'apiKey',               // 向后兼容：旧版 API Key 字段
  
  // ========== Provider & Model ==========
  'activeProvider',       // 当前激活的 AI Provider ('Gemini' | 'OpenRouter')
  'defaultModel',         // 默认模型 ID（用于新对话）
  
  // ========== User Preferences ==========
  'theme',                // 主题设置 ('light' | 'dark' | 'auto')
  'language',             // 界面语言 ('zh-CN' | 'en-US')
  'fontSize',             // 字体大小
  'webSearchEngine',      // Web 搜索引擎 ('native' | 'exa' | 'undefined')
  'webSearchLevel',       // Web 搜索级别（详细程度）
  'webSearchEnabled',     // 是否启用 Web 搜索
  'lastUsedPdfEngine',    // 最后使用的 PDF 引擎 ('pdf-text' | 'mistral-ocr' | 'native')
  'sendDelayMs',          // 消息发送延时（毫秒）
  'sendTimeoutMs',        // 超时保护定时器（毫秒，0 为禁用）
  'autoScrollToBottom',   // 是否自动滚动到底部
  'showTimestamps',       // 是否显示时间戳
  'enableNotifications',  // 是否启用通知
  
  // ========== Window State ==========
  'windowBounds',         // 窗口位置和大小 { x, y, width, height }
  'windowMaximized',      // 窗口是否最大化
  'sidebarWidth',         // 侧边栏宽度
  'sidebarCollapsed',     // 侧边栏是否折叠
  
  // ========== Project Management ==========
  'projects',             // 项目列表（仅基础元数据：id, name, color）
  'activeProjectId',      // 当前激活的项目 ID
  'recentProjectIds',     // 最近访问的项目 ID 列表（最多 10 个）
  
  // ========== Model Configs ==========
  'favoriteModels',       // 收藏的模型 ID 列表（仅 ID，不含完整模型数据）
  'modelConfigs',         // 全局模型参数配置 { [modelId]: { temperature, ... } }
  'conversationModelConfigs', // 对话级别模型配置 { [convoId]: { modelId, ... } }
  
  // ========== Analytics & Debug ==========
  'analyticsEnabled',     // 是否启用匿名统计
  'debugMode',            // 是否启用调试模式
  'devToolsOpen',         // 开发者工具是否打开（开发环境）
])

/**
 * 已知的遗留大字段列表
 * 
 * 这些字段在旧版本中可能存在，需要在启动时自动清理
 * 
 * 历史原因：
 * - conversations-meta: 旧版本误将会话列表存入 config（应该在 SQLite）
 * - modelCapabilities: 旧版本缓存模型能力表（应该在独立缓存文件）
 * - modelsCache: 旧版本缓存 /models API 响应（应该在独立缓存文件）
 * - modelsList: 旧版本完整模型列表（应该从 API 动态获取）
 * - analyticsCache: 旧版本统计数据缓存（应该在独立文件）
 * - conversationsList: 旧版本会话列表（应该从 SQLite 读取）
 */
export const LEGACY_LARGE_FIELDS = [
  'conversations-meta',
  'modelCapabilities',
  'modelsCache',
  'modelsList',
  'analyticsCache',
  'conversationsList',
] as const

// ============================================================================
// SECTION 3: 配置体积限制
// ============================================================================

/**
 * 配置体积阈值（字节）
 */
export const CONFIG_SIZE_LIMITS = {
  /** 单个字段大小警告阈值：100 KB */
  FIELD_WARN_SIZE: 100_000,
  
  /** 配置文件总大小警告阈值：200 KB */
  TOTAL_WARN_SIZE: 200_000,
  
  /** 配置文件总大小严重告警阈值：1 MB */
  TOTAL_ERROR_SIZE: 1_000_000,
} as const

// ============================================================================
// SECTION 4: 配置迁移逻辑
// ============================================================================

/**
 * 配置迁移函数
 * 
 * 将旧版本配置迁移到当前版本
 * 
 * @param rawConfig - 原始配置对象（可能包含旧字段）
 * @returns 迁移后的配置对象（符合当前 schema）
 */
export function migrateConfig(rawConfig: Record<string, any>): Record<string, any> {
  const version = rawConfig.configVersion || 1
  let config = { ...rawConfig }
  
  // v1 → v2: 迁移 API Key 字段
  if (version < 2) {
    // 如果有旧的 apiKey 但没有 geminiApiKey，则迁移
    if (config.apiKey && !config.geminiApiKey) {
      config.geminiApiKey = config.apiKey
      console.log('[Config Migration] v1→v2: 迁移 apiKey → geminiApiKey')
    }
    
    // 移除所有已知的大字段
    for (const legacyField of LEGACY_LARGE_FIELDS) {
      if (config[legacyField]) {
        const fieldSize = JSON.stringify(config[legacyField]).length
        console.log(`[Config Migration] v1→v2: 移除遗留大字段 ${legacyField} (${(fieldSize / 1024).toFixed(2)} KB)`)
        delete config[legacyField]
      }
    }
    
    // 更新版本号
    config.configVersion = 2
  }
  
  // 未来版本迁移逻辑在此添加
  // if (version < 3) { ... }
  
  return config
}

/**
 * 验证并清理配置对象
 * 
 * 移除所有不在白名单中的字段
 * 
 * @param config - 配置对象
 * @returns { cleaned: 清理后的配置, removed: 被移除的字段列表 }
 */
export function validateAndCleanConfig(config: Record<string, any>): {
  cleaned: Record<string, any>
  removed: Array<{ key: string; size: number }>
} {
  const cleaned: Record<string, any> = {}
  const removed: Array<{ key: string; size: number }> = []
  
  for (const [configKey, value] of Object.entries(config)) {
    if (ALLOWED_CONFIG_KEYS.has(configKey)) {
      cleaned[configKey] = value
    } else {
      const size = JSON.stringify(value).length
      removed.push({ key: configKey, size })
    }
  }
  
  return { cleaned, removed }
}

/**
 * 检查字段大小是否超过阈值
 * 
 * 作为配置写入的守门员，执行以下检查：
 * 1. 序列化字段值并计算大小
 * 2. 与阈值比较并输出相应级别的日志
 * 3. 返回检查结果供调用方决定是否拦截
 * 
 * @param key - 字段名（用于日志输出和未来的字段级规则）
 * @param value - 字段值
 * @param isDev - 是否为开发环境（影响日志详细程度）
 * @returns { ok: 是否通过检查, size: 字段大小, level: 警告级别 }
 */
export function checkFieldSize(
  key: string, 
  value: any,
  isDev = false
): {
  ok: boolean
  size: number
  level: 'ok' | 'warn' | 'error'
} {
  try {
    const size = JSON.stringify(value).length
    
    // 严重超标：> 100 KB
    if (size > CONFIG_SIZE_LIMITS.FIELD_WARN_SIZE) {
      console.error(`[Config] ❌ 字段 "${key}" 过大: ${(size / 1024).toFixed(2)} KB (限制: ${(CONFIG_SIZE_LIMITS.FIELD_WARN_SIZE / 1024).toFixed(0)} KB)`)
      console.error('[Config] 大数据应存储到 SQLite 或独立缓存文件')
      return { ok: false, size, level: 'error' }
    }
    
    // 开发环境：10 KB 以上就提示
    if (size > 10_000 && isDev) {
      console.warn(`[Config] ⚠️ 字段 "${key}" 较大: ${(size / 1024).toFixed(2)} KB`)
      console.warn('[Config] 考虑是否应该使用其他存储方式')
      return { ok: true, size, level: 'warn' }
    }
    
    // 正常大小
    return { ok: true, size, level: 'ok' }
    
  } catch (error) {
    // JSON 序列化失败（循环引用、特殊对象等）
    console.error(`[Config] ❌ 无法序列化字段 "${key}":`, error)
    console.error('[Config] 该值可能包含循环引用或不可序列化的对象')
    return { ok: false, size: 0, level: 'error' }
  }
}

/**
 * 检查配置总体积
 * 
 * @param config - 配置对象
 * @returns { size: 总大小, level: 警告级别, topFields: 最大的字段列表 }
 */
export function checkTotalSize(config: Record<string, any>): {
  size: number
  level: 'ok' | 'warn' | 'error'
  topFields: Array<{ key: string; size: number }>
} {
  const size = JSON.stringify(config).length
  
  let level: 'ok' | 'warn' | 'error' = 'ok'
  if (size > CONFIG_SIZE_LIMITS.TOTAL_ERROR_SIZE) {
    level = 'error'
  } else if (size > CONFIG_SIZE_LIMITS.TOTAL_WARN_SIZE) {
    level = 'warn'
  }
  
  // 计算最大的 5 个字段
  const topFields = Object.entries(config)
    .map(([key, value]) => ({
      key,
      size: JSON.stringify(value).length
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
  
  return { size, level, topFields }
}

// ============================================================================
// SECTION 5: 安全的配置管理函数
// ============================================================================

/**
 * 安全地清空配置
 * 
 * ⚠️ 重要：永远不要直接操作配置文件，而应使用此函数
 * 
 * 使用场景：
 * - 配置文件体积过大需要重置
 * - 调试时需要清除所有设置
 * - 用户请求恢复默认设置
 * 
 * 安全保证：
 * - 使用 Store API 而非文件系统操作
 * - 自动备份旧配置
 * - 保证配置文件始终是合法 JSON
 * 
 * @param store - electron-store 实例
 * @param keepKeys - 需要保留的字段（例如 API Keys）
 * @returns 备份文件路径
 * 
 * @example
 * ```ts
 * // 清空所有配置
 * safeClearConfig(store)
 * 
 * // 清空配置但保留 API Keys
 * safeClearConfig(store, ['geminiApiKey', 'openRouterApiKey'])
 * ```
 */
export function safeClearConfig(
  store: any,  // electron-store 实例
  keepKeys: string[] = []
): string | null {
  try {
    const currentConfig = store.store as Record<string, any>
    
    // 1. 备份当前配置
    const backupPath = backupConfig(store)
    
    console.log('[Config] 开始安全清空配置...')
    console.log(`[Config] 备份文件: ${backupPath}`)
    
    // 2. 保存需要保留的字段
    const preserved: Record<string, any> = {}
    for (const key of keepKeys) {
      if (currentConfig[key] !== undefined) {
        preserved[key] = currentConfig[key]
      }
    }
    
    // 3. 使用 Store.clear() 清空（这会将文件内容重置为 {}）
    store.clear()
    
    // 4. 恢复需要保留的字段
    for (const [key, value] of Object.entries(preserved)) {
      store.set(key, value)
    }
    
    // 5. 确保有版本号
    if (!store.has('configVersion')) {
      store.set('configVersion', CURRENT_CONFIG_VERSION)
    }
    
    console.log('[Config] ✅ 配置已安全清空')
    if (keepKeys.length > 0) {
      console.log(`[Config] 保留的字段: ${keepKeys.join(', ')}`)
    }
    
    return backupPath
    
  } catch (error) {
    console.error('[Config] 清空配置失败:', error)
    return null
  }
}

/**
 * 备份当前配置
 * 
 * @param store - electron-store 实例
 * @returns 备份文件路径
 */
export function backupConfig(store: any): string {
  const currentConfig = store.store as Record<string, any>
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = store.path.replace('.json', `.backup.${timestamp}.json`)
  
  // 同步写入备份（确保在清空前完成）
  const fs = require('fs')
  fs.writeFileSync(backupPath, JSON.stringify(currentConfig, null, 2), 'utf-8')
  
  return backupPath
}

/**
 * 检查配置文件完整性
 * 
 * 在启动时调用，检查配置文件是否可读且格式正确
 * 
 * @param store - electron-store 实例
 * @returns { ok: 是否正常, reason: 异常原因 }
 */
export function checkConfigIntegrity(store: any): {
  ok: boolean
  reason?: string
} {
  try {
    const config = store.store as Record<string, any>
    
    // 检查是否为空对象（可能是文件损坏后的重置）
    if (Object.keys(config).length === 0) {
      return {
        ok: false,
        reason: 'Config file is empty (possibly reset after corruption)'
      }
    }
    
    // 检查版本号
    if (!config.configVersion) {
      return {
        ok: false,
        reason: 'Missing configVersion field'
      }
    }
    
    // 检查是否有非法字段
    const illegalKeys = Object.keys(config).filter(key => !ALLOWED_CONFIG_KEYS.has(key))
    if (illegalKeys.length > 0) {
      return {
        ok: false,
        reason: `Found illegal keys: ${illegalKeys.join(', ')}`
      }
    }
    
    return { ok: true }
    
  } catch (error) {
    return {
      ok: false,
      reason: `Error reading config: ${error}`
    }
  }
}
