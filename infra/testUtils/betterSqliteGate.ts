import BetterSqlite3 from 'better-sqlite3'

const loggedSuites = new Set<string>()

function buildSkipReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const node = process.version
  const moduleVersion = process.versions.modules ?? 'unknown'
  return `better-sqlite3 unavailable: ${message} (node=${node}, modules=${moduleVersion})`
}

export function canOpenBetterSqliteForSuite(suiteName: string): boolean {
  try {
    const db = new BetterSqlite3(':memory:')
    db.close()
    return true
  } catch (err) {
    if (!loggedSuites.has(suiteName)) {
      loggedSuites.add(suiteName)
      console.warn(`[test-skip] better-sqlite3 unavailable for ${suiteName}: ${buildSkipReason(err)}`)
    }
    return false
  }
}
