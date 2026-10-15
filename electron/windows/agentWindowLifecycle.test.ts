import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ window: { isDestroyed: () => false, isMinimized: () => true,
  restore: vi.fn(), show: vi.fn(), focus: vi.fn() } }))
vi.mock('./mainWindow', () => ({ createMainWindow: () => mocks.window }))
vi.mock('electron', () => ({ app: { on: vi.fn() }, BrowserWindow: { getAllWindows: () => [] } }))
import { createMainWindowLifecycle } from './mainWindowLifecycle'

describe('agent window activation', () => {
  const base = { isDev: true, rendererDist: '', publicPath: '', preloadPath: '' }
  it('acknowledges a hidden window without showing, restoring, or focusing it', () => {
    const lifecycle = createMainWindowLifecycle({ ...base, agentControlled: true, agentBackground: true })
    expect(lifecycle.focusWindow()).toBe(false)
    lifecycle.createWindow()
    expect(lifecycle.focusWindow()).toBe(true)
    expect(mocks.window.restore).not.toHaveBeenCalled()
    expect(mocks.window.show).not.toHaveBeenCalled()
    expect(mocks.window.focus).not.toHaveBeenCalled()
  })
  it('preserves ordinary window activation', () => {
    const lifecycle = createMainWindowLifecycle(base)
    lifecycle.createWindow()
    expect(lifecycle.focusWindow()).toBe(true)
    expect(mocks.window.restore).toHaveBeenCalledOnce()
    expect(mocks.window.show).toHaveBeenCalledOnce()
    expect(mocks.window.focus).toHaveBeenCalledOnce()
  })
})
