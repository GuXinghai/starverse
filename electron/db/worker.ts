import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { DbWorkerRuntime, attachWorkerPort } from '../../infra/db/worker'
import type { WorkerInitConfig } from '../../infra/db/types'

if (isMainThread) {
  throw new Error('electron/db/worker.ts must run inside a worker thread')
}

if (!parentPort) {
  throw new Error('parentPort is not available in DB worker')
}

const runtime = new DbWorkerRuntime((workerData ?? {}) as WorkerInitConfig)
attachWorkerPort(runtime, parentPort)
