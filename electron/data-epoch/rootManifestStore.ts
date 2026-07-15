import fs from 'node:fs'
import path from 'node:path'
import {
  createEpoch2RootManifest,
  decodeAndVerifyEpoch2RootManifest,
  type Epoch2RootManifest,
  type Epoch2WorkspaceLayout,
} from './rootManifest'

function assertNoReparsePath(value: string): void {
  const parsedRoot = path.parse(value).root
  let current = parsedRoot
  for (const segment of path.relative(parsedRoot, value).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) continue
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('EPOCH2_ROOT_MANIFEST_REPARSE_POINT')
  }
}

export function writeEpoch2RootManifestAtomic(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  manifest: Epoch2RootManifest
}>): void {
  const verified = createEpoch2RootManifest({ layout: input.layout })
  if (JSON.stringify(verified) !== JSON.stringify(input.manifest)) throw new Error('EPOCH2_ROOT_MANIFEST_CONFLICT')
  const manifestPath = input.layout.transitionManifestPath
  const directory = path.dirname(manifestPath)
  assertNoReparsePath(input.layout.productRoot)
  fs.mkdirSync(directory, { recursive: true })
  assertNoReparsePath(directory)
  if (fs.existsSync(manifestPath)) {
    assertNoReparsePath(manifestPath)
    const current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    if (JSON.stringify(current) !== JSON.stringify(input.manifest)) throw new Error('EPOCH2_ROOT_MANIFEST_CONFLICT')
    return
  }
  const pending = `${manifestPath}.pending`
  if (fs.existsSync(pending)) fs.unlinkSync(pending)
  let descriptor: number | null = null
  try {
    fs.writeFileSync(pending, `${JSON.stringify(input.manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    descriptor = fs.openSync(pending, 'r+')
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = null
    fs.renameSync(pending, manifestPath)
    assertNoReparsePath(manifestPath)
  } catch (error) {
    if (descriptor !== null) fs.closeSync(descriptor)
    try { fs.unlinkSync(pending) } catch { /* uncommitted marker cleanup */ }
    throw error
  }
}

export function readAndVerifyEpoch2RootManifest(input: Readonly<{
  layout: Epoch2WorkspaceLayout
}>): Epoch2RootManifest {
  createEpoch2RootManifest({ layout: input.layout })
  const manifestPath = input.layout.transitionManifestPath
  assertNoReparsePath(input.layout.transitionRoot)
  if (!fs.existsSync(manifestPath)) throw new Error('EPOCH2_ROOT_MANIFEST_MISSING')
  assertNoReparsePath(manifestPath)
  return decodeAndVerifyEpoch2RootManifest({
    value: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
    layout: input.layout,
  })
}
