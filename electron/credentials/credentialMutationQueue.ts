import { AsyncLocalStorage } from 'node:async_hooks'

export class CredentialMutationQueueError extends Error {
  constructor(readonly code: 'CREDENTIAL_MUTATION_QUEUE_CLOSED' | 'CREDENTIAL_MUTATION_QUEUE_REENTRANT') {
    super(code)
    this.name = 'CredentialMutationQueueError'
  }
}

export type CredentialMutationQueue = Readonly<{
  run: <T>(key: string, work: () => Promise<T>) => Promise<T>
  close: () => Promise<void>
}>

export function createCredentialMutationQueue(): CredentialMutationQueue {
  const tails = new Map<string, Promise<void>>()
  const active = new AsyncLocalStorage<string>()
  let closed = false
  let closePromise: Promise<void> | undefined

  const run = async <T>(key: string, work: () => Promise<T>): Promise<T> => {
    if (closed) throw new CredentialMutationQueueError('CREDENTIAL_MUTATION_QUEUE_CLOSED')
    if (typeof key !== 'string' || key.length === 0 || key.length > 512 ||
        key.trim() !== key || /[\u0000-\u001f\u007f]/u.test(key)) {
      throw new Error('CREDENTIAL_MUTATION_QUEUE_KEY_INVALID')
    }
    if (active.getStore() !== undefined) {
      throw new CredentialMutationQueueError('CREDENTIAL_MUTATION_QUEUE_REENTRANT')
    }
    const previous = tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => gate)
    tails.set(key, tail)
    await previous
    try {
      return await active.run(key, work)
    } finally {
      release()
      if (tails.get(key) === tail) tails.delete(key)
    }
  }

  return Object.freeze({
    run,
    close: async () => {
      if (active.getStore() !== undefined) {
        throw new CredentialMutationQueueError('CREDENTIAL_MUTATION_QUEUE_REENTRANT')
      }
      if (closePromise) return closePromise
      closed = true
      closePromise = Promise.all([...tails.values()]).then(() => undefined)
      return closePromise
    },
  })
}
