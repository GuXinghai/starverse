import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const electronState = vi.hoisted(() => ({
  isPackaged: false,
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return electronState.isPackaged
    },
  },
}))

import { DbWorkerManager } from './workerManager'

describe('DbWorkerManager.reset dev-only gate', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    electronState.isPackaged = false
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    vi.restoreAllMocks()
  })

  it('rejects production environment before deleting any database files', async () => {
    process.env.NODE_ENV = 'production'
    const manager = new DbWorkerManager({ workerScriptPath: 'worker.cjs' } as any)

    await expect(manager.reset()).rejects.toMatchObject({
      code: 'ERR_FORBIDDEN',
      message: 'db.reset is forbidden in production environment',
    })
  })

  it('rejects packaged apps without swallowing the packaged guard', async () => {
    electronState.isPackaged = true
    const manager = new DbWorkerManager({ workerScriptPath: 'worker.cjs' } as any)

    await expect(manager.reset()).rejects.toMatchObject({
      code: 'ERR_FORBIDDEN',
      message: 'db.reset is forbidden in packaged app',
    })
  })

  it('allows the explicit dev-only reset path when unpackaged and development', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'starverse-db-reset-'))
    const dbPath = path.join(tempDir, 'chat.db')
    await writeFile(dbPath, 'db')
    await writeFile(`${dbPath}-wal`, 'wal')

    const manager = new DbWorkerManager({ workerScriptPath: 'worker.cjs' } as any)
    ;(manager as any).dbPath = dbPath
    ;(manager as any).stop = vi.fn(async () => {})
    ;(manager as any).start = vi.fn(async () => {})

    try {
      await expect(manager.reset()).resolves.toEqual({ ok: true })
      expect(existsSync(dbPath)).toBe(false)
      expect(existsSync(`${dbPath}-wal`)).toBe(false)
      expect((manager as any).stop).toHaveBeenCalledTimes(1)
      expect((manager as any).start).toHaveBeenCalledWith(dbPath, {
        stampSchemaVersion: true,
        startupRebuildReason: 'manual_reset',
      })
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
