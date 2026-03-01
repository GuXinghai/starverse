import type { DomainEvent, RootState, RunState } from '../types'

export type ReducerCoreOptions = Readonly<{
  now?: () => number
  generateId?: (prefix: string) => string
}>

export type EventType = DomainEvent['type']

export type EventByType<T extends EventType> = Extract<DomainEvent, { type: T }>

export type HandlerContext = Readonly<{
  state: RootState
  runId: string
  run: RunState
  targetId?: string
  options?: ReducerCoreOptions
}>

export type EventHandler<T extends EventType> = (ctx: HandlerContext, event: EventByType<T>) => RootState

export type AnyEventHandler = (ctx: HandlerContext, event: DomainEvent) => RootState

export type HandlerMap = {
  [K in EventType]: EventHandler<K>
}
