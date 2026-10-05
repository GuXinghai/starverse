import { describe, expect, it, vi } from 'vitest'
import {
  classifyDidFailLoad,
  classifyRenderProcessGone,
  createRendererRecovery,
  type RecoveryChoiceId,
  type RendererFailure,
} from './rendererRecovery'

const crash: RendererFailure = { kind: 'renderer-crashed', reason: 'crashed', exitCode: 1 }
const loadFail: RendererFailure = {
  kind: 'load-failed',
  errorCode: -102,
  errorDescription: 'ERR_CONNECTION_REFUSED',
  target: 'http://127.0.0.1:5173',
}

function setup(choices: Array<RecoveryChoiceId | null>) {
  let clock = 1_000
  const queue = [...choices]
  const deps = {
    promptUser: vi.fn(async () => queue.shift() ?? null),
    reloadRenderer: vi.fn(),
    restartApp: vi.fn(),
    closeApp: vi.fn(),
    log: vi.fn(),
    now: () => clock,
    loopWindowMs: 30_000,
  }
  return { deps, recovery: createRendererRecovery(deps), advance: (ms: number) => (clock += ms) }
}

describe('renderer failure classification', () => {
  it('classifies crashes and ignores clean exits', () => {
    expect(classifyRenderProcessGone({ reason: 'oom', exitCode: 9 })).toEqual({
      kind: 'renderer-crashed',
      reason: 'oom',
      exitCode: 9,
    })
    expect(classifyRenderProcessGone({ reason: 'clean-exit', exitCode: 0 })).toBeNull()
  })

  it('classifies main-frame load failures and ignores aborts and subframes', () => {
    const base = { errorCode: -102, errorDescription: 'x', isMainFrame: true, target: 'o' }
    expect(classifyDidFailLoad(base)?.kind).toBe('load-failed')
    expect(classifyDidFailLoad({ ...base, errorCode: -3 })).toBeNull()
    expect(classifyDidFailLoad({ ...base, isMainFrame: false })).toBeNull()
  })
})

describe('renderer recovery flow', () => {
  it('logs a crash, prompts, and takes no action before the user chooses', async () => {
    const { deps, recovery } = setup([null])
    await recovery.handleFailure(crash)
    expect(deps.log.mock.calls[0][0]).toBe('RENDERER_FAILURE')
    expect(deps.promptUser).toHaveBeenCalledWith({ failure: crash, reloadAllowed: true })
    expect(deps.reloadRenderer).not.toHaveBeenCalled()
    expect(deps.restartApp).not.toHaveBeenCalled()
    expect(deps.closeApp).not.toHaveBeenCalled()
  })

  it('logs and prompts for a load failure', async () => {
    const { deps, recovery } = setup(['close'])
    await recovery.handleFailure(loadFail)
    expect(deps.log).toHaveBeenCalledWith('RENDERER_FAILURE', expect.objectContaining({ kind: 'load-failed' }))
    expect(deps.closeApp).toHaveBeenCalledTimes(1)
  })

  it('reload choice reloads only', async () => {
    const { deps, recovery } = setup(['reload'])
    await recovery.handleFailure(crash)
    expect(deps.reloadRenderer).toHaveBeenCalledTimes(1)
    expect(deps.restartApp).not.toHaveBeenCalled()
    expect(deps.closeApp).not.toHaveBeenCalled()
  })

  it('restart choice restarts only', async () => {
    const { deps, recovery } = setup(['restart'])
    await recovery.handleFailure(crash)
    expect(deps.restartApp).toHaveBeenCalledTimes(1)
    expect(deps.reloadRenderer).not.toHaveBeenCalled()
    expect(deps.closeApp).not.toHaveBeenCalled()
  })

  it('close choice closes only', async () => {
    const { deps, recovery } = setup(['close'])
    await recovery.handleFailure(crash)
    expect(deps.closeApp).toHaveBeenCalledTimes(1)
    expect(deps.reloadRenderer).not.toHaveBeenCalled()
    expect(deps.restartApp).not.toHaveBeenCalled()
  })

  it('withholds reload when a reloaded renderer fails again inside the loop window', async () => {
    const { deps, recovery, advance } = setup(['reload', 'reload'])
    await recovery.handleFailure(crash)
    advance(2_000)
    await recovery.handleFailure(crash)
    expect(deps.promptUser).toHaveBeenLastCalledWith({ failure: crash, reloadAllowed: false })
    expect(deps.reloadRenderer).toHaveBeenCalledTimes(1)
  })

  it('offers reload again after the loop window has passed', async () => {
    const { deps, recovery, advance } = setup(['reload', 'reload'])
    await recovery.handleFailure(crash)
    advance(31_000)
    await recovery.handleFailure(crash)
    expect(deps.promptUser).toHaveBeenLastCalledWith({ failure: crash, reloadAllowed: true })
    expect(deps.reloadRenderer).toHaveBeenCalledTimes(2)
  })

  it('does not stack prompts while one is open, but still logs the failure', async () => {
    let release!: (c: RecoveryChoiceId) => void
    const { deps } = setup([])
    deps.promptUser.mockImplementation(() => new Promise<RecoveryChoiceId | null>((r) => (release = r)))
    const recovery = createRendererRecovery(deps)
    const first = recovery.handleFailure(crash)
    await recovery.handleFailure(loadFail)
    expect(deps.promptUser).toHaveBeenCalledTimes(1)
    expect(deps.log.mock.calls.filter((c) => c[0] === 'RENDERER_FAILURE')).toHaveLength(2)
    release('close')
    await first
    expect(deps.closeApp).toHaveBeenCalledTimes(1)
  })

  it('does nothing if the prompt throws', async () => {
    const { deps, recovery } = setup([])
    deps.promptUser.mockRejectedValue(new Error('boom'))
    await recovery.handleFailure(crash)
    expect(deps.reloadRenderer).not.toHaveBeenCalled()
    expect(deps.restartApp).not.toHaveBeenCalled()
    expect(deps.closeApp).not.toHaveBeenCalled()
  })
})
