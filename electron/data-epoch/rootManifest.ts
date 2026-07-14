import { createHash } from 'node:crypto'
import path from 'node:path'

export const STARVERSE_DATA_EPOCH = 2 as const
export const STARVERSE_PRODUCT_DIRECTORY = 'Starverse' as const
export const STARVERSE_EPOCH_DIRECTORY = 'epoch-2' as const
export const STARVERSE_EPOCH_DATABASE = 'starverse.db' as const
const EPOCH2_LAYOUT_BRAND: unique symbol = Symbol('starverse.epoch2.workspace-layout')

export type Epoch2WorkspaceLayout = Readonly<{
  [EPOCH2_LAYOUT_BRAND]: true
  appDataRoot: string
  productRoot: string
  workspaceRoot: string
  epochRoot: string
  databasePath: string
  markerPath: string
  transitionRoot: string
  transitionManifestPath: string
  lockPath: string
  journalPath: string
  assetsRoot: string
  debugRoot: string
  logsRoot: string
  tempRoot: string
  runtimesRoot: string
  pluginsRoot: string
}>

export type Epoch2RootManifest = Readonly<{
  schemaVersion: 1
  dataEpoch: typeof STARVERSE_DATA_EPOCH
  applicationId: string
  productName: typeof STARVERSE_PRODUCT_DIRECTORY
  rootId: string
}>

export class Epoch2RootManifestError extends Error {
  constructor(readonly code:
    | 'EPOCH2_APPLICATION_ID_REQUIRED'
    | 'EPOCH2_APPLICATION_ID_PLACEHOLDER'
    | 'EPOCH2_APP_DATA_ROOT_UNSAFE'
    | 'EPOCH2_ROOT_MANIFEST_INVALID'
    | 'EPOCH2_ROOT_MANIFEST_MISMATCH') {
    super(code)
    this.name = 'Epoch2RootManifestError'
  }
}

function requiredApplicationId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Epoch2RootManifestError('EPOCH2_APPLICATION_ID_REQUIRED')
  }
  const applicationId = value.trim()
  if (/yourapp|placeholder|example|changeme|todo/iu.test(applicationId)) {
    throw new Epoch2RootManifestError('EPOCH2_APPLICATION_ID_PLACEHOLDER')
  }
  return applicationId
}

