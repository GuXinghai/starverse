import fs from 'node:fs'
import path from 'node:path'
import type { Session } from 'electron'

export type AgentAutomationOptions = Readonly<{
  profileRoot: string
  hidden: boolean
  offline: boolean
  rendererOrigin: string
}>

let active: AgentAutomationOptions | null = null

function validateProfileRoot(profileRoot: string, repositoryRoot: string): void {
  const relative = path.relative(repositoryRoot, profileRoot)
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('STARVERSE_AGENT_PROFILE_MUST_BE_EXTERNAL')
  }
  if (fs.lstatSync(profileRoot).isSymbolicLink() ||
      path.relative(profileRoot, fs.realpathSync(profileRoot)) !== '') {
    throw new Error('STARVERSE_AGENT_PROFILE_LINK_INVALID')
  }
  const marker = JSON.parse(fs.readFileSync(path.join(profileRoot, '.starverse-agent-profile.json'), 'utf8'))
  if (marker.kind !== 'starverse-agent-profile-v1' || marker.repositoryRoot !== repositoryRoot) {
    throw new Error('STARVERSE_AGENT_PROFILE_OWNER_INVALID')
  }
}

/** A separate development profile; never reuse the smoke fixture authority. */
export function resolveAgentAutomationOptions(input: Readonly<{
  env: Readonly<Record<string, string | undefined>>
  isPackaged: boolean
  repositoryRoot: string
}>): AgentAutomationOptions | null {
  const { env } = input
  if (env.SV_AGENT_AUTOMATION === undefined && env.SV_AGENT_PROFILE_ROOT === undefined) return null
  if (input.isPackaged || env.SV_AGENT_AUTOMATION !== '1' || env.SV_AGENT_ISOLATED_PROFILE !== '1') {
    throw new Error('STARVERSE_AGENT_MODE_INVALID')
  }
  if (env.SV_ELECTRON_SMOKE === '1' || env.SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY === '1') {
    throw new Error('STARVERSE_AGENT_FIXTURE_MODE_CONFLICT')
  }
  const configured = env.SV_AGENT_PROFILE_ROOT ?? ''
  if (!path.isAbsolute(configured)) throw new Error('STARVERSE_AGENT_PROFILE_INVALID')
  const profileRoot = path.resolve(configured)
  const repositoryRoot = path.resolve(input.repositoryRoot)
  validateProfileRoot(profileRoot, repositoryRoot)
  const renderer = new URL(env.VITE_DEV_SERVER_URL ?? '')
  if (renderer.protocol !== 'http:' || renderer.hostname !== '127.0.0.1' || renderer.username || renderer.password) {
    throw new Error('STARVERSE_AGENT_RENDERER_ORIGIN_INVALID')
  }
  if (env.SV_AGENT_NETWORK !== 'normal' && env.SV_AGENT_NETWORK !== 'offline') {
    throw new Error('STARVERSE_AGENT_NETWORK_MODE_INVALID')
  }
  return Object.freeze({ profileRoot, rendererOrigin: renderer.origin,
    hidden: env.SV_AGENT_SHOW_WINDOW !== '1', offline: env.SV_AGENT_NETWORK === 'offline' })
}

export function initializeAgentAutomation(input: Readonly<{
  app: {
    isPackaged: boolean
    setPath(name: 'appData' | 'userData' | 'sessionData' | 'crashDumps', value: string): void
    setAppLogsPath(value: string): void
  }
  env: Readonly<Record<string, string | undefined>>
  repositoryRoot: string
}>): void {
  const options = resolveAgentAutomationOptions({ ...input, isPackaged: input.app.isPackaged })
  if (!options) return
  // Resolve every directory before changing any Electron paths. Existing junctions
  // or symlinks must never redirect a test profile into a normal application root.
  const directories = ['app-data', 'user-data', 'logs', 'crashes'].map((name) => {
    const directory = path.join(options.profileRoot, name)
    fs.mkdirSync(directory, { recursive: true })
    if (fs.lstatSync(directory).isSymbolicLink() ||
        path.relative(directory, fs.realpathSync(directory)) !== '') {
      throw new Error('STARVERSE_AGENT_PROFILE_LINK_INVALID')
    }
    return directory
  })
  input.app.setPath('appData', directories[0])
  input.app.setPath('userData', directories[1])
  input.app.setPath('sessionData', directories[1])
  input.app.setPath('crashDumps', directories[3])
  input.app.setAppLogsPath(directories[2])
  active = options
}

export function getAgentAutomationOptions(): AgentAutomationOptions | null {
  return active
}

/** Covers application provider HTTP; this is not an OS/utility-process firewall. */
export function assertAgentNetworkAccess(input: string | Request): void {
  if (!active?.offline) return
  const url = new URL(typeof input === 'string' ? input : input.url)
  if (url.origin !== active.rendererOrigin) throw new Error('STARVERSE_AGENT_NETWORK_BLOCKED')
}

export function applyAgentSessionNetworkPolicy(target: Readonly<{
  webRequest: Pick<Session['webRequest'], 'onBeforeRequest'>
}>): void {
  if (!active?.offline) return
  const origin = active.rendererOrigin
  target.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      const url = new URL(details.url)
      if (url.protocol === 'ws:') url.protocol = 'http:'
      if (url.protocol === 'wss:') url.protocol = 'https:'
      callback({ cancel: url.origin !== origin })
    })
}
