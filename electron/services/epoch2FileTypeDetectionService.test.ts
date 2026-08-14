import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { EnginePluginRegistryRepo } from '../../infra/db/repo/enginePluginRegistryRepo'
import { FileTypeDetectionV2Repo } from '../../infra/db/repo/fileTypeDetectionV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { resolveEpoch2WorkspaceLayout } from '../data-epoch/rootManifest'
import { Epoch2FileTypeDetectionService, type FileTypeDetectionUpdatedEventV2 } from './epoch2FileTypeDetectionService'

function fixture(options: Readonly<{ disabled?: boolean }> = {}) {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  const bytes = new TextEncoder().encode('hello from Starverse')
  const assets = new AttachmentAssetV2Repo(db, () => 10)
  const detections = new FileTypeDetectionV2Repo(db, () => 20)
  const projection = runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, context => {
    const blob = assets.recordBlobFromBytesInAuthorityTransaction(context, bytes, 'text/plain')
    assets.createImportedAssetRevisionInAuthorityTransaction(context, {
      assetId: 'asset:1', assetRevisionId: 'revision:1', assetKind: 'file', filename: 'note.txt', blob,
    })
    return detections.createPendingInAuthorityTransaction(context, {
      assetRevisionId: 'revision:1', assetSha256: blob.sha256.value, attemptId: 'attempt:1',
    })
  })
  if (options.disabled) {
    new EnginePluginRegistryRepo(db).insert({
      engineId: 'magika', displayName: 'Magika', pluginVersion: '0.2.0', manifestSchemaVersion: '1',
      manifestHash: 'a'.repeat(64), runtimeKind: 'pure_js', modelVersion: 'standard_v3_3',
      installState: 'installed', enabled: false, healthStatus: 'healthy', installRootKind: 'managed_root',
      installRef: 'magika', installedAt: 1, updatedAt: 1, lastVerifiedAt: 1, lastHealthCheckAt: 1,
    })
  }
  let reads = 0
  let spawns = 0
  let resolveEvent!: (event: FileTypeDetectionUpdatedEventV2) => void
  const event = new Promise<FileTypeDetectionUpdatedEventV2>(resolve => { resolveEvent = resolve })
  const service = new Epoch2FileTypeDetectionService({
    db,
    layout: resolveEpoch2WorkspaceLayout({
      appDataRoot: path.join(os.tmpdir(), 'starverse-file-detection-test'), homeRoot: os.homedir(),
    }),
    attachmentBlobStore: {
      readRevisionBytes: () => { reads += 1; return new Uint8Array(bytes) },
    } as never,
    magikaProcessRunner: async () => {
      spawns += 1
      throw new Error('runner must not be called')
    },
    notify: resolveEvent,
  })
  return { db, detections, projection, service, event, counts: () => ({ reads, spawns }) }
}

describe('Epoch2FileTypeDetectionService', () => {
  it('commits a ready basic verdict without spawning when Magika is not installed', async () => {
    const value = fixture()
    try {
      value.service.schedule(value.projection, 'conversation:1')
      await expect(value.event).resolves.toMatchObject({ status: 'ready', revision: 2 })
      expect(value.detections.get('revision:1')).toMatchObject({
        status: 'ready', warnings: [{ code: 'MAGIKA_NOT_INSTALLED', detail: null }],
      })
      expect(value.counts()).toEqual({ reads: 1, spawns: 0 })
    } finally { value.db.close() }
  })

  it('does not spawn when disabled and de-duplicates the same pending attempt', async () => {
    const value = fixture({ disabled: true })
    try {
      value.service.schedule(value.projection, null)
      value.service.schedule(value.projection, null)
      await value.event
      expect(value.detections.get('revision:1')).toMatchObject({
        status: 'ready', warnings: [{ code: 'MAGIKA_DISABLED', detail: null }],
      })
      expect(value.counts()).toEqual({ reads: 1, spawns: 0 })
    } finally { value.db.close() }
  })
})
