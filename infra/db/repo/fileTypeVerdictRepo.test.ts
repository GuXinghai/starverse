import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'
import { FileAssetRepo } from './fileAssetRepo'
import { FileTypeVerdictRepo } from './fileTypeVerdictRepo'
import type { FileTypeFingerprintJson } from '../types'
import type { FileTypeVerdict } from '../../../src/next/file-type'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('fileTypeVerdictRepo') ? describe : describe.skip

function loadSchema(db: BetterSqlite3.Database) {
  const schemaPath = path.resolve(process.cwd(), 'infra', 'db', 'schema.sql')
  db.exec(readFileSync(schemaPath, 'utf8'))
}

function ensureAsset(db: BetterSqlite3.Database, assetId = 'asset-1') {
  const repo = new FileAssetRepo(db)
  return repo.create({
    id: assetId,
    sha256: 'asset-sha',
    filename: 'sample.pdf',
    extension: 'pdf',
    mime: 'application/pdf',
    sizeBytes: 128,
    assetKind: 'document',
    sourceKind: 'local_upload',
    storageUri: `assets/original/${assetId}.pdf`,
    ingestStatus: 'stored',
  })
}

function buildVerdict(formatId: FileTypeVerdict['primary']['formatId']): FileTypeVerdict {
  return {
    primary: {
      formatId,
      kind: formatId === 'pdf' ? 'document' : 'text',
      confidence: 'high',
      reasonCodes: ['reason.magic_matched'],
      sourceCodeMeta: null,
    },
    conflicts: [],
    flags: [],
    evidence: [
      {
        source: 'magic',
        detectedFormatId: formatId,
        detectedMime: formatId === 'pdf' ? 'application/pdf' : 'text/plain',
        detectedExtension: formatId === 'pdf' ? 'pdf' : 'txt',
        confidence: 'high',
        reasonCodes: ['reason.magic_matched'],
        errorCode: null,
        note: null,
      },
    ],
    schemaVersion: 'v1',
    taxonomyVersion: 'v0-stage-b',
    detectionCost: 'low',
    fingerprint: null,
  }
}

function buildFingerprint(fullHashStatus: FileTypeFingerprintJson['fullHashStatus']): FileTypeFingerprintJson {
  return {
    algorithmVersion: 'sha256-v1',
    size: 128,
    modifiedTime: 1700000000000,
    headHash: 'headhash',
    headBytes: 65536,
    tailHash: 'tailhash',
    tailBytes: 65536,
    fullHash: fullHashStatus === 'computed' ? 'fullhash' : null,
    fullHashStatus,
  }
}

