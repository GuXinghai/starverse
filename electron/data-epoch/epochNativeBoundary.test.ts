import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function productionTypeScriptFiles(root: string): string[] {
  const output: string[] = []
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const value = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(value)
      else if (entry.isFile() && entry.name.endsWith('.ts') &&
          !entry.name.endsWith('.test.ts')) output.push(value)
    }
  }
  visit(root)
  return output
}

describe('epoch native authority boundary', () => {
  it('keeps raw addon and config mutation methods inside the single authority module', () => {
    const authorityFile = path.join(
      repositoryRoot,
      'electron',
      'data-epoch',
      'win32EpochRootLease.ts',
    )
    const violations: string[] = []
    for (const rootName of ['electron', 'src', 'infra']) {
      for (const file of productionTypeScriptFiles(path.join(repositoryRoot, rootName))) {
        if (file === authorityFile) continue
        const source = fs.readFileSync(file, 'utf8')
        if (/starverse_epoch_win32|\.readLegacyConfig\s*\(|\.replaceLegacyConfig\s*\(|\.inspectLegacyConfigBackups\s*\(|\.deleteLegacyConfigBackups\s*\(|\.ensureEpochRootMarker\s*\(|\.verifyEpochRootMarker\s*\(/u.test(source)) {
          violations.push(path.relative(repositoryRoot, file))
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps the coordinator core unactivated and independent of legacy runtime owners', () => {
    const coordinatorFile = path.join(
      repositoryRoot,
      'electron',
      'data-epoch',
      'dataEpochCoordinatorCore.ts',
    )
    const coordinatorSource = fs.readFileSync(coordinatorFile, 'utf8')
    expect(coordinatorSource).not.toMatch(
      /electron-store|providerCredentialService|compatibleCredentialService|infra\/db|workerManager|electron\/main|ipc|BrowserWindow/u,
    )

    const consumers: string[] = []
    for (const rootName of ['electron', 'src', 'infra']) {
      for (const file of productionTypeScriptFiles(path.join(repositoryRoot, rootName))) {
        if (file === coordinatorFile) continue
        if (fs.readFileSync(file, 'utf8').includes('dataEpochCoordinatorCore')) {
          consumers.push(path.relative(repositoryRoot, file))
        }
      }
    }
    expect(consumers).toEqual([path.join('electron', 'data-epoch', 'epoch2CommittedBootstrap.ts')])
  })

  it('keeps session reset narrow and credential records free of legacy compatibility', () => {
    const sessionResetFile = path.join(
      repositoryRoot,
      'electron',
      'data-epoch',
      'defaultSessionReset.ts',
    )
    const credentialRecordFile = path.join(
      repositoryRoot,
      'electron',
      'credentials',
      'epoch2ProviderCredentialRecord.ts',
    )
    const sessionSource = fs.readFileSync(sessionResetFile, 'utf8')
    const credentialSource = fs.readFileSync(credentialRecordFile, 'utf8')
    expect(sessionSource).not.toMatch(/fromPartition|\.clearData\s*\(|clearStorageData\s*\(\s*\)/u)
    expect(credentialSource).not.toMatch(
      /electron-store|plaintext_fallback|Legacy|migrat|getLegacyStoreValue|credentialScope/u,
    )

    const sessionConsumers: string[] = []
    for (const rootName of ['electron', 'src', 'infra']) {
      for (const file of productionTypeScriptFiles(path.join(repositoryRoot, rootName))) {
        if (file === sessionResetFile) continue
        if (fs.readFileSync(file, 'utf8').includes('defaultSessionReset')) {
          sessionConsumers.push(path.relative(repositoryRoot, file))
        }
      }
    }
    expect(sessionConsumers).toEqual([])
  })

  it('limits epoch-root creation to the dormant database-phase coordinator', () => {
    const rootCoordinatorFile = path.join(
      repositoryRoot,
      'electron',
      'data-epoch',
      'epochRootCoordinatorCore.ts',
    )
    const source = fs.readFileSync(rootCoordinatorFile, 'utf8')
    expect(source).not.toMatch(/better-sqlite3|schemaComposerV2|workerManager|electron\/main|ipc|BrowserWindow/u)
    const consumers: string[] = []
    for (const rootName of ['electron', 'src', 'infra']) {
      for (const file of productionTypeScriptFiles(path.join(repositoryRoot, rootName))) {
        if (file === rootCoordinatorFile) continue
        if (fs.readFileSync(file, 'utf8').includes('epochRootCoordinatorCore')) {
          consumers.push(path.relative(repositoryRoot, file))
        }
      }
    }
    expect(consumers).toEqual([path.join('electron', 'data-epoch', 'epochDatabaseCoordinatorCore.ts')])

    const databaseCoordinatorFile = path.join(
      repositoryRoot,
      'electron',
      'data-epoch',
      'epochDatabaseCoordinatorCore.ts',
    )
    const databaseCoordinatorSource = fs.readFileSync(databaseCoordinatorFile, 'utf8')
    expect(databaseCoordinatorSource).not.toMatch(/workerManager|electron\/main|ipc|BrowserWindow/u)
    const databaseCoordinatorConsumers: string[] = []
    for (const rootName of ['electron', 'src', 'infra']) {
      for (const file of productionTypeScriptFiles(path.join(repositoryRoot, rootName))) {
        if (file === databaseCoordinatorFile) continue
        if (fs.readFileSync(file, 'utf8').includes('epochDatabaseCoordinatorCore')) {
          databaseCoordinatorConsumers.push(path.relative(repositoryRoot, file))
        }
      }
    }
    expect(databaseCoordinatorConsumers).toEqual([
      path.join('electron', 'data-epoch', 'epoch2CommittedBootstrap.ts'),
    ])

    const bootstrapFile = path.join(repositoryRoot, 'electron', 'data-epoch', 'epoch2CommittedBootstrap.ts')
    const bootstrapSource = fs.readFileSync(bootstrapFile, 'utf8')
    expect(bootstrapSource).not.toMatch(/workerManager|electron\/main|ipc|BrowserWindow|chat\.db/u)
    const bootstrapConsumers = productionTypeScriptFiles(path.join(repositoryRoot, 'electron'))
      .filter((file) => file !== bootstrapFile)
      .filter((file) => fs.readFileSync(file, 'utf8').includes('epoch2CommittedBootstrap'))
      .map((file) => path.relative(repositoryRoot, file))
    expect(bootstrapConsumers).toEqual([
      path.join('electron', 'bootstrap', 'epoch2ApplicationRuntime.ts'),
      path.join('electron', 'ipc', 'generationV2IpcRegistration.ts'),
    ])
  })
})
