import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAgentSessionNetworkPolicy, assertAgentNetworkAccess, getAgentAutomationOptions, initializeAgentAutomation,
  resolveAgentAutomationOptions } from './agentAutomationRuntime'

const roots: string[] = []
const repositoryRoot = path.resolve(process.cwd())
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-agent-policy-'))
  roots.push(root)
  fs.writeFileSync(path.join(root, '.starverse-agent-profile.json'), JSON.stringify({
    kind: 'starverse-agent-profile-v1', repositoryRoot,
  }))
  return { SV_AGENT_AUTOMATION: '1', SV_AGENT_ISOLATED_PROFILE: '1', SV_AGENT_PROFILE_ROOT: root,
    SV_AGENT_NETWORK: 'normal', VITE_DEV_SERVER_URL: 'http://127.0.0.1:5177/' }
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

describe('agent automation isolation', () => {
  it('leaves ordinary startup inactive', () => {
    expect(resolveAgentAutomationOptions({ env: {}, isPackaged: false, repositoryRoot })).toBeNull()
  })
  it('requires both gates and refuses packaged or fixture modes', () => {
    const env = fixture()
    for (const invalid of [{ ...env, SV_AGENT_ISOLATED_PROFILE: '0' }, { ...env, SV_AGENT_AUTOMATION: '0' },
      { ...env, SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY: '1' }]) {
      expect(() => resolveAgentAutomationOptions({ env: invalid, isPackaged: false, repositoryRoot })).toThrow()
    }
    expect(() => resolveAgentAutomationOptions({ env, isPackaged: true, repositoryRoot })).toThrow()
  })
  it('refuses repository roots and a profile belonging to another checkout', () => {
    const env = fixture()
    expect(() => resolveAgentAutomationOptions({ env: { ...env, SV_AGENT_PROFILE_ROOT: repositoryRoot },
      isPackaged: false, repositoryRoot })).toThrow('STARVERSE_AGENT_PROFILE_MUST_BE_EXTERNAL')
    fs.writeFileSync(path.join(env.SV_AGENT_PROFILE_ROOT, '.starverse-agent-profile.json'), JSON.stringify({
      kind: 'starverse-agent-profile-v1', repositoryRoot: path.join(repositoryRoot, 'other'),
    }))
    expect(() => resolveAgentAutomationOptions({ env, isPackaged: false, repositoryRoot })).toThrow('STARVERSE_AGENT_PROFILE_OWNER_INVALID')
  })
  it('accepts only an exact IPv4 loopback renderer and explicit network mode', () => {
    const env = fixture()
    for (const url of ['https://127.0.0.1:5177/', 'http://127.0.0.1.evil.test/', 'http://user@127.0.0.1:5177/']) {
      expect(() => resolveAgentAutomationOptions({ env: { ...env, VITE_DEV_SERVER_URL: url },
        isPackaged: false, repositoryRoot })).toThrow('STARVERSE_AGENT_RENDERER_ORIGIN_INVALID')
    }
    expect(() => resolveAgentAutomationOptions({ env: { ...env, SV_AGENT_NETWORK: 'typo' },
      isPackaged: false, repositoryRoot })).toThrow('STARVERSE_AGENT_NETWORK_MODE_INVALID')
  })
  it('isolates all Electron storage paths while preserving an existing profile', () => {
    const env = fixture()
    fs.mkdirSync(path.join(env.SV_AGENT_PROFILE_ROOT, 'app-data'))
    const sentinel = path.join(env.SV_AGENT_PROFILE_ROOT, 'app-data', 'preserved.txt')
    fs.writeFileSync(sentinel, 'keep')
    const app = { isPackaged: false, setPath: vi.fn(), setAppLogsPath: vi.fn() }
    initializeAgentAutomation({ app, env, repositoryRoot })
    expect(app.setPath).toHaveBeenCalledWith('appData', path.join(env.SV_AGENT_PROFILE_ROOT, 'app-data'))
    expect(app.setPath).toHaveBeenCalledWith('userData', path.join(env.SV_AGENT_PROFILE_ROOT, 'user-data'))
    expect(app.setPath).toHaveBeenCalledWith('sessionData', path.join(env.SV_AGENT_PROFILE_ROOT, 'user-data'))
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('keep')
    expect(getAgentAutomationOptions()?.hidden).toBe(true)
    expect(() => assertAgentNetworkAccess('https://example.com/')).not.toThrow()
    const onBeforeRequest = vi.fn()
    applyAgentSessionNetworkPolicy({ webRequest: { onBeforeRequest } })
    expect(onBeforeRequest).not.toHaveBeenCalled()
    initializeAgentAutomation({ app, env: { ...env, SV_AGENT_NETWORK: 'offline' }, repositoryRoot })
    applyAgentSessionNetworkPolicy({ webRequest: { onBeforeRequest } })
    const handler = onBeforeRequest.mock.calls[0][1]
    const callback = vi.fn()
    handler({ url: 'https://example.com/' }, callback)
    expect(callback).toHaveBeenLastCalledWith({ cancel: true })
    handler({ url: 'ws://127.0.0.1:5177/' }, callback)
    expect(callback).toHaveBeenLastCalledWith({ cancel: false })
    expect(() => assertAgentNetworkAccess('https://example.com/')).toThrow('STARVERSE_AGENT_NETWORK_BLOCKED')
    expect(() => assertAgentNetworkAccess('http://127.0.0.1:5177/src/main.ts')).not.toThrow()
    expect(() => assertAgentNetworkAccess('http://127.0.0.1:5178/')).toThrow()

  })
  it('rejects a redirected storage child before changing any Electron path', () => {
    const env = fixture()
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-agent-other-'))
    roots.push(target)
    fs.symlinkSync(target, path.join(env.SV_AGENT_PROFILE_ROOT, 'app-data'), process.platform === 'win32' ? 'junction' : 'dir')
    const app = { isPackaged: false, setPath: vi.fn(), setAppLogsPath: vi.fn() }
    expect(() => initializeAgentAutomation({ app, env, repositoryRoot })).toThrow('STARVERSE_AGENT_PROFILE_LINK_INVALID')
    expect(app.setPath).not.toHaveBeenCalled()
  })
})
