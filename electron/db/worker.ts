import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { DbWorkerRuntime, attachWorkerPort } from '../../infra/db/worker'
import type { WorkerInitConfig } from '../../infra/db/types'
import { createWorkerThreadElectronConversionBridge } from '../../infra/files/electronConversionBridge'
import { runExternalProcess } from '../../src/next/file-type/externalProcessRunner'

console.log('[worker] Worker 线程启动')
console.log('[worker] isMainThread:', isMainThread)
console.log('[worker] workerData:', workerData)

if (isMainThread) {
  throw new Error('electron/db/worker.ts must run inside a worker thread')
}

if (!parentPort) {
  throw new Error('parentPort is not available in DB worker')
}

let runtime: DbWorkerRuntime | null = null

/**
 * 注册 shutdown 监听，确保 timer 清理
 * 
 * 监听事件：
 * - parentPort.on('close'): 主进程关闭 MessagePort
 * - process.on('exit'): 进程退出（同步，不能做异步操作）
 * - process.on('SIGINT'/'SIGTERM'): 信号中断（worker 线程可能收不到，但保留以防万一）
 */
function registerShutdownHooks(rt: DbWorkerRuntime) {
  const doShutdown = (source: string) => {
    if (!rt) return
    const timerCount = (rt as any).activityThrottle?.size ?? 0
    rt.shutdown()
    console.log(`[worker] shutdown cleaned ${timerCount} timers (source: ${source})`)
  }

  // parentPort close 是最可靠的 worker 退出信号
  parentPort!.on('close', () => doShutdown('parentPort.close'))

  // process.on('exit') 在 worker 线程中也会触发，但是同步的
  process.on('exit', () => doShutdown('process.exit'))

  // SIGINT/SIGTERM 在 worker 线程中通常不会触发，但保留以兼容未来场景
  process.on('SIGINT', () => doShutdown('SIGINT'))
  process.on('SIGTERM', () => doShutdown('SIGTERM'))
}

try {
  console.log('[worker] 初始化 DbWorkerRuntime...')
  runtime = new DbWorkerRuntime({
    ...((workerData ?? {}) as WorkerInitConfig),
    electronConversionBridge: createWorkerThreadElectronConversionBridge(parentPort),
    officePdfProcessRunner: runExternalProcess,
  })
  console.log('[worker] DbWorkerRuntime 初始化成功')
  console.log('[worker] 🔍 测试: Worker 日志输出正常')
  
  // 注册 shutdown hooks
  registerShutdownHooks(runtime)
  
  attachWorkerPort(runtime, parentPort)
  console.log('[worker] Worker 已就绪')
} catch (error) {
  console.error('[worker] 初始化失败:', error)
  console.error('[worker] 错误堆栈:', (error as Error)?.stack)
  throw error
}
