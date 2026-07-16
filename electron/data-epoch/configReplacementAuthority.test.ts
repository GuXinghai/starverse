import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acquireWin32EpochRootLease,
  commitEpoch2ConfigReplacement,
  deleteEpoch2LegacyConfigBackups,
  prepareEpoch2ConfigReplacement,
} from './win32EpochRootLease'
import { cleanupEpoch2TransitionTemps } from './nativeOwnedDelete'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2RootManifestAtomic } from './rootManifestStore'
import { advanceEpoch2ResetJournal, createEpoch2ResetJournal } from './resetJournal'
import { writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import { readEpoch2ResetJournal } from './resetJournalStore'

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []
const operationId = '123e4567-e89b-42d3-a456-426614174000'
const rollbackName = `.svcfg-old-${operationId.replace(/-/gu, '')}`

function fixture(
  name: string,
  phase: 'none' | 'prepared' | 'legacy_files_deleted' = 'legacy_files_deleted',
) {
  const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(appDataRoot)
  const layout = resolveEpoch2WorkspaceLayout({
    appDataRoot,
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
  const lease = acquireWin32EpochRootLease(layout)
  writeEpoch2RootManifestAtomic({
    layout,
    lease,
    manifest: createEpoch2RootManifest({ layout }),
  })
  const prepared = createEpoch2ResetJournal({ operationId, layout })
  if (phase !== 'none') {
    writeEpoch2ResetJournalAtomic({ layout, lease, journal: prepared })
  }
  if (phase === 'legacy_files_deleted') {
    writeEpoch2ResetJournalAtomic({
      layout,
      lease,
      journal: advanceEpoch2ResetJournal(prepared, 'legacy_files_deleted'),
    })
  }
  return { layout, lease }
}

function secureRecord(providerKey: string, value = `secret-${providerKey}`) {
  return {
    version: 1,
    providerKey,
    backend: 'electron_safe_storage',
    ciphertextBase64: Buffer.from(value).toString('base64'),
    updatedAtMs: 123,
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('epoch-2 config replacement authority', () => {
  windowsIt('rejects an in-memory journal when no journal is persisted under the lease', () => {
    const { layout, lease } = fixture('starverse-config-unpersisted-journal', 'none')
    const fabricated = advanceEpoch2ResetJournal(
      createEpoch2ResetJournal({ operationId, layout }),
      'legacy_files_deleted',
    )
    expect(fabricated.phase).toBe('legacy_files_deleted')
    try {
      expect(() => prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })).toThrow('EPOCH2_CONFIG_REPLACEMENT_PHASE_INVALID')
      expect(() => deleteEpoch2LegacyConfigBackups({ layout, lease }))
        .toThrow('EPOCH2_CONFIG_REPLACEMENT_PHASE_INVALID')
    } finally {
      lease.release()
    }
  })

  windowsIt('requires the exact legacy-files-deleted journal phase', () => {
    const { layout, lease } = fixture('starverse-config-phase', 'prepared')
    try {
      expect(() => prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })).toThrow('EPOCH2_CONFIG_REPLACEMENT_PHASE_INVALID')
    } finally {
      lease.release()
    }
  })

  windowsIt('projects only approved preferences and encrypted credentials before atomic replacement', () => {
    const { layout, lease } = fixture('starverse-config-replace')
    const original = {
      language: 'zh-CN',
      languageManual: 'en-US',
      theme: 'dark',
      fontSize: 15,
      analyticsEnabled: false,
      openRouterApiKey: 'plaintext-must-go',
      providerCredentials: { v1: {
        openrouter: secureRecord('openrouter'),
        anthropic: secureRecord('anthropic'),
      } },
      compatibleCredentials: { v1: { custom: secureRecord('custom') } },
      generationParams: { temperature: 0.9 },
    }
    fs.writeFileSync(path.join(layout.productRoot, 'config.json'), JSON.stringify(original))
    try {
      const authority = prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: (_providerKey, ciphertext) => ciphertext.toString('utf8'),
      })
      expect(authority.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(authority.byteLength).toBeGreaterThan(2)
      commitEpoch2ConfigReplacement({ layout, lease, authority })
      const replaced = JSON.parse(fs.readFileSync(path.join(layout.productRoot, 'config.json'), 'utf8'))
      expect(replaced).toEqual({
        language: 'zh-CN',
        languageManual: 'en-US',
        theme: 'dark',
        fontSize: 15,
        analyticsEnabled: false,
        providerCredentials: { v1: {
          openrouter: secureRecord('openrouter'),
          anthropic: secureRecord('anthropic'),
        } },
      })
      expect(JSON.stringify(replaced)).not.toContain('plaintext-must-go')
      expect(JSON.stringify(replaced)).not.toContain('generationParams')
      expect(() => commitEpoch2ConfigReplacement({ layout, lease, authority }))
        .toThrow('EPOCH2_CONFIG_REPLACEMENT_AUTHORITY_INVALID')
    } finally {
      lease.release()
    }
  })

  windowsIt('rejects a changed config snapshot without overwriting the newer bytes', () => {
    const { layout, lease } = fixture('starverse-config-cas')
    const configPath = path.join(layout.productRoot, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({ language: 'zh-CN' }))
    try {
      const authority = prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      fs.writeFileSync(configPath, JSON.stringify({ language: 'en-US', changed: true }))
      expect(() => commitEpoch2ConfigReplacement({ layout, lease, authority }))
        .toThrow('EPOCH2_WIN32_CONFIG_CHANGED')
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({
        language: 'en-US',
        changed: true,
      })
    } finally {
      lease.release()
    }
  })

  windowsIt('revokes a prepared replacement when the persisted journal advances before commit', () => {
    const { layout, lease } = fixture('starverse-config-phase-race')
    const configPath = path.join(layout.productRoot, 'config.json')
    const original = '{"language":"zh-CN","legacy":true}\n'
    fs.writeFileSync(configPath, original)
    try {
      const authority = prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      const current = readEpoch2ResetJournal({ layout, lease })
      expect(current?.phase).toBe('legacy_files_deleted')
      writeEpoch2ResetJournalAtomic({
        layout,
        lease,
        journal: advanceEpoch2ResetJournal(current!, 'config_replaced'),
      })
      expect(() => commitEpoch2ConfigReplacement({ layout, lease, authority }))
        .toThrow('EPOCH2_CONFIG_REPLACEMENT_PHASE_INVALID')
      expect(fs.readFileSync(configPath, 'utf8')).toBe(original)
      expect(fs.existsSync(path.join(layout.transitionRoot, rollbackName))).toBe(false)
      expect(() => commitEpoch2ConfigReplacement({ layout, lease, authority }))
        .toThrow('EPOCH2_CONFIG_REPLACEMENT_AUTHORITY_INVALID')
    } finally {
      lease.release()
    }
  })

  windowsIt('invalidates an older authority when a later snapshot is prepared on the same lease', () => {
    const { layout, lease } = fixture('starverse-config-snapshot-order')
    const configPath = path.join(layout.productRoot, 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({ language: 'zh-CN' }))
    try {
      const first = prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      const second = prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      expect(() => commitEpoch2ConfigReplacement({ layout, lease, authority: first }))
        .toThrow('EPOCH2_WIN32_CONFIG_CHANGED')
      commitEpoch2ConfigReplacement({ layout, lease, authority: second })
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ language: 'zh-CN' })
    } finally {
      lease.release()
    }
  })

  windowsIt('creates a canonical empty config when legacy config is absent', () => {
    const { layout, lease } = fixture('starverse-config-absent')
    try {
      const authority = prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      commitEpoch2ConfigReplacement({ layout, lease, authority })
      expect(fs.readFileSync(path.join(layout.productRoot, 'config.json'), 'utf8')).toBe('{}\n')
    } finally {
      lease.release()
    }
  })

  windowsIt('never replaces a config created after an absent snapshot', () => {
    const { layout, lease } = fixture('starverse-config-absent-race')
    const configPath = path.join(layout.productRoot, 'config.json')
    try {
      const authority = prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      fs.writeFileSync(configPath, '{"created":"after-snapshot"}\n')
      expect(() => commitEpoch2ConfigReplacement({ layout, lease, authority }))
        .toThrow('EPOCH2_WIN32_CONFIG_CHANGED')
      expect(fs.readFileSync(configPath, 'utf8')).toBe('{"created":"after-snapshot"}\n')
    } finally {
      lease.release()
    }
  })

  windowsIt('recovers when the old config was moved but the replacement was not published', () => {
    const first = fixture('starverse-config-recover-unpublished')
    const configPath = path.join(first.layout.productRoot, 'config.json')
    const rollbackPath = path.join(first.layout.transitionRoot, rollbackName)
    fs.writeFileSync(configPath, '{"language":"zh-CN","legacy":true}\n')
    first.lease.release()
    fs.renameSync(configPath, rollbackPath)
    const lease = acquireWin32EpochRootLease(first.layout)
    try {
      expect(cleanupEpoch2TransitionTemps({ layout: first.layout, lease })).toBe(0)
      expect(fs.existsSync(rollbackPath)).toBe(true)
      const authority = prepareEpoch2ConfigReplacement({
        layout: first.layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      commitEpoch2ConfigReplacement({ layout: first.layout, lease, authority })
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ language: 'zh-CN' })
      expect(fs.existsSync(rollbackPath)).toBe(false)
    } finally {
      lease.release()
    }
  })

  windowsIt('finalizes a published replacement after a crash and rejects a conflicting current file', () => {
    const first = fixture('starverse-config-recover-published')
    const configPath = path.join(first.layout.productRoot, 'config.json')
    const rollbackPath = path.join(first.layout.transitionRoot, rollbackName)
    const oldConfig = '{"language":"zh-CN","legacy":true}\n'
    const projectedConfig = `${JSON.stringify({ language: 'zh-CN' }, null, 2)}\n`
    fs.writeFileSync(configPath, oldConfig)
    first.lease.release()
    fs.renameSync(configPath, rollbackPath)
    fs.writeFileSync(configPath, projectedConfig)
    let lease = acquireWin32EpochRootLease(first.layout)
    try {
      const authority = prepareEpoch2ConfigReplacement({
        layout: first.layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      commitEpoch2ConfigReplacement({ layout: first.layout, lease, authority })
      expect(fs.existsSync(rollbackPath)).toBe(false)
      expect(fs.readFileSync(configPath, 'utf8')).toBe(projectedConfig)
    } finally {
      lease.release()
    }

    fs.writeFileSync(rollbackPath, oldConfig)
    fs.writeFileSync(configPath, '{"language":"en-US","competitor":true}\n')
    lease = acquireWin32EpochRootLease(first.layout)
    try {
      const authority = prepareEpoch2ConfigReplacement({
        layout: first.layout,
        lease,
        validateDecrypt: () => 'unused',
      })
      expect(() => commitEpoch2ConfigReplacement({ layout: first.layout, lease, authority }))
        .toThrow('EPOCH2_WIN32_CONFIG_CHANGED')
      expect(fs.readFileSync(configPath, 'utf8'))
        .toBe('{"language":"en-US","competitor":true}\n')
      expect(fs.readFileSync(rollbackPath, 'utf8')).toBe(oldConfig)
    } finally {
      lease.release()
    }
  })

  windowsIt('blocks malformed JSON, invalid credential records and config reparse points', () => {
    const { layout, lease } = fixture('starverse-config-invalid')
    const configPath = path.join(layout.productRoot, 'config.json')
    try {
      fs.writeFileSync(configPath, '{invalid')
      expect(() => prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })).toThrow('EPOCH2_CONFIG_INVALID')
      fs.writeFileSync(configPath, JSON.stringify({
        providerCredentials: { v1: {
          openrouter: { ...secureRecord('openrouter'), backend: 'plaintext_fallback' },
        } },
      }))
      expect(() => prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })).toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
      fs.unlinkSync(configPath)
      const outside = path.join(layout.appDataRoot, 'outside-config.json')
      fs.writeFileSync(outside, '{"outside":true}')
      fs.symlinkSync(outside, configPath, 'file')
      expect(() => prepareEpoch2ConfigReplacement({
        layout,
        lease,
        validateDecrypt: () => 'unused',
      })).toThrow('EPOCH2_WIN32_CONFIG_REPARSE_POINT')
      expect(fs.readFileSync(outside, 'utf8')).toBe('{"outside":true}')
    } finally {
      lease.release()
    }
  })

  windowsIt('deletes only strict config backups and rejects near-match names before mutation', () => {
    const { layout, lease } = fixture('starverse-config-backups')
    const standard = path.join(layout.productRoot, 'config.backup.2026-07-17T12-34-56-789Z.json')
    const corrupted = path.join(layout.productRoot, 'config.json.corrupted.parse-error.1784256000000.bak')
    const nearMatches = [
      'config.backup.latest.json',
      'config.backup.2026-99-99T99-99-99-999Z.json',
      'config.backup.2026-02-30T12-00-00-000Z.json',
      'config.json.corrupted.parse-error.0000000000001.bak',
      'config.json.corrupted.parse-error.17842560000000000.bak',
    ].map((name) => path.join(layout.productRoot, name))
    fs.writeFileSync(standard, 'standard')
    fs.writeFileSync(corrupted, 'corrupted')
    for (const nearMatch of nearMatches) fs.writeFileSync(nearMatch, 'near')
    try {
      expect(() => deleteEpoch2LegacyConfigBackups({
        layout, lease,
      }))
        .toThrow('EPOCH2_WIN32_CONFIG_BACKUP_NAME_INVALID')
      expect(fs.existsSync(standard)).toBe(true)
      expect(fs.existsSync(corrupted)).toBe(true)
      for (const nearMatch of nearMatches) {
        expect(fs.existsSync(nearMatch)).toBe(true)
        fs.unlinkSync(nearMatch)
      }
      expect(deleteEpoch2LegacyConfigBackups({
        layout, lease,
      })).toBe(2)
      expect(fs.existsSync(standard)).toBe(false)
      expect(fs.existsSync(corrupted)).toBe(false)
      expect(deleteEpoch2LegacyConfigBackups({
        layout, lease,
      })).toBe(0)
    } finally {
      lease.release()
    }
  })

  windowsIt('rejects strict-name backup directories and reparse points without touching outside data', () => {
    const { layout, lease } = fixture('starverse-config-backup-reparse')
    const strictDirectory = path.join(
      layout.productRoot,
      'config.backup.2026-07-17T12-34-56-789Z.json',
    )
    fs.mkdirSync(strictDirectory)
    try {
      expect(() => deleteEpoch2LegacyConfigBackups({
        layout, lease,
      }))
        .toThrow('EPOCH2_WIN32_CONFIG_BACKUP_INVALID')
      expect(fs.existsSync(strictDirectory)).toBe(true)
      fs.rmdirSync(strictDirectory)

      const outside = path.join(layout.appDataRoot, 'outside-backup.json')
      fs.writeFileSync(outside, 'outside')
      fs.symlinkSync(
        outside,
        path.join(layout.productRoot, 'config.backup.2026-07-17T12-34-56-789Z.json'),
        'file',
      )
      expect(() => deleteEpoch2LegacyConfigBackups({
        layout, lease,
      }))
        .toThrow('EPOCH2_WIN32_CONFIG_BACKUP_INVALID')
      expect(fs.readFileSync(outside, 'utf8')).toBe('outside')
    } finally {
      lease.release()
    }
  })
})
