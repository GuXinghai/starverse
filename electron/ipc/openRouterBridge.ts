import { ipcMain, WebContents } from 'electron'
import { OpenRouterService } from '../../src/services/providers/OpenRouterService'
import type { HistoryMessage } from '../../src/types/providers'

type ActiveStream = {
  controller: AbortController
  sender: WebContents
}

const activeStreams = new Map<string, ActiveStream>()

const serializeError = (error: any) => {
  if (!error || typeof error !== 'object') {
    return { name: 'Error', message: String(error ?? 'Unknown error') }
  }

  return {
    name: error.name || 'Error',
    message: error.message || 'Unknown error',
    stack: error.stack,
    code: (error as any).code,
    status: (error as any).status,
    type: (error as any).type,
    param: (error as any).param,
    retryable: (error as any).retryable,
    openRouterError: (error as any).openRouterError,
    responseText: (error as any).responseText
  }
}

const safeSend = (sender: WebContents, channel: string, payload?: any) => {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload)
  }
}

export const registerOpenRouterBridge = () => {
  ipcMain.handle('openrouter:list-models', async (_event, request: { apiKey?: string; baseUrl?: string } = {}) => {
    const { apiKey = '', baseUrl = '' } = request
    return OpenRouterService.listAvailableModels(apiKey, baseUrl)
  })

  ipcMain.handle('openrouter:stream-chat', (event, payload: {
    requestId: string
    apiKey?: string
    baseUrl?: string
    history: HistoryMessage[]
    model: string
    userMessage: string
    options?: any
  }) => {
    const {
      requestId,
      apiKey,
      baseUrl,
      history,
      model,
      userMessage,
      options = {}
    } = payload || {}

    if (!requestId) {
      throw new Error('openrouter:stream-chat requires requestId')
    }

    const controller = new AbortController()
    activeStreams.set(requestId, {
      controller,
      sender: event.sender
    })

    const startStreaming = async () => {
      try {
        const stream = OpenRouterService.streamChatResponse(
          apiKey || '',
          history,
          model,
          userMessage,
          baseUrl || null,
          {
            ...options,
            signal: controller.signal
          }
        )

        for await (const chunk of stream) {
          safeSend(event.sender, `openrouter:chunk:${requestId}`, chunk)
        }

        safeSend(event.sender, `openrouter:end:${requestId}`)
      } catch (error) {
        safeSend(event.sender, `openrouter:error:${requestId}`, serializeError(error))
      } finally {
        activeStreams.delete(requestId)
      }
    }

    startStreaming().catch((error) => {
      safeSend(event.sender, `openrouter:error:${requestId}`, serializeError(error))
      activeStreams.delete(requestId)
    })
  })

  ipcMain.handle('openrouter:abort', (_event, requestId: string) => {
    const active = activeStreams.get(requestId)
    if (active) {
      active.controller.abort()
      activeStreams.delete(requestId)
    }
    return true
  })
}

export const cleanupActiveStreams = () => {
  for (const [requestId, active] of activeStreams.entries()) {
    try {
      active.controller.abort()
    } catch (error) {
      console.warn(`[openRouterBridge] failed to abort stream ${requestId}:`, error)
    }
  }
  activeStreams.clear()
}
