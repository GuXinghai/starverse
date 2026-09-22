export type SourcePriorityConfigV1Client = Readonly<{
  get: (payload?: unknown) => Promise<unknown>
  update: (payload: unknown) => Promise<unknown>
}>

export function createSourcePriorityConfigV1Client(
  bridge: SourcePriorityConfigV1Client,
): SourcePriorityConfigV1Client {
  return Object.freeze({
    get: (payload?: unknown) => bridge.get(payload),
    update: (payload: unknown) => bridge.update(payload),
  })
}
