import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

let slowQueryThreshold = 50
let logDirectory: string | null = null

export const configureLogging = (options: { slowQueryMs?: number; directory?: string }) => {
  if (typeof options.slowQueryMs === 'number') {
    slowQueryThreshold = options.slowQueryMs
  }
  if (options.directory) {
    logDirectory = options.directory
    mkdirSync(logDirectory, { recursive: true })
  }
}

export const logSlowQuery = (sql: string, ms: number) => {
  if (!logDirectory || ms < slowQueryThreshold) return
  const line = `${new Date().toISOString()} ${ms.toFixed(2)}ms ${sql}\n`
  appendFileSync(path.join(logDirectory, 'sqlite-slow.log'), line, { encoding: 'utf8' })
}

export const logMessage = (level: LogLevel, scope: string, message: string, extra?: Record<string, unknown>) => {
  const payload = {
    ts: new Date().toISOString(),
    level,
    scope,
    message,
    ...extra
  }
  console[level === 'error' ? 'error' : 'log'](`[db:${scope}]`, JSON.stringify(payload))
}

export const getSlowQueryThreshold = () => slowQueryThreshold
