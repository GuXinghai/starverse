/* eslint-disable max-lines-per-function, max-statements, complexity, max-depth */
import type { DbWorkerRuntime } from '../../worker'
import type { RegisterHandler } from './types'
import {
  FulltextQuerySchema,
  SearchQuerySchema,
} from '../../validation'
export function registerSearchMaintenanceHandlers(register: RegisterHandler, runtime: DbWorkerRuntime) {
  const rt = runtime as any

  register('search.fulltext', (raw) => {
      const input = FulltextQuerySchema.parse(raw)
      return rt.searchRepo.fulltext(input)
    })

  register('search.query', (raw) => {
      const input = SearchQuerySchema.parse(raw)
      return rt.searchRepo.query(input)
    })

  register('search.rebuildIndex', () => {
      const rebuildTxn = rt.db.transaction(() => {
        rt.searchRepo.rebuildIndex({
          loadProjects: () => rt.iterateProjectDocs(),
          loadConvos: () => rt.iterateConvoDocs(),
          loadMessages: () => rt.iterateFinalMessageDocs(),
        })
      })

      rebuildTxn()
      return { ok: true }
    })

  register('maintenance.optimize', () => {
      rt.searchRepo.optimize()
      return { ok: true }
    })

    // ========== Usage Handlers ==========

}



