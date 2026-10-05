import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
  EPOCH2_RESET_PHASES,
  type Epoch2ResetPhase,
} from './resetJournal'
import { readEpoch2ResetJournal, writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import { createEpoch2RootManifest, resolveEpoch2WorkspaceLayout } from './rootManifest'
import { writeEpoch2TransitionOwnershipManifestAtomic } from './rootManifestStore'
import { acquireWin32EpochRootLease, ensureEpoch2RootAuthority } from './win32EpochRootLease'
import {
  assertEpoch2ConfigFileUsable,
  createFreshConfigFile,
  createFreshEpoch2Config,
  EPOCH2_CONFIG_RECOVERY_BACKUP_ROOT,
  inspectEpoch2ConfigFile,
  repairCorruptConfigFile,
  repairCorruptEpoch2Config,
  repairEpoch2ConfigText,
} from './corruptConfigRecovery'
import {
  confirmFreshConfigCreation,
  corruptConfigRecoveryDialogOptions,
} from './corruptConfigRecoveryPrompt'

const showMessageBox = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  app: { isPackaged: true, getAppPath: () => process.cwd() },
  dialog: { showMessageBox },
  safeStorage: {},
}))

const windowsIt = process.platform === 'win32' ? it : it.skip
const roots: string[] = []
const goodConfig = { language: 'zh-CN', theme: 'dark', providerCredentials: { v1: { openrouter: { ciphertextBase64: 'c2VjcmV0' } } } }

