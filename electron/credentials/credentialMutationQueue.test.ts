import { describe, expect, it } from 'vitest'
import { CredentialMutationQueueError, createCredentialMutationQueue } from './credentialMutationQueue'

function deferred(): Readonly<{ promise: Promise<void>; resolve: () => void }> {
  let resolve!: () => void
  return Object.freeze({ promise: new Promise<void>((next) => { resolve = next }), resolve })
}

describe('credential mutation queue', () => {
  it('runs matching keys FIFO while allowing different keys to proceed', async () => {
    const queue = createCredentialMutationQueue()
    const firstGate = deferred()
    const order: string[] = []
    const first = queue.run('standard:openrouter', async () => {
      order.push('first:start')
      await firstGate.promise
      order.push('first:end')
    })
    const second = queue.run('standard:openrouter', async () => { order.push('second') })
    await queue.run('compatible:ocp_credential_12345678', async () => { order.push('other') })
    expect(order).toEqual(['first:start', 'other'])
    firstGate.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'other', 'first:end', 'second'])
  })

  it('recovers from failed work and rejects nested mutations', async () => {
    const queue = createCredentialMutationQueue()
    await expect(queue.run('standard:openrouter', async () => {
      await expect(queue.run('standard:openrouter', async () => undefined))
        .rejects.toMatchObject({ code: 'CREDENTIAL_MUTATION_QUEUE_REENTRANT' })
      throw new Error('expected')
    })).rejects.toThrow('expected')
    await expect(queue.run('standard:openrouter', async () => 'recovered')).resolves.toBe('recovered')
  })

  it('drains accepted work and rejects work submitted after close', async () => {
    const queue = createCredentialMutationQueue()
    const gate = deferred()
    const running = queue.run('standard:openrouter', async () => { await gate.promise })
    const closing = queue.close()
    const secondClosing = queue.close()
    await expect(queue.run('standard:openrouter', async () => undefined))
      .rejects.toBeInstanceOf(CredentialMutationQueueError)
    gate.resolve()
    await Promise.all([running, closing, secondClosing])
  })
})
