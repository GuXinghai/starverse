import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { FileSelectionGrantStore } from './fileSelectionGrants'
import { frameUrlFromIpcEvent, isMainFrameIpcEvent, senderIdFromIpcEvent } from './fileSelectionGrants'
import type { RegisterInvoke } from './types'

export const PACKAGED_TEST_DOCX_FIXTURE_AUTHORITY_V1 = 'packaged_test_docx_fixture_authority_v1'
export const PACKAGED_TEST_DOCX_FIXTURE_CHANNEL_V1 = 'packaged-smoke:issue-docx-fixture-grant-v1'
const MARKER_FILENAME = '.starverse-packaged-test-authority-v1.json'
const FIXTURE_ID = 'packaged-docx-pdf-v1'
const FIXTURE_FILENAME = 'starverse-packaged-docx-pdf-v1.docx'
const FIXTURE_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const FIXTURE_SIZE_BYTES = 1434
const FIXTURE_SHA256 = '7d68acb8d46422123d6bff9ca37154b7d2a05efb081eeef4491787dec90d57e4'
const MARKER_MAX_AGE_MS = 10 * 60 * 1000

type Marker = Readonly<{ schemaVersion: 1; nonce: string; createdAtMs: number; expiresAtMs: number; userDataDir: string;
  fixture: Readonly<{ fixtureId: typeof FIXTURE_ID; filename: typeof FIXTURE_FILENAME; mime: typeof FIXTURE_MIME; sizeBytes: typeof FIXTURE_SIZE_BYTES; sha256: typeof FIXTURE_SHA256 }> }>

export type PackagedTestDocxFixtureAuthorityV1 = Readonly<{
  register: (mainWindowSenderId: () => number | null) => readonly string[]
  dispose: () => Promise<void>
}>

type PackagedFixtureGrantLifecycleWindow = Readonly<{
  webContents: Readonly<{
    id: number
    on: (event: 'will-navigate', listener: () => void) => unknown
  }>
  once: (event: 'closed', listener: () => void) => unknown
}>

/**
 * File-selection grants are sender-bound, but a renderer navigation must also
 * end their lifetime.  Keep this at the packaged fixture boundary so the test
 * authority cannot accidentally outlive its original main frame.
 */
export function bindPackagedTestDocxFixtureGrantInvalidationV1(input: Readonly<{
  window: PackagedFixtureGrantLifecycleWindow
  fileSelectionGrants: FileSelectionGrantStore
}>): void {
  const invalidate = () => input.fileSelectionGrants.invalidateSender(input.window.webContents.id)
  input.window.webContents.on('will-navigate', invalidate)
  input.window.once('closed', invalidate)
}

export async function createPackagedTestDocxFixtureAuthorityV1(input: Readonly<{
  isPackaged: boolean
  env: NodeJS.ProcessEnv
  argv: readonly string[]
  userDataRoot: string
  tempRoot: string
  repositoryRoot: string
  registerInvoke: RegisterInvoke
  fileSelectionGrants: FileSelectionGrantStore
  nowMs?: () => number
}>): Promise<PackagedTestDocxFixtureAuthorityV1 | null> {
  const nowMs = input.nowMs ?? Date.now
  const nonce = String(input.env.SV_PACKAGED_TEST_AUTHORITY_NONCE ?? '').trim()
  if (!baseGate(input, nonce)) return null
  const root = await verifiedRoot(input.userDataRoot, input.repositoryRoot)
  if (root === null) return null
  const marker = await readVerifiedMarker(root, nonce, input.argv, nowMs())
  if (marker === null) return null
  const stagingRoot = path.join(input.tempRoot, 'packaged-test-docx-fixture-v1', marker.nonce)
  const issuedSenderIds = new Set<number>()
  let registered = false
  return Object.freeze({
    register(mainWindowSenderId) {
      if (registered) return []
      registered = true
      input.registerInvoke(PACKAGED_TEST_DOCX_FIXTURE_CHANNEL_V1, async (event, payload) => {
        try {
          if (!isEmptyObject(payload) || !isMainFrameIpcEvent(event)) throw new Error('PACKAGED_TEST_FIXTURE_REQUEST_INVALID')
          const senderId = senderIdFromIpcEvent(event)
          const frameUrl = frameUrlFromIpcEvent(event)
          if (senderId === null || senderId !== mainWindowSenderId() || !isPackagedApplicationUrl(frameUrl)) throw new Error('PACKAGED_TEST_FIXTURE_SENDER_INVALID')
          if (await readVerifiedMarker(root, marker.nonce, input.argv, nowMs()) === null) throw new Error('PACKAGED_TEST_FIXTURE_MARKER_INVALID')
          const staged = await stageVerifiedFixture({ root, stagingRoot, nonce: marker.nonce })
          const grant = input.fileSelectionGrants.createOpaque({ senderId, filePath: staged, frameUrl })
          issuedSenderIds.add(senderId)
          return Object.freeze({ ok: true, value: Object.freeze({ fixtureId: FIXTURE_ID, mime: FIXTURE_MIME, sizeBytes: FIXTURE_SIZE_BYTES,
            selectionGrantToken: grant.token, expiresAtMs: grant.expiresAtMs }) })
        } catch (error) {
          const code = error instanceof Error && /^PACKAGED_TEST_FIXTURE_(?:REQUEST_INVALID|SENDER_INVALID|MARKER_INVALID|FILE_INVALID)$/u.test(error.message)
            ? error.message : 'PACKAGED_TEST_FIXTURE_UNAVAILABLE'
          return Object.freeze({ ok: false, code })
        }
      })
      return [PACKAGED_TEST_DOCX_FIXTURE_CHANNEL_V1]
    },
    async dispose() {
      for (const senderId of issuedSenderIds) input.fileSelectionGrants.invalidateSender(senderId)
      issuedSenderIds.clear()
      await rm(stagingRoot, { recursive: true, force: true })
    },
  })
}

