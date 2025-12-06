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
  ModelData,
  ModelParameterSupport,
  DisplayMessage,
  ErrorInfo
} from './store'

// Electron API 类型扩展
// electron.d.ts 仅包含全局类型声明，无需导出
