import { afterEach, describe, expect, it, vi } from 'vitest'
import { createControlServer, locate, sendCommand } from './control.mjs'

const servers = []
afterEach(async () => { for (const server of servers.splice(0)) await server.close() })
async function server(dispatch) { const value = await createControlServer(dispatch); servers.push(value); return value }

describe('local agent control', () => {
  it('authenticates commands and roundtrips Chinese text without relying on global fetch', async () => {
    const dispatch = vi.fn(async (command) => command)
    const control = await server(dispatch)
    expect(await sendCommand(control, { action: 'fill', value: '中文输入' })).toEqual({
      ok: true, value: { action: 'fill', value: '中文输入' },
    })
    expect((await sendCommand({ ...control, token: 'bad' }, { action: 'status' })).ok).toBe(false)
    expect((await sendCommand(control, { action: 'status' }, { Origin: 'https://example.com' })).ok).toBe(false)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
  it('serializes operations and recovers after a failed command', async () => {
    const order = []
    const control = await server(async (command) => {
      order.push(command.value)
      if (command.value === 1) { await new Promise((resolve) => setTimeout(resolve, 25)); throw new Error('expected failure') }
      return command.value
    })
    const result = await Promise.all([sendCommand(control, { action: 'status', value: 1 }),
      sendCommand(control, { action: 'status', value: 2 })])
    expect(order).toEqual([1, 2])
    expect(result.map((value) => value.ok)).toEqual([false, true])
  })
  it('refuses unknown actions and nonloopback control endpoints', async () => {
    const dispatch = vi.fn()
    const control = await server(dispatch)
    expect((await sendCommand(control, { action: 'evaluate' })).ok).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    await expect(sendCommand({ endpoint: 'http://example.com/command' }, { action: 'status' })).rejects.toThrow('CONTROL_ENDPOINT_INVALID')
  })
  it('requires an explicit target instead of guessing UI elements', () => {
    const page = { getByRole: vi.fn(), locator: vi.fn() }
    expect(() => locate(page)).toThrow('target is required')
    locate(page, { role: 'button', name: '设置' })
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: '设置', exact: true })
  })
})
