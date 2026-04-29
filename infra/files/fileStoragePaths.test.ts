import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ensureStorageLayout,
  getDerivativePath,
  getDerivativeStorageUri,
  getOriginalAssetPath,
  getOriginalAssetStorageUri,
} from './fileStoragePaths'

describe('fileStoragePaths', () => {
  it('generates stable bucketed original asset paths', () => {
    expect(getOriginalAssetStorageUri({ assetId: 'ab-asset-1', extension: '.PNG' })).toBe(
      'assets/original/ab/ab-asset-1.png'
    )
  })

  it('physically separates original assets and derivatives', () => {
    const rootDir = path.join(os.tmpdir(), 'starverse-file-layout')

    expect(getOriginalAssetPath({ rootDir, assetId: 'asset-1', extension: 'pdf' })).toContain(
      path.join('assets', 'original')
    )
    expect(getDerivativePath({ rootDir, parentAssetId: 'asset-1', derivativeId: 'd1', extension: 'txt' })).toContain(
      path.join('assets', 'derived', 'asset-1')
    )
    expect(getDerivativeStorageUri({ parentAssetId: 'asset-1', derivativeId: 'd1', extension: 'txt' })).toBe(
      'assets/derived/asset-1/d1.txt'
    )
  })

  it('creates the base storage layout without creating asset files', () => {
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'starverse-file-layout-'))
    try {
      ensureStorageLayout(rootDir)
      expect(existsSync(path.join(rootDir, 'assets', 'original'))).toBe(true)
      expect(existsSync(path.join(rootDir, 'assets', 'derived'))).toBe(true)
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})

