import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  type Epoch2WorkspaceLayout,
} from './rootManifest'
import { readAndVerifyEpoch2RootManifest } from './rootManifestStore'
import type { Win32EpochRootLease } from './win32EpochRootLease'

type OwnedEntry = Readonly<{ path: string; identityDigest: string }>

export type Epoch2OwnedDeletePlan = Readonly<{
  ownedRoot: string
  target: string
  targetDigest: string
  ownershipManifestDigest: string
  exists: boolean
  entriesPostOrder: readonly OwnedEntry[]
}>

export class Epoch2OwnedDeleteError extends Error {
  constructor(readonly code:
    | 'EPOCH2_DELETE_ROOT_UNSAFE'
    | 'EPOCH2_DELETE_TARGET_OUTSIDE_ROOT'
    | 'EPOCH2_DELETE_TARGET_IS_ROOT'
    | 'EPOCH2_DELETE_PROTECTED_PATH'
    | 'EPOCH2_DELETE_REPARSE_POINT'
    | 'EPOCH2_DELETE_PATH_CHANGED'
    | 'EPOCH2_DELETE_OWNERSHIP_INVALID') {
    super(code)
    this.name = 'Epoch2OwnedDeleteError'
  }
}

function key(value: string): string {
  const resolved = path.resolve(value).normalize('NFC')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isWithin(parentValue: string, childValue: string): boolean {
  const parent = key(parentValue)
  const child = key(childValue)
  const relative = path.relative(parent, child)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export function digestEpoch2Path(value: string): string {
  return createHash('sha256').update(key(value), 'utf8').digest('hex')
}

function assertNotReparsePoint(value: string): fs.Stats {
  const stats = fs.lstatSync(value)
  if (stats.isSymbolicLink()) throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_REPARSE_POINT')
  return stats
}

function identityDigest(value: string, stats: fs.Stats): string {
  return createHash('sha256').update(JSON.stringify({
    path: key(value),
    dev: stats.dev,
    ino: stats.ino,
    mode: stats.mode,
    birthtimeMs: stats.birthtimeMs,
    directory: stats.isDirectory(),
    ...(stats.isFile() ? { size: stats.size, mtimeMs: stats.mtimeMs } : {}),
  }), 'utf8').digest('hex')
}

function inspectAncestors(ownedRoot: string, target: string): void {
  const parsedRoot = path.parse(ownedRoot).root
  let rootCursor = parsedRoot
  for (const segment of path.relative(parsedRoot, ownedRoot).split(path.sep).filter(Boolean)) {
    rootCursor = path.join(rootCursor, segment)
    assertNotReparsePoint(rootCursor)
  }
  const relative = path.relative(ownedRoot, target)
  let current = ownedRoot
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (fs.existsSync(current)) assertNotReparsePoint(current)
  }
}

function inspectTreePostOrder(target: string, output: OwnedEntry[]): void {
  const stats = assertNotReparsePoint(target)
  if (stats.isDirectory()) {
    const children = fs.readdirSync(target).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    for (const child of children) inspectTreePostOrder(path.join(target, child), output)
  }
  output.push(Object.freeze({ path: target, identityDigest: identityDigest(target, stats) }))
}

function verifiedOwnedRoot(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  rootScope: 'product' | 'epoch'
}>): Readonly<{ ownedRoot: string; manifestDigest: string }> {
  try {
    const manifest = readAndVerifyEpoch2RootManifest({
      layout: input.layout,
      lease: input.lease,
    })
    return {
      ownedRoot: input.rootScope === 'product' ? input.layout.productRoot : input.layout.epochRoot,
      manifestDigest: createHash('sha256').update(JSON.stringify(manifest), 'utf8').digest('hex'),
    }
  } catch {
    throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_OWNERSHIP_INVALID')
  }
}

export function inspectEpoch2OwnedDeleteTarget(input: Readonly<{
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  rootScope: 'product' | 'epoch'
  target: string
  protectedPaths: readonly string[]
}>): Epoch2OwnedDeletePlan {
  const authorization = verifiedOwnedRoot(input)
  const ownedRoot = path.resolve(authorization.ownedRoot)
  const target = path.resolve(input.target)
  if (path.parse(ownedRoot).root === ownedRoot || !fs.existsSync(ownedRoot) ||
      (process.platform === 'win32' && ownedRoot.startsWith('\\\\'))) {
    throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_ROOT_UNSAFE')
  }
  if (key(target) === key(ownedRoot)) throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_TARGET_IS_ROOT')
  if (!isWithin(ownedRoot, target)) throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_TARGET_OUTSIDE_ROOT')
  const protectedPaths = [
    ...input.protectedPaths,
    input.layout.transitionRoot,
    input.layout.transitionManifestPath,
    input.layout.lockPath,
    input.layout.journalPath,
  ]
  for (const protectedPath of protectedPaths) {
    if (key(target) === key(protectedPath) || isWithin(target, protectedPath) || isWithin(protectedPath, target)) {
      throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_PROTECTED_PATH')
    }
  }
  inspectAncestors(ownedRoot, target)
  const entriesPostOrder: OwnedEntry[] = []
  if (fs.existsSync(target)) inspectTreePostOrder(target, entriesPostOrder)
  return Object.freeze({
    ownedRoot,
    target,
    targetDigest: digestEpoch2Path(target),
    ownershipManifestDigest: authorization.manifestDigest,
    exists: entriesPostOrder.length > 0,
    entriesPostOrder: Object.freeze(entriesPostOrder),
  })
}

export function assertEpoch2OwnedDeletePlanFresh(input: Readonly<{
  plan: Epoch2OwnedDeletePlan
  layout: Epoch2WorkspaceLayout
  lease: Win32EpochRootLease
  rootScope: 'product' | 'epoch'
}>): void {
  const plan = input.plan
  const authorization = verifiedOwnedRoot(input)
  if (digestEpoch2Path(plan.target) !== plan.targetDigest || key(plan.target) === key(plan.ownedRoot) ||
      authorization.manifestDigest !== plan.ownershipManifestDigest ||
      key(authorization.ownedRoot) !== key(plan.ownedRoot) || !isWithin(plan.ownedRoot, plan.target) ||
      plan.entriesPostOrder.some((entry) => key(entry.path) !== key(plan.target) && !isWithin(plan.target, entry.path))) {
    throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_PATH_CHANGED')
  }
  const freshEntries: OwnedEntry[] = []
  if (fs.existsSync(plan.target)) inspectTreePostOrder(plan.target, freshEntries)
  if (JSON.stringify(freshEntries) !== JSON.stringify(plan.entriesPostOrder)) {
    throw new Epoch2OwnedDeleteError('EPOCH2_DELETE_PATH_CHANGED')
  }
}
