import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectEpoch2Config } from './configProjection'
import {
  createEpoch2RootManifest,
  decodeAndVerifyEpoch2RootManifest,
  resolveEpoch2WorkspaceLayout,
} from './rootManifest'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
  decodeEpoch2ResetJournal,
} from './resetJournal'
import { createEpoch2ResetInventory } from './resetInventory'
import { readEpoch2ResetJournal, writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import { acquireWin32EpochRootLease } from './win32EpochRootLease'

const operationId = '123e4567-e89b-42d3-a456-426614174000'
const windowsIt = process.platform === 'win32' ? it : it.skip

function secureRecord(providerKey: string, apiKey = `key-${providerKey}`) {
  return {
    version: 1,
    providerKey,
    backend: 'electron_safe_storage',
    ciphertextBase64: Buffer.from(apiKey).toString('base64'),
    updatedAtMs: 123,
  }
}

describe('Generation Compiler V2 epoch foundation', () => {
  it('resolves the fixed epoch-2 workspace and verifies an identity-bound root manifest', () => {
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot: path.join(os.tmpdir(), 'epoch-foundation-appdata'),
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    expect(layout.epochRoot).toBe(path.join(os.tmpdir(), 'epoch-foundation-appdata', 'Starverse', 'workspace', 'epoch-2'))
    expect(layout.databasePath).toBe(path.join(layout.epochRoot, 'starverse.db'))
    const manifest = createEpoch2RootManifest({ layout })
    expect(manifest.applicationId).toBe('io.github.guxinghai.starverse')
    expect(manifest.productDirectory).toBe('Starverse')
    expect(decodeAndVerifyEpoch2RootManifest({
      value: JSON.parse(JSON.stringify(manifest)),
      layout,
    })).toEqual(manifest)
    expect(() => decodeAndVerifyEpoch2RootManifest({
      value: { ...manifest, applicationId: 'com.starverse.desktop' },
      layout,
    })).toThrow('EPOCH2_ROOT_MANIFEST_MISMATCH')
    expect(() => decodeAndVerifyEpoch2RootManifest({
      value: { ...manifest, applicationId: 'io.github.guxinghai.starverse.dev' },
      layout,
    })).toThrow('EPOCH2_ROOT_MANIFEST_MISMATCH')
    expect(layout.journalPath.startsWith(layout.epochRoot)).toBe(false)
    expect(() => resolveEpoch2WorkspaceLayout({
      appDataRoot: os.homedir(), homeRoot: os.homedir(), repositoryRoot: process.cwd(),
    })).toThrow('EPOCH2_APP_DATA_ROOT_UNSAFE')
    const overlapFixture = path.join(os.tmpdir(), 'starverse-layout-overlap-fixture')
    for (const [appDataRoot, repositoryRoot] of [
      [path.join(overlapFixture, 'parent'), path.join(overlapFixture, 'parent', 'Starverse')],
      [path.join(overlapFixture, 'container', 'appdata'), path.join(overlapFixture, 'container')],
      [path.join(overlapFixture, 'nested'), path.join(overlapFixture, 'nested', 'Starverse', 'workspace', 'epoch-2', 'repo')],
    ]) {
      expect(() => resolveEpoch2WorkspaceLayout({ appDataRoot, homeRoot: os.homedir(), repositoryRoot }))
        .toThrow('EPOCH2_APP_DATA_ROOT_UNSAFE')
    }
    expect(() => createEpoch2RootManifest({
      layout: JSON.parse(JSON.stringify(layout)),
    })).toThrow('EPOCH2_APP_DATA_ROOT_UNSAFE')
  })

  it('keeps reset journal transitions monotonic, adjacent and idempotent', () => {
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot: path.join(os.tmpdir(), 'epoch-journal-contract'),
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    const inventory = createEpoch2ResetInventory(layout)
    const prepared = createEpoch2ResetJournal({ operationId, layout })
    expect(decodeEpoch2ResetJournal(JSON.parse(JSON.stringify(prepared)))).toEqual(prepared)
    expect(() => createEpoch2ResetJournal({ operationId: operationId.toUpperCase(), layout }))
      .toThrow('EPOCH2_RESET_JOURNAL_INVALID')
    expect(() => decodeEpoch2ResetJournal({
      ...prepared,
      operationId: operationId.toUpperCase(),
    })).toThrow('EPOCH2_RESET_JOURNAL_INVALID')
    expect(advanceEpoch2ResetJournal(prepared, 'prepared')).toBe(prepared)
    const deleted = advanceEpoch2ResetJournal(prepared, 'legacy_files_deleted')
    expect(deleted.phase).toBe('legacy_files_deleted')
    expect(() => advanceEpoch2ResetJournal(deleted, 'prepared')).toThrow('EPOCH2_RESET_PHASE_REGRESSION')
    expect(() => advanceEpoch2ResetJournal(deleted, 'epoch_root_created')).toThrow('EPOCH2_RESET_PHASE_SKIP')
    expect(() => decodeEpoch2ResetJournal({
      ...prepared,
      inventory: {
        ...inventory,
        legacyTargetPathDigests: {
          ...inventory.legacyTargetPathDigests,
          legacy_assets: undefined,
        },
      },
    })).toThrow('EPOCH2_RESET_INVENTORY_INVALID')
  })

  windowsIt('atomically persists the strict reset journal through the epoch lease', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-epoch-journal-'))
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot: directory,
      homeRoot: os.homedir(),
      repositoryRoot: process.cwd(),
    })
    const lease = acquireWin32EpochRootLease(layout)
    try {
      const prepared = createEpoch2ResetJournal({
        operationId,
        layout,
      })
      writeEpoch2ResetJournalAtomic({ layout, lease, journal: prepared })
      expect(readEpoch2ResetJournal({ layout, lease })).toEqual(prepared)
      const next = advanceEpoch2ResetJournal(prepared, 'legacy_files_deleted')
      writeEpoch2ResetJournalAtomic({ layout, lease, journal: next })
      expect(readEpoch2ResetJournal({ layout, lease })).toEqual(next)
      expect(fs.readdirSync(layout.transitionRoot).sort()).toEqual([
        'epoch-transition.journal.json',
        'epoch-transition.lock',
      ])

      const third = advanceEpoch2ResetJournal(next, 'config_replaced')
      writeEpoch2ResetJournalAtomic({ layout, lease, journal: third })
      expect(readEpoch2ResetJournal({ layout, lease })).toEqual(third)
      const fourth = advanceEpoch2ResetJournal(third, 'epoch_root_created')
      writeEpoch2ResetJournalAtomic({ layout, lease, journal: fourth })
      expect(readEpoch2ResetJournal({ layout, lease })).toEqual(fourth)
    } finally {
      lease.release()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  windowsIt('rejects an on-disk transition root reached through a junction', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-marker-junction-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-marker-outside-'))
    try {
      const layout = resolveEpoch2WorkspaceLayout({
        appDataRoot: directory, homeRoot: os.homedir(), repositoryRoot: process.cwd(),
      })
      fs.mkdirSync(layout.productRoot, { recursive: true })
      fs.symlinkSync(outside, layout.transitionRoot, process.platform === 'win32' ? 'junction' : 'dir')
      expect(() => acquireWin32EpochRootLease(layout))
        .toThrow('EPOCH2_WIN32_REPARSE_OR_ROOT_CHANGED')
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('projects only approved preferences and the five decryptable safe-storage leaves', async () => {
    const providerCredentials = {
      openrouter: secureRecord('openrouter'),
      openai_responses: secureRecord('openai_responses'),
      google_ai_studio: secureRecord('google_ai_studio'),
      anthropic: secureRecord('anthropic'),
      deepseek: secureRecord('deepseek'),
      custom: secureRecord('custom'),
    }
    const projected = await projectEpoch2Config({
      rawConfig: {
        language: 'zh-CN', languageManual: 'en-US', theme: 'dark', fontSize: 15,
        windowBounds: { x: 1, y: 2, width: 1200, height: 800, injected: 'drop' },
        windowMaximized: false, sidebarWidth: 280, sidebarCollapsed: true, analyticsEnabled: false,
        enableNotifications: true, activeProvider: 'OpenRouter', openRouterApiKey: 'legacy-secret',
        compatibleCredentials: { v1: { custom: secureRecord('custom') } },
        providerCredentials: { v1: providerCredentials },
      },
      validateDecrypt: async (_providerKey, ciphertext) => ({ credential: ciphertext.toString('utf8') }),
    })
    expect(projected).toEqual({
      language: 'zh-CN', languageManual: 'en-US', theme: 'dark', fontSize: 15,
      windowBounds: { x: 1, y: 2, width: 1200, height: 800 },
      windowMaximized: false, sidebarWidth: 280, sidebarCollapsed: true, analyticsEnabled: false,
      providerCredentials: { v1: {
        openrouter: providerCredentials.openrouter,
        openai_responses: providerCredentials.openai_responses,
        google_ai_studio: providerCredentials.google_ai_studio,
        anthropic: providerCredentials.anthropic,
        deepseek: providerCredentials.deepseek,
      } },
    })
    expect(JSON.stringify(projected)).not.toContain('legacy-secret')
    expect(JSON.stringify(projected)).not.toContain('compatibleCredentials')
  })

  it('fails closed on malformed, plaintext, mismatched or undecryptable approved credentials', async () => {
    const invalidRecords = [
      { ...secureRecord('openrouter'), backend: 'plaintext_fallback', plaintext: 'secret' },
      { ...secureRecord('openrouter'), providerKey: 'anthropic' },
      { ...secureRecord('openrouter'), ciphertextBase64: 'not base64' },
    ]
    for (const invalid of invalidRecords) {
      await expect(projectEpoch2Config({
        rawConfig: { providerCredentials: { v1: { openrouter: invalid } } },
        validateDecrypt: async () => ({ credential: 'key' }),
      })).rejects.toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    }
    await expect(projectEpoch2Config({
      rawConfig: { providerCredentials: { v1: { openrouter: secureRecord('openrouter') } } },
      validateDecrypt: async () => ({ credential: '' }),
    })).rejects.toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    await expect(projectEpoch2Config({
      rawConfig: { providerCredentials: { v1: { openrouter: {
        ...secureRecord('openrouter'), plaintext: 'must-not-coexist',
      } } } },
      validateDecrypt: async () => ({ credential: 'key' }),
    })).rejects.toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    await expect(projectEpoch2Config({
      rawConfig: { providerCredentials: { v1: 'corrupt' } },
      validateDecrypt: async () => ({ credential: 'key' }),
    })).rejects.toThrow('EPOCH2_CONFIG_INVALID:providerCredentials')
  })
})