function tempRoot(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
  roots.push(root)
  return root
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Files that make up workspace/DB/attachment state; recovery must never touch them. */
function seedWorkspace(productRoot: string): Record<string, string> {
  const files = {
    'workspace/epoch-2/starverse.db': 'SQLite format 3\0db-bytes',
    'workspace/epoch-2/starverse.db-wal': 'wal-bytes',
    'workspace/epoch-2/attachments/aa/blob-1': 'attachment-bytes',
    'workspace/conversations.json': '{"keep":true}',
  }
  const snapshot: Record<string, string> = {}
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(productRoot, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    snapshot[relative] = digest(Buffer.from(content))
  }
  return snapshot
}

function workspaceSnapshot(productRoot: string, relatives: string[]): Record<string, string> {
  return Object.fromEntries(relatives.map((relative) =>
    [relative, digest(fs.readFileSync(path.join(productRoot, relative)))]))
}

function configPathOf(productRoot: string): string {
  return path.join(productRoot, 'config.json')
}

afterEach(() => {
  showMessageBox.mockReset()
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('corrupt config detection', () => {
  it('classifies missing, valid and corrupt config files', () => {
    const root = tempRoot('starverse-config-inspect')
    expect(inspectEpoch2ConfigFile(configPathOf(root)).state).toBe('missing')
    expect(() => assertEpoch2ConfigFileUsable(configPathOf(root))).not.toThrow()

    fs.writeFileSync(configPathOf(root), JSON.stringify(goodConfig))
    expect(inspectEpoch2ConfigFile(configPathOf(root)).state).toBe('valid')

    for (const bad of ['{"a":', '', '[]', '"text"', 'null']) {
      fs.writeFileSync(configPathOf(root), bad)
      expect(inspectEpoch2ConfigFile(configPathOf(root)).state).toBe('corrupt')
      expect(() => assertEpoch2ConfigFileUsable(configPathOf(root))).toThrow('EPOCH2_CONFIG_CORRUPT')
    }
    fs.writeFileSync(configPathOf(root), Buffer.from([0x7b, 0xff, 0xfe, 0x7d]))
    expect(inspectEpoch2ConfigFile(configPathOf(root)).state).toBe('corrupt')
  })
})

describe('lossless config repair', () => {
  it('repairs BOM, NUL padding and trailing commas without changing any data', () => {
    const body = JSON.stringify(goodConfig)
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(body)])
    const padded = Buffer.concat([Buffer.from(body), Buffer.alloc(64)])
    const commas = Buffer.from('{"language":"zh-CN",\n "list":[1,2,],\n "text":"keep ,} inside",\n}')
    expect(JSON.parse(repairEpoch2ConfigText(bom)!)).toEqual(goodConfig)
    expect(JSON.parse(repairEpoch2ConfigText(padded)!)).toEqual(goodConfig)
    expect(JSON.parse(repairEpoch2ConfigText(commas)!)).toEqual({
      language: 'zh-CN', list: [1, 2], text: 'keep ,} inside',
    })
  })

  it('refuses repairs that would drop or invent data', () => {
    expect(repairEpoch2ConfigText(Buffer.from('{"language":"zh-CN","providerCredentials":{"v1":'))).toBeNull()
    expect(repairEpoch2ConfigText(Buffer.from(''))).toBeNull()
    expect(repairEpoch2ConfigText(Buffer.from('[1,2]'))).toBeNull()
    expect(repairEpoch2ConfigText(Buffer.from('{"a":1}{"b":2}'))).toBeNull()
    expect(repairEpoch2ConfigText(Buffer.from([0x7b, 0xff, 0x7d]))).toBeNull()
  })

  it('repairs a corrupt file, preserves the original bytes and leaves workspace data untouched', () => {
    const root = tempRoot('starverse-config-repair')
    const seeded = seedWorkspace(root)
    const original = Buffer.concat([Buffer.from(JSON.stringify(goodConfig)), Buffer.alloc(16)])
    fs.writeFileSync(configPathOf(root), original)

    const result = repairCorruptConfigFile(root)

    expect(result.outcome).toBe('repaired')
    if (result.outcome !== 'repaired') throw new Error('unreachable')
    expect(result.backupDirectory.startsWith(path.join(root, EPOCH2_CONFIG_RECOVERY_BACKUP_ROOT))).toBe(true)
    expect(Buffer.compare(fs.readFileSync(result.backupPath), original)).toBe(0)
    expect(result.originalSha256).toBe(digest(original))
    expect(JSON.parse(fs.readFileSync(configPathOf(root), 'utf8'))).toEqual(goodConfig)
    expect(inspectEpoch2ConfigFile(configPathOf(root)).state).toBe('valid')
    expect(workspaceSnapshot(root, Object.keys(seeded))).toEqual(seeded)
    expect(fs.readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('leaves an unrecoverable file byte-for-byte untouched and creates no backup', () => {
    const root = tempRoot('starverse-config-unrecoverable')
    const seeded = seedWorkspace(root)
    const original = Buffer.from('{"providerCredentials":{"v1":{"openrouter":{"ciphertextBase64":"c2Vj')
    fs.writeFileSync(configPathOf(root), original)

    expect(repairCorruptConfigFile(root)).toEqual({ outcome: 'unrecoverable' })

    expect(Buffer.compare(fs.readFileSync(configPathOf(root)), original)).toBe(0)
    expect(fs.existsSync(path.join(root, EPOCH2_CONFIG_RECOVERY_BACKUP_ROOT))).toBe(false)
    expect(workspaceSnapshot(root, Object.keys(seeded))).toEqual(seeded)
  })

  it('refuses to run against a config that is not corrupt', () => {
    const root = tempRoot('starverse-config-not-corrupt')
    fs.writeFileSync(configPathOf(root), JSON.stringify(goodConfig))
    expect(() => repairCorruptConfigFile(root)).toThrow('EPOCH2_CONFIG_RECOVERY_NOT_CORRUPT')
    expect(() => createFreshConfigFile(root)).toThrow('EPOCH2_CONFIG_RECOVERY_NOT_CORRUPT')
    expect(JSON.parse(fs.readFileSync(configPathOf(root), 'utf8'))).toEqual(goodConfig)
  })

  it('restores the original when the backup location cannot be created', () => {
    const root = tempRoot('starverse-config-backup-blocked')
    const original = Buffer.from('{"language":"zh-CN",}')
    fs.writeFileSync(configPathOf(root), original)
    fs.writeFileSync(path.join(root, EPOCH2_CONFIG_RECOVERY_BACKUP_ROOT), 'a file, not a directory')

    expect(() => repairCorruptConfigFile(root)).toThrow('EPOCH2_CONFIG_RECOVERY_BACKUP_FAILED')

    expect(Buffer.compare(fs.readFileSync(configPathOf(root)), original)).toBe(0)
    expect(fs.readdirSync(root).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})

describe('fresh config creation', () => {
  it('preserves the corrupt file verbatim and creates a clean config without touching workspace data', () => {
    const root = tempRoot('starverse-config-fresh')
    const seeded = seedWorkspace(root)
    const original = Buffer.from('{"providerCredentials":{"v1":{"openrouter":')
    fs.writeFileSync(configPathOf(root), original)

    const result = createFreshConfigFile(root)

    expect(Buffer.compare(fs.readFileSync(result.backupPath), original)).toBe(0)
    expect(result.originalSha256).toBe(digest(original))
    expect(fs.readFileSync(configPathOf(root), 'utf8')).toBe('{}\n')
    expect(inspectEpoch2ConfigFile(configPathOf(root)).state).toBe('valid')
    expect(workspaceSnapshot(root, Object.keys(seeded))).toEqual(seeded)
  })

  it('keeps every earlier backup when recovery runs again', () => {
    const root = tempRoot('starverse-config-fresh-twice')
    fs.writeFileSync(configPathOf(root), 'broken-1')
    const first = createFreshConfigFile(root)
    fs.writeFileSync(configPathOf(root), 'broken-2')
    const second = createFreshConfigFile(root)

    expect(first.backupDirectory).not.toBe(second.backupDirectory)
    expect(fs.readFileSync(first.backupPath, 'utf8')).toBe('broken-1')
    expect(fs.readFileSync(second.backupPath, 'utf8')).toBe('broken-2')
  })
})

describe('corrupt config recovery prompt', () => {
  it('keeps the explicit environment authority as a non-interactive bypass', async () => {
    await expect(confirmFreshConfigCreation({ SV_EPOCH2_RECOVER_ON_CONFIG_CORRUPT: '1' })).resolves.toBe(true)
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('defaults to exit and only creates a fresh config on the explicit button', async () => {
    showMessageBox.mockResolvedValueOnce({ response: 0 })
    await expect(confirmFreshConfigCreation({})).resolves.toBe(true)
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(confirmFreshConfigCreation({})).resolves.toBe(false)
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      buttons: ['创建新配置', '退出'], defaultId: 1, cancelId: 1,
    }))
  })

  it('states that the original is kept and credentials are not carried over', () => {
    const options = corruptConfigRecoveryDialogOptions()
    expect(options.detail).toContain('原样保留')
    expect(options.detail).toContain('凭据不会被载入')
    expect(options.detail).toContain('对话数据、工作区和附件不会被改动')
  })
})

describe('corrupt config recovery under the epoch-2 root lease', () => {
  const repositoryRoot = path.resolve(process.cwd())

  function fixture(name: string, phase: Epoch2ResetPhase) {
    const appDataRoot = tempRoot(name)
    const layout = resolveEpoch2WorkspaceLayout({ appDataRoot, homeRoot: os.homedir(), repositoryRoot })
    fs.mkdirSync(layout.productRoot, { recursive: true })
    const lease = acquireWin32EpochRootLease(layout)
    writeEpoch2TransitionOwnershipManifestAtomic({ layout, lease, manifest: createEpoch2RootManifest({ layout }) })
    let journal = createEpoch2ResetJournal({ layout, operationId: '123e4567-e89b-42d3-a456-426614174000' })
    writeEpoch2ResetJournalAtomic({ layout, lease, journal })
    while (EPOCH2_RESET_PHASES.indexOf(journal.phase) < EPOCH2_RESET_PHASES.indexOf(phase)) {
      journal = advanceEpoch2ResetJournal(journal, EPOCH2_RESET_PHASES[EPOCH2_RESET_PHASES.indexOf(journal.phase) + 1])
      writeEpoch2ResetJournalAtomic({ layout, lease, journal })
    }
    ensureEpoch2RootAuthority({ layout, lease })
    return { layout, lease, journal }
  }

  windowsIt('repairs and creates a fresh config under the lease without changing the journal or workspace', () => {
    const value = fixture('starverse-config-lease', 'committed')
    try {
      const seeded = seedWorkspace(value.layout.productRoot)
      const journalBefore = readEpoch2ResetJournal({ layout: value.layout, lease: value.lease })
      const configPath = configPathOf(value.layout.productRoot)

      fs.writeFileSync(configPath, '{"language":"zh-CN",}')
      const repaired = repairCorruptEpoch2Config({ layout: value.layout, lease: value.lease })
      expect(repaired.outcome).toBe('repaired')
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ language: 'zh-CN' })

      const broken = Buffer.from('{"language":')
      fs.writeFileSync(configPath, broken)
      expect(repairCorruptEpoch2Config({ layout: value.layout, lease: value.lease }))
        .toEqual({ outcome: 'unrecoverable' })
      const fresh = createFreshEpoch2Config({ layout: value.layout, lease: value.lease })
      expect(Buffer.compare(fs.readFileSync(fresh.backupPath), broken)).toBe(0)
      expect(fs.readFileSync(configPath, 'utf8')).toBe('{}\n')

      expect(readEpoch2ResetJournal({ layout: value.layout, lease: value.lease })).toEqual(journalBefore)
      expect(workspaceSnapshot(value.layout.productRoot, Object.keys(seeded))).toEqual(seeded)
    } finally { value.lease.release() }
  })

  windowsIt('refuses to recover before the epoch-2 database exists', () => {
    const value = fixture('starverse-config-lease-prepared', 'prepared')
    try {
      fs.writeFileSync(configPathOf(value.layout.productRoot), '{"a":')
      expect(() => repairCorruptEpoch2Config({ layout: value.layout, lease: value.lease }))
        .toThrow('EPOCH2_CONFIG_RECOVERY_JOURNAL_INVALID')
      expect(fs.readFileSync(configPathOf(value.layout.productRoot), 'utf8')).toBe('{"a":')
    } finally { value.lease.release() }
  })
})
