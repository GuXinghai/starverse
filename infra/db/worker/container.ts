import type { DbMethod } from '../dbMethodsRegistry'
import { DB_WORKER_METHODS, assertDbMethodCoverage } from '../dbMethodsRegistry'
import type { DbHandler } from '../types'
import { registerProjectHandlers } from './handlers/projectHandlers'
import { registerConvoMessageHandlers } from './handlers/convoMessageHandlers'
import { registerBranchContextHandlers } from './handlers/branchContextHandlers'
import { registerFilePipelineHandlers } from './handlers/filePipelineHandlers'
import { registerSearchMaintenanceHandlers } from './handlers/searchMaintenanceHandlers'
import { registerUsagePrefsSettingsHandlers } from './handlers/usagePrefsSettingsHandlers'
import type { DbWorkerRuntime } from './runtime'

export type WorkerHandlerContainer = Readonly<{
  handlers: ReadonlyMap<DbMethod, DbHandler>
}>

export function createWorkerHandlerContainer(runtime: DbWorkerRuntime): WorkerHandlerContainer {
  const handlers = new Map<DbMethod, DbHandler>()
  const register = (method: DbMethod, handler: DbHandler) => {
    handlers.set(method, handler)
  }

  registerProjectHandlers(register, runtime)
  registerConvoMessageHandlers(register, runtime)
  registerFilePipelineHandlers(register, runtime)
  registerBranchContextHandlers(register, runtime)
  registerSearchMaintenanceHandlers(register, runtime)
  registerUsagePrefsSettingsHandlers(register, runtime)

  assertDbMethodCoverage(
    'DbWorkerRuntime.registerHandlers',
    DB_WORKER_METHODS,
    handlers.keys()
  )

  return { handlers }
}
