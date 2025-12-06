import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { DbWorkerRuntime, attachWorkerPort } from '../../infra/db/worker'
import type { WorkerInitConfig } from '../../infra/db/types'

console.log('[worker] Worker 线程启动')
console.log('[worker] isMainThread:', isMainThread)
console.log('[worker] workerData:', workerData)

if (isMainThread) {
  throw new Error('electron/db/worker.ts must run inside a worker thread')
}

if (!parentPort) {
  throw new Error('parentPort is not available in DB worker')
}

try {
  console.log('[worker] 初始化 DbWorkerRuntime...')
  const runtime = new DbWorkerRuntime((workerData ?? {}) as WorkerInitConfig)
  console.log('[worker] DbWorkerRuntime 初始化成功')
  console.log('[worker] 🔍 测试: Worker 日志输出正常')
  attachWorkerPort(runtime, parentPort)
  console.log('[worker] Worker 已就绪')
} catch (error) {
  console.error('[worker] 初始化失败:', error)
  console.error('[worker] 错误堆栈:', (error as Error)?.stack)
  throw error
}