function baseGate(input: Readonly<{ isPackaged: boolean; env: NodeJS.ProcessEnv; argv: readonly string[] }>, nonce: string): boolean {
  return input.isPackaged && input.env.NODE_ENV === 'production' && input.env.SV_ELECTRON_SMOKE === '1' && input.env.SV_ELECTRON_SMOKE_DFC === '1' &&
    input.env.SV_PACKAGED_TEST_AUTHORITY === PACKAGED_TEST_DOCX_FIXTURE_AUTHORITY_V1 && /^[a-f0-9]{32}$/u.test(nonce) &&
    input.argv.some(argument => argument.startsWith('--user-data-dir=')) && input.argv.includes(`--sv-packaged-test-authority-nonce=${nonce}`)
}

async function verifiedRoot(userDataRoot: string, repositoryRoot: string): Promise<string | null> {
  try {
    const root = await realpath(userDataRoot)
    const temp = await realpath(os.tmpdir())
    const repo = await realpath(repositoryRoot)
    return isDescendant(temp, root) && !isDescendant(repo, root) ? root : null
  } catch { return null }
}

async function readVerifiedMarker(root: string, nonce: string, argv: readonly string[], now: number): Promise<Marker | null> {
  try {
    const markerPath = path.join(root, MARKER_FILENAME)
    const markerStat = await lstat(markerPath)
    if (!markerStat.isFile() || markerStat.isSymbolicLink()) return null
    const raw = JSON.parse(await readFile(markerPath, 'utf8')) as unknown
    if (!isMarker(raw) || raw.nonce !== nonce || raw.userDataDir !== root || raw.createdAtMs > now || raw.expiresAtMs < now || raw.expiresAtMs - raw.createdAtMs > MARKER_MAX_AGE_MS ||
      !argv.some(argument => argument === `--user-data-dir=${root}`)) return null
    return Object.freeze(raw)
  } catch { return null }
}

async function stageVerifiedFixture(input: Readonly<{ root: string; stagingRoot: string; nonce: string }>): Promise<string> {
  const sourcePath = path.join(input.root, FIXTURE_FILENAME)
  const sourceStat = await lstat(sourcePath)
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('PACKAGED_TEST_FIXTURE_FILE_INVALID')
  const sourceRealPath = await realpath(sourcePath)
  if (!isDescendant(input.root, sourceRealPath)) throw new Error('PACKAGED_TEST_FIXTURE_FILE_INVALID')
  const sourceBytes = new Uint8Array(await readFile(sourceRealPath))
  try {
    verifyFixtureBytes(sourceBytes)
    await mkdir(input.stagingRoot, { recursive: true })
    const stagedPath = path.join(input.stagingRoot, `${randomUUID()}.docx`)
    await writeFile(stagedPath, sourceBytes, { flag: 'wx' })
    const stagedBytes = new Uint8Array(await readFile(stagedPath))
    try { verifyFixtureBytes(stagedBytes) } finally { stagedBytes.fill(0) }
    return stagedPath
  } finally { sourceBytes.fill(0) }
}

function verifyFixtureBytes(bytes: Uint8Array): void {
  if (bytes.byteLength !== FIXTURE_SIZE_BYTES || createHash('sha256').update(bytes).digest('hex') !== FIXTURE_SHA256) throw new Error('PACKAGED_TEST_FIXTURE_FILE_INVALID')
}

function isMarker(value: unknown): value is Marker {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false
  const record = value as Record<string, unknown>, fixture = record.fixture as Record<string, unknown> | null
  return record.schemaVersion === 1 && typeof record.nonce === 'string' && typeof record.createdAtMs === 'number' && typeof record.expiresAtMs === 'number' && typeof record.userDataDir === 'string' &&
    !!fixture && Object.getPrototypeOf(fixture) === Object.prototype && fixture.fixtureId === FIXTURE_ID && fixture.filename === FIXTURE_FILENAME && fixture.mime === FIXTURE_MIME && fixture.sizeBytes === FIXTURE_SIZE_BYTES && fixture.sha256 === FIXTURE_SHA256
}
function isEmptyObject(value: unknown): boolean { return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === 0 }
function isPackagedApplicationUrl(value: string | null): boolean { return value !== null && value.startsWith('file:') }
function isDescendant(root: string, candidate: string): boolean { const relative = path.relative(root, candidate); return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) }
