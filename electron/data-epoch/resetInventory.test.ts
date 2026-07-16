import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveEpoch2WorkspaceLayout } from './rootManifest'
import {
  createEpoch2ResetInventory,
  decodeEpoch2ResetInventory,
} from './resetInventory'
import { EPOCH2_OWNED_TARGET_IDS } from './win32EpochRootLease'

function layout(label: string) {
  return resolveEpoch2WorkspaceLayout({
    appDataRoot: path.join(os.tmpdir(), label),
    homeRoot: os.homedir(),
    repositoryRoot: process.cwd(),
  })
}

describe('epoch-2 strict reset inventory', () => {
  it('derives every fixed legacy target and every reset boundary path', () => {
    const value = createEpoch2ResetInventory(layout('starverse-reset-inventory-a'))
    expect(Object.keys(value.legacyTargetPathDigests)).toEqual([...EPOCH2_OWNED_TARGET_IDS])
    expect(Object.values(value.legacyTargetPathDigests).every((digest) =>
      /^[a-f0-9]{64}$/u.test(digest))).toBe(true)
    expect(decodeEpoch2ResetInventory(JSON.parse(JSON.stringify(value)))).toEqual(value)
  })

  it('rejects missing, extra or malformed inventory facts', () => {
    const value = createEpoch2ResetInventory(layout('starverse-reset-inventory-b'))
    const { legacy_assets: _removed, ...missingLegacy } = value.legacyTargetPathDigests
    for (const malformed of [
      { ...value, legacyTargetPathDigests: missingLegacy },
      { ...value, injected: true },
      { ...value, configPathDigest: 'not-a-digest' },
      { ...value, configBackupNamespaceDigests: { standard: 'a'.repeat(64) } },
    ]) {
      expect(() => decodeEpoch2ResetInventory(malformed)).toThrow('EPOCH2_RESET_INVENTORY_INVALID')
    }
  })

  it('binds the inventory to the exact factory-issued layout', () => {
    const first = createEpoch2ResetInventory(layout('starverse-reset-inventory-c'))
    const second = createEpoch2ResetInventory(layout('starverse-reset-inventory-d'))
    expect(first).not.toEqual(second)
    expect(() => createEpoch2ResetInventory({
      ...layout('starverse-reset-inventory-e'),
    } as never)).toThrow('EPOCH2_APP_DATA_ROOT_UNSAFE')
  })
})
