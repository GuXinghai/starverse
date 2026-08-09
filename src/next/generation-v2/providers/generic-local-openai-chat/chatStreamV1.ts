export type GenericLocalOpenAIChatStreamResultV1 = Readonly<{
  assistantMessage: Readonly<{ role: 'assistant'; content: string | null }>
  responseId: string
  model: string
  finishReason: string
  usage: Readonly<Record<string, unknown>> | null
}>

export class GenericLocalOpenAIChatSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #done = false
  #wireBytes = 0
  push(bytes: Uint8Array): readonly unknown[] {
    if (this.#done) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_SEQUENCE_INVALID')
    this.#wireBytes += bytes.byteLength
    if (this.#wireBytes > 64 * 1024 * 1024) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_LIMIT_EXCEEDED')
    this.#buffer += this.#decoder.decode(bytes, { stream: true }).replace(/\r\n?/gu, '\n')
    return this.#drain()
  }
  finish(): readonly unknown[] {
    this.#buffer += this.#decoder.decode().replace(/\r\n?/gu, '\n')
    const values = this.#drain()
    if (this.#buffer.length !== 0 || !this.#done) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_TERMINAL_INVALID')
    return values
  }
  #drain(): readonly unknown[] {
    const values: unknown[] = []
    while (true) {
      const boundary = this.#buffer.indexOf('\n\n')
      if (boundary < 0) break
      const block = this.#buffer.slice(0, boundary); this.#buffer = this.#buffer.slice(boundary + 2)
      const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart())
      if (data.length === 0) continue
      const raw = data.join('\n')
      if (raw === '[DONE]') { this.#done = true; continue }
      if (this.#done) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_SEQUENCE_INVALID')
      try { values.push(JSON.parse(raw)) } catch { throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID') }
    }
    return Object.freeze(values)
  }
}

export class GenericLocalOpenAIChatStreamAssemblerV1 {
  #id: string | null = null; #model: string | null = null; #content = ''; #finish: string | null = null
  #usage: Readonly<Record<string, unknown>> | null = null
  push(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value) || this.#finish) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID')
    const chunk = value as Record<string, unknown>
    if (typeof chunk.id !== 'string' || typeof chunk.model !== 'string') throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID')
    if (this.#id && this.#id !== chunk.id || this.#model && this.#model !== chunk.model) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_SEQUENCE_INVALID')
    this.#id = chunk.id; this.#model = chunk.model
    if (!Array.isArray(chunk.choices) || chunk.choices.length > 1) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID')
    if (chunk.choices.length === 0) {
      if (!chunk.usage || typeof chunk.usage !== 'object' || Array.isArray(chunk.usage) || this.#usage) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID')
      this.#usage = Object.freeze({ ...(chunk.usage as Record<string, unknown>) }); return ''
    }
    const choice = chunk.choices[0] as Record<string, unknown>
    if (!choice || choice.index !== 0 || !choice.delta || typeof choice.delta !== 'object' || Array.isArray(choice.delta)) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID')
    const delta = choice.delta as Record<string, unknown>
    if (delta.role !== undefined && delta.role !== 'assistant') throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID')
    if (delta.content !== undefined && delta.content !== null && typeof delta.content !== 'string') throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID')
    const text = typeof delta.content === 'string' ? delta.content : ''; this.#content += text
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      if (typeof choice.finish_reason !== 'string') throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID')
      this.#finish = choice.finish_reason
    }
    return text
  }
  finish(): GenericLocalOpenAIChatStreamResultV1 {
    if (!this.#id || !this.#model || !this.#finish) throw new Error('GENERATION_V2_GENERIC_LOCAL_STREAM_TERMINAL_INVALID')
    return Object.freeze({ assistantMessage: Object.freeze({ role: 'assistant', content: this.#content || null }),
      responseId: this.#id, model: this.#model, finishReason: this.#finish, usage: this.#usage })
  }
}
