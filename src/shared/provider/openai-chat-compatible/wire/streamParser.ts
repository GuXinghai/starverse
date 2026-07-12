import { TerminalArbiter } from '../../../streaming/terminalArbiter'
import { CompatibleExtensionCollector } from './extensionCapture'
import { decodeCompatibleResponseObject, parseCompatibleJsonBytes } from './semanticDecoder'
import { mapCompatibleDecodedItems } from './semanticMapper'
import { CompatibleSseFramer, takeCompatibleSsePartialFrames, type CompatibleSseFrame } from './sseFramer'
import { CompatibleWireError, createCompatibleWireError } from './wireError'
import { resolveCompatibleWireLimits, type CompatibleWireEvent, type CompatibleWireLimits } from './wireTypes'

export class CompatibleSseWireParser {
  readonly #framer: CompatibleSseFramer
  readonly #collector: CompatibleExtensionCollector
  readonly #terminal = new TerminalArbiter()
  readonly #limits: CompatibleWireLimits
  readonly #expectedChoiceCount: number
  readonly #choiceStates = new Map<number, { finished: boolean }>()
  #sequence = 0

  constructor(input: Readonly<{ expectedChoiceCount?: number; limits?: Partial<CompatibleWireLimits> }> = {}) {
    const expected = input.expectedChoiceCount ?? 1
    if (!Number.isInteger(expected) || expected < 1 || expected > 16) {
      throw createCompatibleWireError({ code: 'compatible_config_invalid', category: 'shape', stage: 'request' })
    }
    this.#expectedChoiceCount = expected
    try {
      this.#limits = resolveCompatibleWireLimits(input.limits)
    } catch {
      throw createCompatibleWireError({ code: 'compatible_config_invalid', category: 'shape', stage: 'request' })
    }
    this.#framer = new CompatibleSseFramer(this.#limits)
    this.#collector = new CompatibleExtensionCollector(this.#limits)
  }

  push(chunk: Uint8Array): readonly CompatibleWireEvent[] {
    if (this.#terminal.isTerminated) throw malformed()
    try {
      return this.#consumeFrames(this.#framer.push(chunk))
    } catch (error) {
      return this.#recoverWithTerminal(error)
    }
  }

  finish(): readonly CompatibleWireEvent[] {
    if (this.#terminal.isTerminated) return []
    try {
      const output = [...this.#consumeFrames(this.#framer.finish())]
      if (this.#terminal.isTerminated) return output
      this.#assertChoicesComplete()
      output.push(this.#terminalEvent('eof_without_done'))
      return output
    } catch (error) {
      return this.#recoverWithTerminal(error)
    }
  }

  abort(): readonly CompatibleWireEvent[] {
    if (this.#terminal.isTerminated) return []
    const error = createCompatibleWireError({ code: 'compatible_aborted', category: 'lifecycle', stage: 'lifecycle' })
    return [this.#terminalEvent('aborted', error.envelope)]
  }

  interrupt(): readonly CompatibleWireEvent[] {
    if (this.#terminal.isTerminated) return []
    const error = createCompatibleWireError({ code: 'compatible_network_unknown', category: 'lifecycle', stage: 'stream' })
    return [this.#terminalEvent('interrupted', error.envelope)]
  }

  #consumeFrames(frames: readonly CompatibleSseFrame[]): CompatibleWireEvent[] {
    const output: CompatibleWireEvent[] = []
    for (const frame of frames) {
      if (this.#terminal.isTerminated) break
      try {
        if (frame.kind === 'done') {
          this.#assertChoicesComplete()
          output.push(this.#terminalEvent('done'))
          break
        }
        if (frame.data === '') continue
        const value = parseCompatibleJsonBytes(new TextEncoder().encode(frame.data), {
          maxBytes: this.#limits.maxEventBytes,
          malformedCode: 'compatible_sse_malformed',
        })
        const decoded = decodeCompatibleResponseObject({
          value,
          source: 'stream',
          collector: this.#collector,
          expectedChoiceCount: this.#expectedChoiceCount,
        })
        const providerError = decoded.items.find((item) => item.kind === 'provider_error')
        if (providerError?.kind === 'provider_error') {
          output.push(this.#terminalEvent('error', providerError.error))
          break
        }
        this.#acceptChoiceState(decoded.items)
        output.push(...mapCompatibleDecodedItems({
          items: decoded.items,
          source: 'stream',
          nextSequence: () => this.#nextSequence(),
        }))
      } catch (error) {
        output.push(this.#errorTerminal(normalize(error)))
        break
      }
    }
    return output
  }

  #assertChoicesComplete(): void {
    if (this.#choiceStates.size !== this.#expectedChoiceCount) throw malformed()
    for (let index = 0; index < this.#expectedChoiceCount; index += 1) {
      if (!this.#choiceStates.get(index)?.finished) throw malformed()
    }
  }

  #acceptChoiceState(items: ReturnType<typeof decodeCompatibleResponseObject>['items']): void {
    for (const item of items) {
      if (!('choiceIndex' in item)) continue
      const state = this.#choiceStates.get(item.choiceIndex) ?? { finished: false }
      if (state.finished && (item.kind === 'role' || item.kind === 'content' || item.kind === 'tool' || item.kind === 'finish')) throw malformed()
      if (item.kind === 'finish' && item.finishReason !== null) state.finished = true
      this.#choiceStates.set(item.choiceIndex, state)
    }
  }

  #recoverWithTerminal(error: unknown): readonly CompatibleWireEvent[] {
    const normalized = normalize(error)
    const partialFrames = takeCompatibleSsePartialFrames(error).filter((frame) => frame.kind !== 'done')
    const output = [...this.#consumeFrames(partialFrames)]
    if (!this.#terminal.isTerminated) output.push(this.#errorTerminal(normalized))
    return output
  }

  #errorTerminal(error: CompatibleWireError): CompatibleWireEvent {
    if (this.#terminal.isTerminated) throw error
    return this.#terminalEvent('error', error.envelope)
  }

  #terminalEvent(outcome: 'done' | 'eof_without_done' | 'aborted' | 'interrupted' | 'error', error?: CompatibleWireError['envelope']): CompatibleWireEvent {
    if (!this.#terminal.tryEnterTerminal()) throw malformed()
    return Object.freeze({
      kind: 'terminal',
      source: 'stream',
      sequence: this.#nextSequence(),
      outcome,
      ...(error === undefined ? {} : { error }),
    })
  }

  #nextSequence(): number {
    const current = this.#sequence
    this.#sequence += 1
    return current
  }
}

function normalize(error: unknown): CompatibleWireError {
  return error instanceof CompatibleWireError ? error : createCompatibleWireError({ code: 'compatible_sse_malformed', category: 'framing', stage: 'stream' })
}

function malformed(): CompatibleWireError {
  return createCompatibleWireError({ code: 'compatible_sse_malformed', category: 'framing', stage: 'stream' })
}
