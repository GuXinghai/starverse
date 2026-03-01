import type { MessagePort } from 'node:worker_threads'
import type { DbMethod } from '../dbMethodsRegistry'
import { DbWorkerError, toErrorShape } from '../errors'
import type { DbHandler, WorkerRequestMessage, WorkerResponseMessage } from '../types'
import type { DbWorkerRuntime } from './runtime'

export type WorkerHandlerMap = ReadonlyMap<DbMethod, DbHandler>

export async function dispatchWorkerMessage(
  handlers: WorkerHandlerMap,
  message: WorkerRequestMessage
): Promise<WorkerResponseMessage> {
  try {
    const handler = handlers.get(message.method)
    if (!handler) {
      throw new DbWorkerError('ERR_NOT_FOUND', `Unknown method: ${message.method}`)
    }

    const result = await Promise.resolve(handler(message.params))
    return { id: message.id, ok: true, result }
  } catch (error) {
    return { id: message.id, ok: false, error: toErrorShape(error) }
  }
}

export const attachWorkerPort = (
  runtime: DbWorkerRuntime,
  port: MessagePort
) => {
  port.on('message', (message: WorkerRequestMessage) => {
    runtime
      .handleMessage(message)
      .then((response) => port.postMessage(response))
      .catch((error) => {
        const fallback: WorkerResponseMessage = {
          id: message.id,
          ok: false,
          error: toErrorShape(error),
        }
        port.postMessage(fallback)
      })
  })
}
