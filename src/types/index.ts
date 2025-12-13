/**
 * 统一类型定义导出文件
 * 
 * 集中导出所有类型定义，方便其他模块引用
 */

// 聊天消息相关类型
export * from './chat'

// 对话相关类型
export * from './conversation'

// Store 模块共享类型
export type {
  Conversation,
  ConversationSnapshot,
  Project,
  ProjectMeta,
  ProjectOverview,
  ProjectHomepage,
  ProjectPromptTemplate,
  // ModelData - 已删除，使用 AppModel
  // ModelParameterSupport - 已删除，使用 AppModel.capabilities
  DisplayMessage,
  ErrorInfo
} from './store'

// AppModel 相关类型（新架构）
export type {
  AppModel,
  ModelCapabilities,
  ModelPricing,
  RouterSource
} from './appModel'

// Electron API 类型扩展
// electron.d.ts 仅包含全局类型声明，无需导出
