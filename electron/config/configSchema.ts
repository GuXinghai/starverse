import { isProviderCredentialSecureStoreKey } from '../credentials/providerCredentialService'

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
  'openAIResponsesApiKey', // Experimental OpenAI Responses API Key（main-process only）
  'googleAIStudioApiKey', // Experimental Google AI Studio API Key（main-process only）
  'anthropicApiKey',      // Experimental Anthropic Messages API Key（main-process only）
  'deepSeekApiKey',       // Experimental DeepSeek official API Key（main-process only）
  'openRouterBaseUrl',    // OpenRouter Base URL（自定义端点）
  'openRouterCatalogLocalSecret', // Internal: OpenRouter catalog scope HMAC secret（禁止 renderer 读取）
  'providerCatalogLocalSecret', // Internal: provider catalog scope HMAC secret（禁止 renderer 读取）
  'openRouterCatalogStartupSyncPolicy', // OpenRouter 模型目录启动同步策略
  'openRouterCatalogPickerOpenSyncPolicy', // OpenRouter 模型选择器打开同步策略
  'openRouterCatalogListUpdateMode', // OpenRouter 模型目录列表更新应用方式
  'openRouterCatalogFreshnessMs', // OpenRouter 模型目录新鲜度
  'openRouterCatalogRetentionMs', // OpenRouter 模型目录缓存保留期
  'openRouterDeprecatedCatalogCacheClearedAtMs', // Internal: deprecated OpenRouter catalog cleanup marker
  'googleAIStudioCatalogStartupSyncPolicy', // Google AI Studio 模型目录启动同步策略
  'googleAIStudioCatalogPickerOpenSyncPolicy', // Google AI Studio 模型选择器打开同步策略
  'googleAIStudioCatalogListUpdateMode', // Google AI Studio 模型目录列表更新应用方式
  'googleAIStudioCatalogFreshnessMs', // Google AI Studio 模型目录新鲜度
  'googleAIStudioCatalogRetentionMs', // Google AI Studio 模型目录缓存保留期
  'anthropicCatalogStartupSyncPolicy', // Anthropic 模型目录启动同步策略
  'anthropicCatalogPickerOpenSyncPolicy', // Anthropic 模型选择器打开同步策略
  'anthropicCatalogListUpdateMode', // Anthropic 模型目录列表更新应用方式
  'anthropicCatalogFreshnessMs', // Anthropic 模型目录新鲜度
  'anthropicCatalogRetentionMs', // Anthropic 模型目录缓存保留期
  'openAIResponsesCatalogStartupSyncPolicy', // OpenAI Responses 模型目录启动同步策略
  'openAIResponsesCatalogPickerOpenSyncPolicy', // OpenAI Responses 模型选择器打开同步策略
  'openAIResponsesCatalogListUpdateMode', // OpenAI Responses 模型目录列表更新应用方式
  'openAIResponsesCatalogFreshnessMs', // OpenAI Responses 模型目录新鲜度
  'openAIResponsesCatalogRetentionMs', // OpenAI Responses 模型目录缓存保留期
  'deepSeekCatalogStartupSyncPolicy', // DeepSeek 模型目录启动同步策略
  'deepSeekCatalogPickerOpenSyncPolicy', // DeepSeek 模型选择器打开同步策略
  'deepSeekCatalogListUpdateMode', // DeepSeek 模型目录列表更新应用方式
  'deepSeekCatalogFreshnessMs', // DeepSeek 模型目录新鲜度
  'deepSeekCatalogRetentionMs', // DeepSeek 模型目录缓存保留期
  'apiKey',               // 向后兼容：旧版 API Key 字段
  
  // ========== Provider & Model ==========
  'activeProvider',       // 当前激活的 AI Provider ('Gemini' | 'OpenRouter')
  'defaultModel',         // 默认模型 ID（用于新对话）
  
  // ========== User Preferences ==========
  'theme',                // 主题设置 ('light' | 'dark' | 'auto')
  'language',             // 界面语言 ('zh-CN' | 'en-US' | 'system')
  'languageManual',       // 手动选择的语言（仅 manual 模式有意义）
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
  'maxRecentModels',      // Model Picker 最近使用模型数量上限（正整数）

  // ========== Network Experiments ==========
  'netExp',               // 网络实验开关（HTTP2/QUIC/KeepAlive 等）
  'netExp.disableHttp2',
  'netExp.disableQuic',
  'netExp.streamInMainProcess',
  'netExp.forceHttp1',
  'netExp.tcpKeepAliveEnable',
  'netExp.tcpKeepAliveIdleMs',

  // ========== Database Dev Rebuild (dev-only) ==========
  'dbExp',                           // DB 开发态实验开关（破坏性重建）
  'dbExp.forceRebuildOnNextLaunch', // 下次启动强制删库重建（一次性）
  'dbExp.rebuildOnSchemaMismatch',  // schema_version 不匹配时自动重建
  
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

function isAllowedConfigKey(key: string): boolean {
  return ALLOWED_CONFIG_KEYS.has(key) ||
    key === 'providerCredentials' ||
    isProviderCredentialSecureStoreKey(key)
}

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
  MAX_TOTAL_SIZE: 200 * 1024,      // 200 KB 总大小限制
  WARN_SIZE: 100 * 1024,           // 100 KB 警告阈值
  MAX_FIELD_SIZE: 50 * 1024,       // 单字段 50 KB 限制
} as const