function canonicalPathKey(value: string): string {
  const resolved = path.resolve(value).normalize('NFC')
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function rootId(applicationId: string, epochRoot: string): string {
  return createHash('sha256')
    .update(`starverse\0${applicationId}\0${canonicalPathKey(epochRoot)}`, 'utf8')
    .digest('hex')
}

function unsafeAppDataRoot(appDataRoot: string, protectedRoot: string | undefined): boolean {
  if (!protectedRoot) return false
  const relative = path.relative(path.resolve(protectedRoot), appDataRoot)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function pathsOverlap(left: string, right: string): boolean {
  const leftKey = canonicalPathKey(left)
  const rightKey = canonicalPathKey(right)
  if (leftKey === rightKey) return true
  const leftToRight = path.relative(leftKey, rightKey)
  const rightToLeft = path.relative(rightKey, leftKey)
  return (leftToRight !== '..' && !leftToRight.startsWith(`..${path.sep}`) && !path.isAbsolute(leftToRight)) ||
    (rightToLeft !== '..' && !rightToLeft.startsWith(`..${path.sep}`) && !path.isAbsolute(rightToLeft))
}

export function resolveEpoch2WorkspaceLayout(input: Readonly<{
  appDataRoot: unknown
  homeRoot: string
  repositoryRoot?: string
}>): Epoch2WorkspaceLayout {
  const appDataRootValue = input.appDataRoot
  if (typeof appDataRootValue !== 'string' || appDataRootValue.trim() === '') {
    throw new Epoch2RootManifestError('EPOCH2_APP_DATA_ROOT_UNSAFE')
  }
  const appDataRoot = path.resolve(appDataRootValue)
  if (path.parse(appDataRoot).root === appDataRoot ||
      (process.platform === 'win32' && appDataRoot.startsWith('\\\\')) ||
      canonicalPathKey(appDataRoot) === canonicalPathKey(input.homeRoot) ||
      unsafeAppDataRoot(appDataRoot, input.repositoryRoot)) {
    throw new Epoch2RootManifestError('EPOCH2_APP_DATA_ROOT_UNSAFE')
  }
  const productRoot = path.join(appDataRoot, STARVERSE_PRODUCT_DIRECTORY)
  const workspaceRoot = path.join(productRoot, 'workspace')
  const epochRoot = path.join(workspaceRoot, STARVERSE_EPOCH_DIRECTORY)
  const transitionRoot = path.join(productRoot, '.epoch-transition')
  const derivedRoots = [productRoot, workspaceRoot, epochRoot, transitionRoot]
  if (derivedRoots.some((candidate) =>
    canonicalPathKey(candidate) === canonicalPathKey(input.homeRoot) ||
    unsafeAppDataRoot(input.homeRoot, candidate) ||
    (input.repositoryRoot ? pathsOverlap(candidate, input.repositoryRoot) : false))) {
    throw new Epoch2RootManifestError('EPOCH2_APP_DATA_ROOT_UNSAFE')
  }
  return Object.freeze({
    [EPOCH2_LAYOUT_BRAND]: true as const,
    appDataRoot,
    productRoot,
    workspaceRoot,
    epochRoot,
    databasePath: path.join(epochRoot, STARVERSE_EPOCH_DATABASE),
    markerPath: path.join(epochRoot, 'root-manifest.json'),
    transitionRoot,
    transitionManifestPath: path.join(transitionRoot, 'root-manifest.json'),
    lockPath: path.join(transitionRoot, 'epoch-transition.lock'),
    journalPath: path.join(transitionRoot, 'epoch-transition.journal.json'),
    assetsRoot: path.join(epochRoot, 'assets'),
    debugRoot: path.join(epochRoot, 'debug'),
    logsRoot: path.join(epochRoot, 'logs'),
    tempRoot: path.join(epochRoot, 'temp'),
    runtimesRoot: path.join(epochRoot, 'runtimes'),
    pluginsRoot: path.join(epochRoot, 'plugins'),
  })
}

function assertDerivedLayout(layout: Epoch2WorkspaceLayout): void {
  if (layout[EPOCH2_LAYOUT_BRAND] !== true) throw new Epoch2RootManifestError('EPOCH2_APP_DATA_ROOT_UNSAFE')
  const expectedProductRoot = path.join(layout.appDataRoot, STARVERSE_PRODUCT_DIRECTORY)
  const expectedWorkspaceRoot = path.join(expectedProductRoot, 'workspace')
  const expectedEpochRoot = path.join(expectedWorkspaceRoot, STARVERSE_EPOCH_DIRECTORY)
  const expectedTransitionRoot = path.join(expectedProductRoot, '.epoch-transition')
  const expected: Readonly<Record<string, string>> = {
    productRoot: expectedProductRoot,
    workspaceRoot: expectedWorkspaceRoot,
    epochRoot: expectedEpochRoot,
    databasePath: path.join(expectedEpochRoot, STARVERSE_EPOCH_DATABASE),
    markerPath: path.join(expectedEpochRoot, 'root-manifest.json'),
    transitionRoot: expectedTransitionRoot,
    transitionManifestPath: path.join(expectedTransitionRoot, 'root-manifest.json'),
    lockPath: path.join(expectedTransitionRoot, 'epoch-transition.lock'),
    journalPath: path.join(expectedTransitionRoot, 'epoch-transition.journal.json'),
    assetsRoot: path.join(expectedEpochRoot, 'assets'),
    debugRoot: path.join(expectedEpochRoot, 'debug'),
    logsRoot: path.join(expectedEpochRoot, 'logs'),
    tempRoot: path.join(expectedEpochRoot, 'temp'),
    runtimesRoot: path.join(expectedEpochRoot, 'runtimes'),
    pluginsRoot: path.join(expectedEpochRoot, 'plugins'),
  }
  for (const [field, value] of Object.entries(expected)) {
    if (canonicalPathKey(layout[field as keyof typeof layout] as string) !== canonicalPathKey(value)) {
      throw new Epoch2RootManifestError('EPOCH2_APP_DATA_ROOT_UNSAFE')
    }
  }
}

export function createEpoch2RootManifest(input: Readonly<{
  applicationId: unknown
  layout: Epoch2WorkspaceLayout
}>): Epoch2RootManifest {
  assertDerivedLayout(input.layout)
  const applicationId = requiredApplicationId(input.applicationId)
  return Object.freeze({
    schemaVersion: 1,
    dataEpoch: STARVERSE_DATA_EPOCH,
    applicationId,
    productName: STARVERSE_PRODUCT_DIRECTORY,
    rootId: rootId(applicationId, input.layout.epochRoot),
  })
}

export function decodeAndVerifyEpoch2RootManifest(input: Readonly<{
  value: unknown
  expectedApplicationId: unknown
  layout: Epoch2WorkspaceLayout
}>): Epoch2RootManifest {
  const expected = createEpoch2RootManifest({
    applicationId: input.expectedApplicationId,
    layout: input.layout,
  })
  if (!input.value || typeof input.value !== 'object' || Array.isArray(input.value)) {
    throw new Epoch2RootManifestError('EPOCH2_ROOT_MANIFEST_INVALID')
  }
  const value = input.value as Record<string, unknown>
  const keys = Object.keys(value).sort()
  if (keys.join('\0') !== ['applicationId', 'dataEpoch', 'productName', 'rootId', 'schemaVersion'].sort().join('\0')) {
    throw new Epoch2RootManifestError('EPOCH2_ROOT_MANIFEST_INVALID')
  }
  if (value.schemaVersion !== 1 || value.dataEpoch !== STARVERSE_DATA_EPOCH ||
      value.productName !== STARVERSE_PRODUCT_DIRECTORY || typeof value.applicationId !== 'string' ||
      typeof value.rootId !== 'string') {
    throw new Epoch2RootManifestError('EPOCH2_ROOT_MANIFEST_INVALID')
  }
  if (value.applicationId !== expected.applicationId || value.rootId !== expected.rootId) {
    throw new Epoch2RootManifestError('EPOCH2_ROOT_MANIFEST_MISMATCH')
  }
  return expected
}
