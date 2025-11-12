import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  DbMethod,
  WorkerRequestMessage,
  WorkerResponseMessage,
  DbErrorCode
} from '../../infra/db/types'
import { DbWorkerError } from '../../infra/db/errors'

type PendingCall = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

type ManagerOptions = {
  workerScriptPath: string
  schemaPath?: string
  logSlowQueryMs?: number
}

export class DbWorkerManager {
  private worker?: Worker
  private startPromise?: Promise<void>
  private pending = new Map<string, PendingCall>()
  private dbPath?: string

  constructor(private options: ManagerOptions) {}

  async start(dbPath: string) {
    if (this.worker) return
    if (!this.startPromise) {
      this.startPromise = new Promise((resolve, reject) => {
        try {
          const scriptPath = path.resolve(this.options.workerScriptPath)
          const worker = new Worker(scriptPath, {
            workerData: {
              dbPath,
              schemaPath: this.options.schemaPath,
              logSlowQueryMs: this.options.logSlowQueryMs
            }
          })
          this.dbPath = dbPath
          this.worker = worker

          const cleanupStart = (error?: Error) => {
            worker.removeAllListeners('online')
            worker.removeAllListeners('error')
            worker.removeAllListeners('exit')
            if (error) {
              reject(error)
            } else {
              resolve()
            }
          }

          worker.once('online', () => cleanupStart())
          worker.once('error', (error) => {
            cleanupStart(error as Error)
            this.rejectAll(error)
            this.worker = undefined
            this.startPromise = undefined
          })
          worker.on('message', (message: WorkerResponseMessage) => this.handleMessage(message))
          worker.on('exit', (code) => {
            if (code !== 0) {
              const error = new Error(`DB worker exited with code ${code}`)
              this.rejectAll(error)
            }
            this.worker = undefined
            this.startPromise = undefined
          })
        } catch (error) {
          this.startPromise = undefined
          reject(error)
        }
      })
    }
    await this.startPromise
  }

  async stop() {
    if (!this.worker) return
    await this.worker.terminate()
    this.worker = undefined
    this.startPromise = undefined
    this.pending.clear()
  }

  async call(method: DbMethod, params?: unknown) {
    if (!this.worker) {
      throw new DbWorkerError('ERR_UNAVAILABLE', 'DB worker not initialized')
    }
    const id = randomUUID()
    const payload: WorkerRequestMessage = { id, method, params }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage(payload)
    })
  }

  getDatabasePath() {
    return this.dbPath
  }

  private handleMessage(message: WorkerResponseMessage) {
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)

    if (message.ok) {
      pending.resolve(message.result)
      return
    }

    const errorCode = (message.error?.code as DbErrorCode | undefined) ?? 'ERR_INTERNAL'
    const error = new DbWorkerError(errorCode, message.error?.message ?? 'DB worker error', message.error?.details)
    pending.reject(error)
  }

  private rejectAll(error: unknown) {
    for (const pending of this.pending.values()) {
      pending.reject(error)
    }
    this.pending.clear()
  }
}
