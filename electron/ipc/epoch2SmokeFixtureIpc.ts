import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { FileSelectionGrantStore } from './fileSelectionGrants'
import { senderIdFromIpcEvent } from './fileSelectionGrants'
import type { RegisterInvoke } from './types'

export const EPOCH2_SMOKE_FIXTURE_CHANNEL = 'generation-v2:smoke-fixture:request-local-file-grant'

const FIXTURE_FILENAMES = Object.freeze({
  markdown: 'fixture-markdown.md',
  html: 'fixture-html.html',
  docx: 'fixture-docx.docx',
} as const)

type FixtureName = keyof typeof FIXTURE_FILENAMES

export type Epoch2SmokeFixtureAuthorityOptions = Readonly<{
  enabled: boolean
  fixtureRoot: string | null
  registerInvoke: RegisterInvoke
  fileSelectionGrants: FileSelectionGrantStore
}>

export function isEpoch2SmokeFixtureAuthorityEnabled(input: Readonly<{
  isPackaged: boolean
  env: NodeJS.ProcessEnv
  argv: readonly string[]
}>): boolean {
  return !input.isPackaged && input.env.SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY === '1' &&
    typeof input.env.SV_EPOCH2_SMOKE_FIXTURE_ROOT === 'string' && input.env.SV_EPOCH2_SMOKE_FIXTURE_ROOT.trim().length > 0 &&
    input.argv.some((argument) => argument.startsWith('--user-data-dir='))
}

export function registerEpoch2SmokeFixtureIpc(input: Epoch2SmokeFixtureAuthorityOptions): readonly string[] {
  if (!input.enabled || !input.fixtureRoot?.trim()) return []
  input.registerInvoke(EPOCH2_SMOKE_FIXTURE_CHANNEL, async (event, payload) => {
    try {
      const fixtureName = parseFixtureName(payload)
      const senderId = senderIdFromIpcEvent(event)
      if (senderId === null) throw new Error('EPOCH2_SMOKE_FIXTURE_SENDER_INVALID')
      const root = await realpath(input.fixtureRoot)
      const filePath = await realpath(path.join(root, FIXTURE_FILENAMES[fixtureName]))
      if (!isDescendantPath(root, filePath)) throw new Error('EPOCH2_SMOKE_FIXTURE_PATH_INVALID')
      if (!(await lstat(filePath)).isFile()) throw new Error('EPOCH2_SMOKE_FIXTURE_PATH_INVALID')
      const grant = input.fileSelectionGrants.create({ senderId, filePath })
      return Object.freeze({ ok: true, value: Object.freeze({ fixtureName, ...grant }) })
    } catch (error) {
      const code = error instanceof Error && /^EPOCH2_SMOKE_FIXTURE_(?:INPUT_INVALID|SENDER_INVALID|PATH_INVALID)$/u.test(error.message)
        ? error.message
        : 'EPOCH2_SMOKE_FIXTURE_UNAVAILABLE'
      return Object.freeze({ ok: false, code })
    }
  })
  return [EPOCH2_SMOKE_FIXTURE_CHANNEL]
}

function parseFixtureName(payload: unknown): FixtureName {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype ||
    Object.keys(payload).length !== 1 || Object.keys(payload)[0] !== 'fixtureName') throw new Error('EPOCH2_SMOKE_FIXTURE_INPUT_INVALID')
  const value = (payload as { fixtureName?: unknown }).fixtureName
  if (value === 'markdown' || value === 'html' || value === 'docx') return value
  throw new Error('EPOCH2_SMOKE_FIXTURE_INPUT_INVALID')
}

function isDescendantPath(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative.length > 0 && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}
