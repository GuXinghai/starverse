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
import { writeEpoch2RootManifestAtomic } from './rootManifestStore'
import {
  advanceEpoch2ResetJournal,
  createEpoch2ResetJournal,
  decodeEpoch2ResetJournal,
} from './resetJournal'
import { readEpoch2ResetJournal, writeEpoch2ResetJournalAtomic } from './resetJournalStore'
import { assertEpoch2OwnedDeletePlanFresh, inspectEpoch2OwnedDeleteTarget } from './safeOwnedDelete'

const digest = 'a'.repeat(64)
const operationId = '123e4567-e89b-42d3-a456-426614174000'

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
    const prepared = createEpoch2ResetJournal({ operationId, pathDigests: { legacyDb: digest } })
    expect(decodeEpoch2ResetJournal(JSON.parse(JSON.stringify(prepared)))).toEqual(prepared)
    expect(advanceEpoch2ResetJournal(prepared, 'prepared')).toBe(prepared)
    const deleted = advanceEpoch2ResetJournal(prepared, 'legacy_files_deleted')
    expect(deleted.phase).toBe('legacy_files_deleted')
    expect(() => advanceEpoch2ResetJournal(deleted, 'prepared')).toThrow('EPOCH2_RESET_PHASE_REGRESSION')
    expect(() => advanceEpoch2ResetJournal(deleted, 'epoch_root_created')).toThrow('EPOCH2_RESET_PHASE_SKIP')
  })

  it('atomically persists and recovers the strict reset journal', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-epoch-journal-'))
    try {
      const journalPath = path.join(directory, 'epoch-2', 'transition.json')
      const prepared = createEpoch2ResetJournal({ operationId, pathDigests: { legacyDb: digest } })
      writeEpoch2ResetJournalAtomic(journalPath, prepared)
      expect(readEpoch2ResetJournal(journalPath)).toEqual(prepared)
      const next = advanceEpoch2ResetJournal(prepared, 'legacy_files_deleted')
      writeEpoch2ResetJournalAtomic(journalPath, next)
      expect(readEpoch2ResetJournal(journalPath)).toEqual(next)
      expect(fs.readdirSync(path.dirname(journalPath))).toEqual(['transition.json'])

      const third = advanceEpoch2ResetJournal(next, 'config_replaced')
      fs.writeFileSync(`${journalPath}.pending`, `${JSON.stringify(third)}\n`)
      writeEpoch2ResetJournalAtomic(journalPath, third)
      expect(readEpoch2ResetJournal(journalPath)).toEqual(third)
      expect(fs.existsSync(`${journalPath}.pending`)).toBe(false)

      fs.writeFileSync(`${journalPath}.pending`, '{partial')
      const fourth = advanceEpoch2ResetJournal(third, 'epoch_root_created')
      writeEpoch2ResetJournalAtomic(journalPath, fourth)
      expect(readEpoch2ResetJournal(journalPath)).toEqual(fourth)
      expect(fs.existsSync(`${journalPath}.pending`)).toBe(false)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('audits the complete owned subtree before deletion and rejects escapes or reparse points', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-owned-delete-'))
    const layout = resolveEpoch2WorkspaceLayout({
      appDataRoot: directory, homeRoot: os.homedir(), repositoryRoot: process.cwd(),
    })
    const manifest = createEpoch2RootManifest({ layout })
    writeEpoch2RootManifestAtomic({ layout, manifest })
    const ownedRoot = layout.productRoot
    const target = path.join(ownedRoot, 'assets')
    const protectedPath = path.join(ownedRoot, 'config.json')
    fs.mkdirSync(path.join(target, 'nested'), { recursive: true })
    fs.writeFileSync(path.join(target, 'nested', 'blob.bin'), 'data')
    fs.writeFileSync(protectedPath, '{}')
    try {
      const authorization = {
        layout, rootScope: 'product' as const,
      }
      const plan = inspectEpoch2OwnedDeleteTarget({ ...authorization, target, protectedPaths: [protectedPath] })
      expect(plan.entriesPostOrder.at(-1)?.path).toBe(target)
      expect(() => assertEpoch2OwnedDeletePlanFresh({ ...authorization, plan })).not.toThrow()
      expect(fs.existsSync(target)).toBe(true)
      expect(fs.existsSync(protectedPath)).toBe(true)

      const changedTarget = path.join(ownedRoot, 'changed')
      fs.mkdirSync(changedTarget)
      const changedFile = path.join(changedTarget, 'data.bin')
      fs.writeFileSync(changedFile, 'before')
      const changedPlan = inspectEpoch2OwnedDeleteTarget({
        ...authorization, target: changedTarget, protectedPaths: [protectedPath],
      })
      fs.writeFileSync(changedFile, 'after')
      expect(() => assertEpoch2OwnedDeletePlanFresh({
        ...authorization, plan: changedPlan,
      })).toThrow('EPOCH2_DELETE_PATH_CHANGED')
      expect(fs.existsSync(changedTarget)).toBe(true)
      expect(() => inspectEpoch2OwnedDeleteTarget({
        ...authorization,
        target: directory,
        protectedPaths: [],
      })).toThrow('EPOCH2_DELETE_TARGET_OUTSIDE_ROOT')

      const outside = path.join(directory, 'outside')
      const link = path.join(ownedRoot, 'linked')
      fs.mkdirSync(outside)
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
      expect(() => inspectEpoch2OwnedDeleteTarget({ ...authorization, target: link, protectedPaths: [] }))
        .toThrow('EPOCH2_DELETE_REPARSE_POINT')
      expect(() => inspectEpoch2OwnedDeleteTarget({
        ...authorization, target: layout.transitionRoot, protectedPaths: [],
      })).toThrow('EPOCH2_DELETE_PROTECTED_PATH')
      expect(() => inspectEpoch2OwnedDeleteTarget({
        ...authorization, target: `${layout.journalPath}.pending`, protectedPaths: [],
      })).toThrow('EPOCH2_DELETE_PROTECTED_PATH')
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects an on-disk transition marker reached through a junction', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-marker-junction-'))
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-marker-outside-'))
    try {
      const layout = resolveEpoch2WorkspaceLayout({
        appDataRoot: directory, homeRoot: os.homedir(), repositoryRoot: process.cwd(),
      })
      fs.mkdirSync(layout.productRoot, { recursive: true })
      fs.symlinkSync(outside, layout.transitionRoot, process.platform === 'win32' ? 'junction' : 'dir')
      const manifest = createEpoch2RootManifest({ layout })
      expect(() => writeEpoch2RootManifestAtomic({ layout, manifest }))
        .toThrow('EPOCH2_ROOT_MANIFEST_REPARSE_POINT')
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })

  it('projects only approved preferences and the five decryptable safe-storage leaves', () => {
    const providerCredentials = {
      openrouter: secureRecord('openrouter'),
      openai_responses: secureRecord('openai_responses'),
      google_ai_studio: secureRecord('google_ai_studio'),
      anthropic: secureRecord('anthropic'),
      deepseek: secureRecord('deepseek'),
      custom: secureRecord('custom'),
    }
    const projected = projectEpoch2Config({
      rawConfig: {
        language: 'zh-CN', languageManual: 'en-US', theme: 'dark', fontSize: 15,
        windowBounds: { x: 1, y: 2, width: 1200, height: 800, injected: 'drop' },
        windowMaximized: false, sidebarWidth: 280, sidebarCollapsed: true, analyticsEnabled: false,
        enableNotifications: true, activeProvider: 'OpenRouter', openRouterApiKey: 'legacy-secret',
        compatibleCredentials: { v1: { custom: secureRecord('custom') } },
        providerCredentials: { v1: providerCredentials },
      },
      validateDecrypt: (_providerKey, ciphertext) => ciphertext.toString('utf8'),
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

  it('fails closed on malformed, plaintext, mismatched or undecryptable approved credentials', () => {
    const invalidRecords = [
      { ...secureRecord('openrouter'), backend: 'plaintext_fallback', plaintext: 'secret' },
      { ...secureRecord('openrouter'), providerKey: 'anthropic' },
      { ...secureRecord('openrouter'), ciphertextBase64: 'not base64' },
    ]
    for (const invalid of invalidRecords) {
      expect(() => projectEpoch2Config({
        rawConfig: { providerCredentials: { v1: { openrouter: invalid } } },
        validateDecrypt: () => 'key',
      })).toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    }
    expect(() => projectEpoch2Config({
      rawConfig: { providerCredentials: { v1: { openrouter: secureRecord('openrouter') } } },
      validateDecrypt: () => '',
    })).toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    expect(() => projectEpoch2Config({
      rawConfig: { providerCredentials: { v1: { openrouter: {
        ...secureRecord('openrouter'), plaintext: 'must-not-coexist',
      } } } },
      validateDecrypt: () => 'key',
    })).toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    expect(() => projectEpoch2Config({
      rawConfig: { providerCredentials: { v1: 'corrupt' } },
      validateDecrypt: () => 'key',
    })).toThrow('EPOCH2_CONFIG_INVALID:providerCredentials')
  })
})
