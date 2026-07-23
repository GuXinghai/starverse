export function createConversationConfigUpdateQueue() {
  const tails = new Map<string, Promise<void>>()

  return Object.freeze({
    enqueue<T>(conversationId: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(conversationId) ?? Promise.resolve()
      const next = previous.then(task, task)
      const tail = next.then(() => undefined, () => undefined)
      tails.set(conversationId, tail)
      void tail.then(() => {
        if (tails.get(conversationId) === tail) tails.delete(conversationId)
      })
      return next
    },
  })
}
