import { afterEach, describe, expect, it, vi } from 'vitest'
import { shell } from 'electron'
import { registerShellIpc } from './shellIpc'

vi.mock('electron', () => ({
  shell: {
    openExternal: vi.fn(),
  },
}))

describe('registerShellIpc', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs sanitized shell open failures without raw Error payloads', async () => {
    const registerInvoke = vi.fn()
    registerShellIpc({ registerInvoke })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'shell:open-external')?.[1]
    expect(handler).toBeTypeOf('function')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('open failed for C:\\Users\\alice\\secret.txt contentToken=tok-secret')
    ;(error as any).code = 'EOPEN'
    vi.mocked(shell.openExternal).mockRejectedValueOnce(error)

    const result = await handler({}, 'https://example.com/docs')
    expect(result).toEqual({
      success: false,
      error: expect.stringContaining('[redacted-path]'),
    })
    expect((result as any).error).toContain('contentToken=[redacted-token]')
    expect((result as any).error).not.toContain('C:\\Users\\alice\\secret.txt')
    expect((result as any).error).not.toContain('tok-secret')

    const output = errorSpy.mock.calls
      .flat()
      .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
      .join(' ')
    expect(output).toContain('open_external_failed')
    expect(output).toContain('EOPEN')
    expect(output).not.toContain('C:\\Users\\alice\\secret.txt')
    expect(output).not.toContain('tok-secret')
    expect(output).not.toContain('contentToken')
  })

  it('logs invalid external URLs by category without echoing the payload', async () => {
    const registerInvoke = vi.fn()
    registerShellIpc({ registerInvoke })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'shell:open-external')?.[1]
    expect(handler).toBeTypeOf('function')

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await handler({}, 'file:///C:/Users/alice/secret.txt')

    expect(result).toEqual(expect.objectContaining({ success: false }))
    const output = errorSpy.mock.calls
      .flat()
      .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
      .join(' ')
    expect(output).toContain('unsupported_protocol')
    expect(output).not.toContain('C:/Users/alice/secret.txt')
  })
})
