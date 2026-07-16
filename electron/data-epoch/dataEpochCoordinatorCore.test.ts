import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runEpoch2ResetThroughConfigReplacement } from './dataEpochCoordinatorCore'
import { readEpoch2ResetJournal } from './resetJournalStore'
import { resolveEpoch2WorkspaceLayout } from './rootManifest'
import { acquireWin32EpochRootLease } from './win32EpochRootLease'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []

function fixture(name: string) {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  return { layout, lease: acquireWin32EpochRootLease(layout) }
}

function configPath(layout: ReturnType<typeof resolveEpoch2WorkspaceLayout>) {
  return path.join(layout.productRoot, 'config.json')
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 reset coordinator core through config replacement', () => {
  windowsIt('prevalidates config before deleting any target or clearing session data', async () => {
    const { layout, lease } = fixture('starverse-coordinator-prevalidate')
    const legacyDb = path.join(layout.productRoot, 'chat.db')
    fs.writeFileSync(legacyDb, 'must-survive')
    fs.writeFileSync(configPath(layout), '{invalid')
    const clearDefaultSessionData = vi.fn(async () => {})
    try {
      await expect(runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })).rejects.toThrow('EPOCH2_CONFIG_INVALID')
      expect(fs.readFileSync(legacyDb, 'utf8')).toBe('must-survive')
      expect(clearDefaultSessionData).not.toHaveBeenCalled()
      expect(readEpoch2ResetJournal({ layout, lease })?.phase).toBe('prepared')
    } finally {
      lease.release()
    }
  })

  windowsIt('deletes the closed inventory, clears the default session and commits filtered config', async () => {
    const fixtureValue = fixture('starverse-coordinator-happy')
    const { layout } = fixtureValue
    let lease = fixtureValue.lease
    fs.writeFileSync(path.join(layout.productRoot, 'chat.db'), 'legacy')
    fs.mkdirSync(path.join(layout.productRoot, 'assets'))
    fs.writeFileSync(path.join(layout.productRoot, 'assets', 'legacy.txt'), 'legacy')
    fs.writeFileSync(
      path.join(layout.productRoot, 'config.backup.2026-07-17T12-34-56-789Z.json'),
      'backup',
    )
    fs.writeFileSync(configPath(layout), JSON.stringify({
      language: 'zh-CN',
      generationParams: { temperature: 1 },
      openRouterApiKey: 'plaintext-delete',
    }))
    const clearDefaultSessionData = vi.fn(async () => {})
    try {
      const result = await runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })
      expect(result.journal.phase).toBe('config_replaced')
      expect(result.deletedTargetCount).toBe(2)
      expect(result.deletedConfigBackupCount).toBe(1)
      expect(clearDefaultSessionData).toHaveBeenCalledTimes(1)
      expect(fs.existsSync(path.join(layout.productRoot, 'chat.db'))).toBe(false)
      expect(fs.existsSync(path.join(layout.productRoot, 'assets'))).toBe(false)
      expect(JSON.parse(fs.readFileSync(configPath(layout), 'utf8'))).toEqual({
        language: 'zh-CN',
      })

      const replay = await runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })
      expect(replay.journal.phase).toBe('config_replaced')
      expect(replay.deletedTargetCount).toBe(0)
      expect(clearDefaultSessionData).toHaveBeenCalledTimes(1)

      lease.release()
      fs.writeFileSync(path.join(layout.productRoot, 'chat.db'), 'recreated-after-cutover')
      fs.writeFileSync(configPath(layout), JSON.stringify({
        language: 'en-US',
        generationParams: { temperature: 2 },
      }))
      fs.writeFileSync(
        path.join(layout.productRoot, 'config.backup.2026-07-18T00-00-00-000Z.json'),
        'recreated-backup',
      )
      lease = acquireWin32EpochRootLease(layout)
      const nextStartup = await runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })
      expect(nextStartup.journal.phase).toBe('config_replaced')
      expect(nextStartup.deletedTargetCount).toBe(1)
      expect(nextStartup.deletedConfigBackupCount).toBe(1)
      expect(fs.existsSync(path.join(layout.productRoot, 'chat.db'))).toBe(false)
      expect(JSON.parse(fs.readFileSync(configPath(layout), 'utf8'))).toEqual({
        language: 'en-US',
      })
      expect(clearDefaultSessionData).toHaveBeenCalledTimes(1)
    } finally {
      lease.release()
    }
  })

  windowsIt('preflights the complete delete inventory before mutating an earlier target', async () => {
    const { layout, lease } = fixture('starverse-coordinator-delete-preflight')
    const legacyDb = path.join(layout.productRoot, 'chat.db')
    const outside = path.join(layout.appDataRoot, 'outside-assets')
    fs.writeFileSync(legacyDb, 'must-survive')
    fs.mkdirSync(outside)
    fs.symlinkSync(outside, path.join(layout.productRoot, 'assets'), 'junction')
    fs.writeFileSync(configPath(layout), '{}\n')
    const clearDefaultSessionData = vi.fn(async () => {})
    try {
      await expect(runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })).rejects.toThrow('EPOCH2_WIN32_DELETE_REPARSE_POINT')
      expect(fs.readFileSync(legacyDb, 'utf8')).toBe('must-survive')
      expect(fs.existsSync(outside)).toBe(true)
      expect(clearDefaultSessionData).not.toHaveBeenCalled()
      expect(readEpoch2ResetJournal({ layout, lease })?.phase).toBe('prepared')
    } finally {
      lease.release()
    }
  })

  windowsIt('preflights the complete config-backup namespace before deleting legacy targets', async () => {
    const { layout, lease } = fixture('starverse-coordinator-backup-preflight')
    const legacyDb = path.join(layout.productRoot, 'chat.db')
    const invalidBackup = path.join(layout.productRoot, 'config.backup.latest.json')
    fs.writeFileSync(legacyDb, 'must-survive')
    fs.writeFileSync(invalidBackup, 'must-survive')
    fs.writeFileSync(configPath(layout), '{}\n')
    const clearDefaultSessionData = vi.fn(async () => {})
    try {
      await expect(runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })).rejects.toThrow('EPOCH2_WIN32_CONFIG_BACKUP_NAME_INVALID')
      expect(fs.readFileSync(legacyDb, 'utf8')).toBe('must-survive')
      expect(fs.readFileSync(invalidBackup, 'utf8')).toBe('must-survive')
      expect(clearDefaultSessionData).not.toHaveBeenCalled()
      expect(readEpoch2ResetJournal({ layout, lease })?.phase).toBe('prepared')
    } finally {
      lease.release()
    }
  })

  windowsIt('retries from prepared after session clearing fails without replacing config', async () => {
    const { layout, lease } = fixture('starverse-coordinator-session-retry')
    const legacyDb = path.join(layout.productRoot, 'chat.db')
    const originalConfig = '{"language":"zh-CN","legacy":true}\n'
    fs.writeFileSync(legacyDb, 'legacy')
    fs.writeFileSync(configPath(layout), originalConfig)
    const clearDefaultSessionData = vi.fn()
      .mockRejectedValueOnce(new Error('SESSION_CLEAR_FAILED'))
      .mockResolvedValueOnce(undefined)
    try {
      await expect(runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })).rejects.toThrow('SESSION_CLEAR_FAILED')
      expect(fs.existsSync(legacyDb)).toBe(false)
      expect(fs.readFileSync(configPath(layout), 'utf8')).toBe(originalConfig)
      expect(readEpoch2ResetJournal({ layout, lease })?.phase).toBe('prepared')

      const recovered = await runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })
      expect(recovered.journal.phase).toBe('config_replaced')
      expect(clearDefaultSessionData).toHaveBeenCalledTimes(2)
      expect(JSON.parse(fs.readFileSync(configPath(layout), 'utf8'))).toEqual({
        language: 'zh-CN',
      })
    } finally {
      lease.release()
    }
  })

  windowsIt('removes a target recreated by session cleanup before advancing the journal', async () => {
    const { layout, lease } = fixture('starverse-coordinator-session-recreate')
    const legacyDb = path.join(layout.productRoot, 'chat.db')
    fs.writeFileSync(configPath(layout), '{}\n')
    const clearDefaultSessionData = vi.fn(async () => {
      fs.writeFileSync(legacyDb, 'recreated-during-session-clear')
    })
    try {
      const result = await runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })
      expect(result.journal.phase).toBe('config_replaced')
      expect(result.deletedTargetCount).toBe(1)
      expect(fs.existsSync(legacyDb)).toBe(false)
    } finally {
      lease.release()
    }
  })

  windowsIt('resumes from legacy-files-deleted after config CAS failure', async () => {
    const { layout, lease } = fixture('starverse-coordinator-config-retry')
    const originalConfig = '{"language":"zh-CN"}\n'
    const changedConfig = '{"language":"en-US","changed":true}\n'
    fs.writeFileSync(path.join(layout.productRoot, 'chat.db'), 'legacy')
    fs.writeFileSync(configPath(layout), originalConfig)
    const clearDefaultSessionData = vi.fn(async () => {
      fs.writeFileSync(configPath(layout), changedConfig)
    })
    try {
      await expect(runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData,
      })).rejects.toThrow('EPOCH2_WIN32_CONFIG_CHANGED')
      expect(readEpoch2ResetJournal({ layout, lease })?.phase).toBe('legacy_files_deleted')
      expect(fs.readFileSync(configPath(layout), 'utf8')).toBe(changedConfig)

      const recreatedLegacyDb = path.join(layout.productRoot, 'chat.db')
      fs.writeFileSync(recreatedLegacyDb, 'recreated-by-old-runtime')
      const recoverySessionReset = vi.fn(async () => {})
      const recovered = await runEpoch2ResetThroughConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
        clearDefaultSessionData: recoverySessionReset,
      })
      expect(recovered.journal.phase).toBe('config_replaced')
      expect(recovered.deletedTargetCount).toBe(1)
      expect(fs.existsSync(recreatedLegacyDb)).toBe(false)
      expect(JSON.parse(fs.readFileSync(configPath(layout), 'utf8'))).toEqual({
        language: 'en-US',
      })
      expect(clearDefaultSessionData).toHaveBeenCalledTimes(1)
      expect(recoverySessionReset).toHaveBeenCalledTimes(1)
    } finally {
      lease.release()
    }
  })
})
