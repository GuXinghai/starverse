// 类型定义已弃用 - OpenRouterService 已迁移到 TypeScript
// 原 JS 文件已归档到: archived-services/OpenRouterService.js
// 使用新的 TS 文件: src/services/providers/OpenRouterService.ts

declare module '../../../archived-services/OpenRouterService.js' {
  import type { IAIProvider } from '../../src/services/IAIProvider'

  export const OpenRouterService: IAIProvider & {
    listAvailableModels(apiKey?: string, baseUrl?: string): Promise<any[]>
    streamChatResponse(
      apiKey: string | undefined,
      history: any[],
      modelName: string,
      userMessage: string,
      baseUrl?: string,
      options?: any
    ): AsyncGenerator<any, void, unknown>
  }
}