describeIfBetterSqlite('FileTypeVerdictRepo', () => {
  it('upserts and reads current verdict by asset id', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureAsset(db, 'asset-1')
    const repo = new FileTypeVerdictRepo(db)

    const first = repo.upsertCurrent({
      id: 'verdict-1',
      assetId: 'asset-1',
      verdict: buildVerdict('pdf'),
      primaryFormatId: 'pdf',
      primaryKind: 'document',
      confidenceLevel: 'high',
      versionInfo: {
        schemaVersion: 'v1',
        taxonomyVersion: 'v0-stage-b',
        taxonomyMapVersion: 'v0-stage-b',
        magicTableVersion: 'magic-v1',
        mergeRulesVersion: 'merge-v1',
        containerProbeVersion: 'container-v1',
        textProbeVersion: 'text-v1',
        magikaModelVersion: null,
      },
      fingerprintJson: buildFingerprint('computed'),
      createdAt: 101,
      updatedAt: 101,
    })

    expect(first.id).toBe('verdict-1')
    expect(first.isCurrent).toBe(true)
    expect(first.fingerprintJson.fullHash).toBe('fullhash')
    expect(first.fingerprintJson.fullHashStatus).toBe('computed')
    expect(first.verdict.primary.formatId).toBe('pdf')

    const current = repo.getCurrentByAssetId('asset-1')
    expect(current).toMatchObject({
      id: 'verdict-1',
      assetId: 'asset-1',
      primaryFormatId: 'pdf',
      primaryKind: 'document',
      confidenceLevel: 'high',
      isCurrent: true,
    })
  })

  it('keeps only one current verdict per asset when upserting repeatedly', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureAsset(db, 'asset-2')
    const repo = new FileTypeVerdictRepo(db)

    repo.upsertCurrent({
      id: 'verdict-a',
      assetId: 'asset-2',
      verdict: buildVerdict('pdf'),
      primaryFormatId: 'pdf',
      primaryKind: 'document',
      confidenceLevel: 'high',
      versionInfo: {
        schemaVersion: 'v1',
        taxonomyVersion: 'v0-stage-b',
        taxonomyMapVersion: 'v0-stage-b',
        magicTableVersion: 'magic-v1',
        mergeRulesVersion: 'merge-v1',
        containerProbeVersion: 'container-v1',
        textProbeVersion: 'text-v1',
        magikaModelVersion: null,
      },
      fingerprintJson: buildFingerprint('not_computed'),
      createdAt: 201,
      updatedAt: 201,
    })

    repo.upsertCurrent({
      id: 'verdict-b',
      assetId: 'asset-2',
      verdict: buildVerdict('plain_text'),
      primaryFormatId: 'plain_text',
      primaryKind: 'text',
      confidenceLevel: 'medium',
      versionInfo: {
        schemaVersion: 'v1',
        taxonomyVersion: 'v0-stage-b',
        taxonomyMapVersion: 'v0-stage-b',
        magicTableVersion: 'magic-v1',
        mergeRulesVersion: 'merge-v1',
        containerProbeVersion: 'container-v1',
        textProbeVersion: 'text-v1',
        magikaModelVersion: null,
      },
      fingerprintJson: buildFingerprint('failed'),
      createdAt: 202,
      updatedAt: 202,
    })

    const current = repo.getCurrentByAssetId('asset-2')
    expect(current?.id).toBe('verdict-b')
    expect(current?.primaryFormatId).toBe('plain_text')
    expect(current?.fingerprintJson.fullHashStatus).toBe('failed')

    const rows = db.prepare(`
      SELECT id, is_current AS isCurrent, stale_reason AS staleReason
      FROM file_type_verdicts
      WHERE asset_id = 'asset-2'
      ORDER BY created_at ASC
    `).all() as Array<{ id: string; isCurrent: number; staleReason: string | null }>
    expect(rows).toEqual([
      { id: 'verdict-a', isCurrent: 0, staleReason: 'superseded' },
      { id: 'verdict-b', isCurrent: 1, staleReason: null },
    ])
  })

  it('marks current verdict stale and supports delete by asset id', () => {
    const db = new BetterSqlite3(':memory:')
    loadSchema(db)
    ensureAsset(db, 'asset-3')
    const repo = new FileTypeVerdictRepo(db)

    repo.upsertCurrent({
      id: 'verdict-c',
      assetId: 'asset-3',
      verdict: buildVerdict('pdf'),
      primaryFormatId: 'pdf',
      primaryKind: 'document',
      confidenceLevel: 'high',
      versionInfo: {
        schemaVersion: 'v1',
        taxonomyVersion: 'v0-stage-b',
        taxonomyMapVersion: 'v0-stage-b',
        magicTableVersion: 'magic-v1',
        mergeRulesVersion: 'merge-v1',
        containerProbeVersion: 'container-v1',
        textProbeVersion: 'text-v1',
        magikaModelVersion: null,
      },
      fingerprintJson: buildFingerprint('not_applicable'),
      createdAt: 301,
      updatedAt: 301,
    })

    expect(repo.markStaleByAssetId({ assetId: 'asset-3', staleReason: 'asset_updated', updatedAt: 302 })).toEqual({
      ok: true,
      updated: 1,
    })
    expect(repo.getCurrentByAssetId('asset-3')).toBeNull()

    const stale = db.prepare(`
      SELECT stale_reason AS staleReason, is_current AS isCurrent
      FROM file_type_verdicts
      WHERE id = 'verdict-c'
      LIMIT 1
    `).get() as { staleReason: string; isCurrent: number }
    expect(stale).toEqual({ staleReason: 'asset_updated', isCurrent: 0 })

    expect(repo.deleteByAssetId('asset-3')).toEqual({ ok: true, deleted: 1 })
    const remaining = db.prepare(`SELECT COUNT(*) AS count FROM file_type_verdicts WHERE asset_id = 'asset-3'`).get() as { count: number }
    expect(remaining.count).toBe(0)
  })
})
