import type { DomainEvent, StreamEndReason } from '@/next/state/types'

type TimingState = {
  tRequestStart: number
  tAck?: number
  tEnd?: number
  endReason?: StreamEndReason
  tTransportClosed?: number
  ackSource?: 'comment' | 'first_chunk'
}

type EndSnapshotInput = Readonly<{
  endReason: StreamEndReason
  includeRequestStart?: boolean
  includeAck?: boolean
  includeDuration?: boolean
  reasonTag?: string
}>

export class TimingMachine {
  readonly #state: TimingState
  readonly #logTiming?: (tag: string, data: Record<string, unknown>) => void

  constructor(tRequestStart: number, logTiming?: (tag: string, data: Record<string, unknown>) => void) {
    this.#state = { tRequestStart }
    this.#logTiming = logTiming
  }

  emitRequestStartSnapshot(): DomainEvent {
    return { type: 'TimingSnapshot', tRequestStart: this.#state.tRequestStart }
  }

  tryAckFromComment(text: string): DomainEvent | null {
    if (this.#state.tAck !== undefined) return null
    if (!text.includes('OPENROUTER PROCESSING')) return null
    this.#state.tAck = Date.now()
    this.#state.ackSource = 'comment'
    this.#logTiming?.('ack', { tAck: this.#state.tAck, source: 'comment' })
    return { type: 'TimingSnapshot', tAck: this.#state.tAck }
  }

  tryAckFromFirstChunk(): DomainEvent | null {
    if (this.#state.tAck !== undefined) return null
    this.#state.tAck = Date.now()
    this.#state.ackSource = 'first_chunk'
    this.#logTiming?.('ack', { tAck: this.#state.tAck, source: 'first_chunk' })
    return { type: 'TimingSnapshot', tAck: this.#state.tAck }
  }

  end(input: EndSnapshotInput): DomainEvent {
    this.#state.tEnd = Date.now()
    this.#state.endReason = input.endReason
    const reason = input.reasonTag ?? input.endReason
    if (input.includeDuration) {
      const duration = this.#state.tAck != null ? this.#state.tEnd - this.#state.tAck : undefined
      this.#logTiming?.('end', { ...this.#state, localProcessingDurationMs: duration, reason })
    } else {
      this.#logTiming?.('end', { ...this.#state, reason })
    }

    const snapshot: any = {
      type: 'TimingSnapshot',
      tEnd: this.#state.tEnd,
      endReason: input.endReason,
    }
    if (input.includeRequestStart === true) {
      snapshot.tRequestStart = this.#state.tRequestStart
    }
    if (input.includeAck === true) {
      snapshot.tAck = this.#state.tAck
    }
    return snapshot satisfies DomainEvent
  }
}

