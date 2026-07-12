import { CompatibleWireError, createCompatibleWireError } from './wireError'
import { resolveCompatibleWireLimits, type CompatibleWireLimits } from './wireTypes'

export type CompatibleSseFrame =
  | Readonly<{
      kind: 'event'
      data: string
      event?: string
      id?: string
      retry?: number
      comments: readonly string[]
    }>
  | Readonly<{ kind: 'done' }>

const PARTIAL_FRAMES = new WeakMap<CompatibleWireError, readonly CompatibleSseFrame[]>()

export function takeCompatibleSsePartialFrames(error: unknown): readonly CompatibleSseFrame[] {
  if (!(error instanceof CompatibleWireError)) return []
  const frames = PARTIAL_FRAMES.get(error) ?? []
  PARTIAL_FRAMES.delete(error)
  return frames
}

export class CompatibleSseFramer {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  readonly #encoder = new TextEncoder()
  readonly #limits: CompatibleWireLimits
  #pending = ''
  #data: string[] = []
  #comments: string[] = []
  #event: string | undefined
  #id: string | undefined
  #retry: number | undefined
  #eventBytes = 0
  #totalBytes = 0
  #finished = false
  #done = false
  #sawBom = false

  constructor(limits: Partial<CompatibleWireLimits> = {}) {
    try {
      this.#limits = resolveCompatibleWireLimits(limits)
    } catch {
      throw createCompatibleWireError({ code: 'compatible_config_invalid', category: 'framing', stage: 'request' })
    }
  }

  push(chunk: Uint8Array): readonly CompatibleSseFrame[] {
    if (this.#finished) throw malformed()
    if (!ArrayBuffer.isView(chunk) || chunk.BYTES_PER_ELEMENT !== 1) throw malformed()
    if (chunk.byteLength === 0) return []
    if (this.#done) throw malformed()
    this.#totalBytes += chunk.byteLength
    if (this.#totalBytes > this.#limits.maxTotalBytes) throw overflow()
    let text: string
    try {
      text = this.#decoder.decode(chunk, { stream: true })
    } catch {
      throw malformed()
    }
    if (!this.#sawBom) {
      this.#sawBom = true
      if (text.startsWith('\uFEFF')) text = text.slice(1)
    }
    this.#pending += text
    const frames = this.#drainCompleteLines()
    if (this.#done && this.#pending.length > 0) throw withPartialFrames(malformed(), frames)
    return frames
  }

  finish(): readonly CompatibleSseFrame[] {
    if (this.#finished) return []
    this.#finished = true
    if (this.#done) return []
    let tail: string
    try {
      tail = this.#decoder.decode()
    } catch {
      throw malformed()
    }
    this.#pending += tail
    const output = [...this.#drainCompleteLines()]
    try {
      if (this.#pending.length > 0) {
        if (this.#pending.includes('\r')) throw malformed()
        output.push(...this.#acceptLine(this.#pending))
        this.#pending = ''
      }
      if (this.#hasEventState()) output.push(...this.#dispatch())
      return output
    } catch (error) {
      if (error instanceof CompatibleWireError && output.length > 0) throw withPartialFrames(error, output)
      throw error
    }
  }

  get sawDone(): boolean {
    return this.#done
  }

  #drainCompleteLines(): CompatibleSseFrame[] {
    const output: CompatibleSseFrame[] = []
    try {
      while (true) {
        const newline = this.#pending.indexOf('\n')
        if (newline < 0) break
        let line = this.#pending.slice(0, newline)
        this.#pending = this.#pending.slice(newline + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (line.includes('\r')) throw malformed()
        output.push(...this.#acceptLine(line))
      }
      this.#assertPendingLimit()
      return output
    } catch (error) {
      if (error instanceof CompatibleWireError && output.length > 0) throw withPartialFrames(error, output)
      throw error
    }
  }

  #acceptLine(line: string): CompatibleSseFrame[] {
    if (this.#done) {
      if (line.length > 0) throw malformed()
      return []
    }
    if (line === '') return this.#dispatch()
    if (line.startsWith(':')) {
      this.#comments.push(removeSingleSpace(line.slice(1)))
      this.#addEventBytes(line)
      return []
    }
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    const value = colon < 0 ? '' : removeSingleSpace(line.slice(colon + 1))
    if (field === 'data') this.#data.push(value)
    else if (field === 'event') this.#event = value
    else if (field === 'id' && !value.includes('\0')) this.#id = value
    else if (field === 'retry' && /^\d+$/.test(value)) {
      const parsed = Number(value)
      if (Number.isSafeInteger(parsed)) this.#retry = parsed
    }
    if (field === 'data' || field === 'event' || field === 'id' || field === 'retry') this.#addEventBytes(line)
    return []
  }

  #dispatch(): CompatibleSseFrame[] {
    const data = this.#data.join('\n')
    const frame: CompatibleSseFrame = data === '[DONE]'
      ? Object.freeze({ kind: 'done' as const })
      : Object.freeze({
          kind: 'event' as const,
          data,
          ...(this.#event === undefined ? {} : { event: this.#event }),
          ...(this.#id === undefined ? {} : { id: this.#id }),
          ...(this.#retry === undefined ? {} : { retry: this.#retry }),
          comments: Object.freeze([...this.#comments]),
        })
    this.#data = []
    this.#comments = []
    this.#event = undefined
    this.#id = undefined
    this.#retry = undefined
    this.#eventBytes = 0
    if (frame.kind === 'done') this.#done = true
    return [frame]
  }

  #hasEventState(): boolean {
    return this.#data.length > 0 || this.#comments.length > 0 || this.#event !== undefined || this.#id !== undefined || this.#retry !== undefined
  }

  #assertPendingLimit(): void {
    if (this.#encoder.encode(this.#pending).byteLength > this.#limits.maxPendingBytes) throw overflow()
  }

  #addEventBytes(line: string): void {
    this.#eventBytes += this.#encoder.encode(line).byteLength + 1
    if (this.#eventBytes > this.#limits.maxEventBytes) throw overflow()
  }
}

function removeSingleSpace(value: string): string {
  return value.startsWith(' ') ? value.slice(1) : value
}

function malformed() {
  return createCompatibleWireError({ code: 'compatible_sse_malformed', stage: 'stream', category: 'framing' })
}

function overflow() {
  return createCompatibleWireError({ code: 'compatible_sse_overflow', stage: 'stream', category: 'framing' })
}

function withPartialFrames(error: CompatibleWireError, frames: readonly CompatibleSseFrame[]): CompatibleWireError {
  PARTIAL_FRAMES.set(error, Object.freeze([...frames]))
  return error
}
