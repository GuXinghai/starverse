import type Store from 'electron-store'
import type { DbMethod } from '../../infra/db/dbMethodsRegistry'
import type { CompatibleCredentialService } from '../credentials/compatibleCredentialService'

const DEPRECATED_CONFIG_KEYS = ['openRouterBaseUrl'] as const

type DbCaller = Readonly<{ call: (method: DbMethod, params?: unknown) => Promise<unknown> }>
type DbCensus = Readonly<{ schemaVersion: 1; legacyProviderKeys: readonly string[]; counts: Readonly<Record<string, number>>; ambiguous: Readonly<Record<string, number>>; retainedCredentialRefs: readonly string[] }>

export type CompatibleLegacyResetReport = Readonly<{
  schemaVersion: 1
  database: Readonly<{ counts: Readonly<Record<string, number>>; total: number }>
  ambiguous: Readonly<{ counts: Readonly<Record<string, number>>; total: number; destructiveAction: 'stopped' }>
  config: Readonly<{ deprecatedKeyCount: number }>
  secureStore: Readonly<{ orphanRefCount: number; cleanupFailed: number }>
}>

export type CompatibleLegacyResetService = Readonly<{
  preview: () => Promise<CompatibleLegacyResetReport>
  apply: (confirmation: 'delete_incompatible_compatible_state') => Promise<CompatibleLegacyResetReport>
}>

export function createCompatibleLegacyResetService(input: Readonly<{
  db: DbCaller
  store: Store
  credentials: CompatibleCredentialService
}>): CompatibleLegacyResetService {
  const inspect = async (): Promise<{ report: CompatibleLegacyResetReport; census: DbCensus; orphans: readonly string[] }> => {
    const census = await input.db.call('compatibleReset.census', {}) as DbCensus
    const retained = new Set(census.retainedCredentialRefs)
    const orphans = input.credentials.listRefsForMain().filter((ref) => !retained.has(ref))
    const deprecatedKeyCount = DEPRECATED_CONFIG_KEYS.filter((key) => input.store.get(key) !== undefined).length
    const total = Object.values(census.counts).reduce((sum, value) => sum + value, 0)
    const ambiguousTotal = Object.values(census.ambiguous ?? {}).reduce((sum, value) => sum + value, 0)
    return {
      census,
      orphans,
      report: Object.freeze({
        schemaVersion: 1,
        database: Object.freeze({ counts: Object.freeze({ ...census.counts }), total }),
        ambiguous: Object.freeze({ counts: Object.freeze({ ...(census.ambiguous ?? {}) }), total: ambiguousTotal, destructiveAction: 'stopped' as const }),
        config: Object.freeze({ deprecatedKeyCount }),
        secureStore: Object.freeze({ orphanRefCount: orphans.length, cleanupFailed: 0 }),
      }),
    }
  }

  return Object.freeze({
    preview: async () => (await inspect()).report,
    apply: async (confirmation) => {
      if (confirmation !== 'delete_incompatible_compatible_state') throw new Error('compatible_reset_confirmation_required')
      await input.db.call('compatibleReset.execute', { confirm: confirmation })
      for (const key of DEPRECATED_CONFIG_KEYS) input.store.delete(key)
      const afterDb = await inspect()
      let cleanupFailed = 0
      for (const ref of afterDb.orphans) {
        try { input.credentials.delete(ref as never) } catch { cleanupFailed += 1 }
      }
      const final = await inspect()
      return Object.freeze({
        ...final.report,
        secureStore: Object.freeze({ ...final.report.secureStore, cleanupFailed }),
      })
    },
  })
}
