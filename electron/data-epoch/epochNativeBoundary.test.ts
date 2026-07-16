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
        if (/starverse_epoch_win32|\.readLegacyConfig\s*\(|\.replaceLegacyConfig\s*\(|\.inspectLegacyConfigBackups\s*\(|\.deleteLegacyConfigBackups\s*\(/u.test(source)) {
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
    expect(consumers).toEqual([])
  })
})
