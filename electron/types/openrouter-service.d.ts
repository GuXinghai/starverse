declare module '../../src/services/providers/OpenRouterService.js' {
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
