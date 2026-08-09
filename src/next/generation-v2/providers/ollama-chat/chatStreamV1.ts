import type { OllamaNativeChatMessageV1 } from './nativeMessagesV1'
export type OllamaNativeChatStreamResultV1 = Readonly<{ assistantMessage: OllamaNativeChatMessageV1; model: string;
  doneReason: string; usage: Readonly<Record<string, number>> }>
export class OllamaNativeChatNdjsonDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true }); #buffer = ''; #bytes = 0
  push(bytes: Uint8Array): readonly unknown[] { this.#bytes += bytes.byteLength; if (this.#bytes > 64 * 1024 * 1024) throw new Error('GENERATION_V2_OLLAMA_STREAM_LIMIT_EXCEEDED')
    this.#buffer += this.#decoder.decode(bytes, { stream: true }).replace(/\r\n?/gu, '\n'); return this.#drain(false) }
  finish(): readonly unknown[] { this.#buffer += this.#decoder.decode().replace(/\r\n?/gu, '\n'); return this.#drain(true) }
  #drain(flush: boolean): readonly unknown[] { const rows: unknown[] = []; const lines = this.#buffer.split('\n'); this.#buffer = flush ? '' : lines.pop() ?? ''
    if (flush && lines.at(-1) === '') lines.pop(); for (const line of lines) { if (!line.trim()) continue; try { rows.push(JSON.parse(line)) } catch { throw new Error('GENERATION_V2_OLLAMA_STREAM_INVALID') } }
    if (flush && this.#buffer.trim()) throw new Error('GENERATION_V2_OLLAMA_STREAM_INVALID'); return Object.freeze(rows) }
}
export class OllamaNativeChatStreamAssemblerV1 {
  #model: string | null = null; #content = ''; #thinking = ''; #toolCalls: unknown[] = []; #terminal: OllamaNativeChatStreamResultV1 | null = null
  push(value: unknown): Readonly<{ contentDelta: string; thinkingDelta: string }> {
    if (this.#terminal || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GENERATION_V2_OLLAMA_STREAM_SEQUENCE_INVALID')
    const row = value as Record<string, unknown>; if (row.error !== undefined || typeof row.model !== 'string') throw new Error('GENERATION_V2_OLLAMA_STREAM_INVALID')
    if (this.#model && this.#model !== row.model) throw new Error('GENERATION_V2_OLLAMA_STREAM_SEQUENCE_INVALID'); this.#model = row.model
    if (!row.message || typeof row.message !== 'object' || Array.isArray(row.message)) throw new Error('GENERATION_V2_OLLAMA_STREAM_INVALID')
    const message = row.message as Record<string, unknown>; if (message.role !== 'assistant' || typeof message.content !== 'string' ||
      message.thinking !== undefined && typeof message.thinking !== 'string' || message.tool_calls !== undefined && !Array.isArray(message.tool_calls)) throw new Error('GENERATION_V2_OLLAMA_STREAM_INVALID')
    this.#content += message.content; const thought = typeof message.thinking === 'string' ? message.thinking : ''; this.#thinking += thought
    if (Array.isArray(message.tool_calls)) this.#toolCalls.push(...message.tool_calls)
    if (row.done === true) {
      if (typeof row.done_reason !== 'string') throw new Error('GENERATION_V2_OLLAMA_STREAM_TERMINAL_INVALID')
      const usage: Record<string, number> = {}; for (const key of ['total_duration','load_duration','prompt_eval_count','prompt_eval_duration','eval_count','eval_duration']) {
        if (row[key] !== undefined) { if (typeof row[key] !== 'number' || !Number.isFinite(row[key] as number)) throw new Error('GENERATION_V2_OLLAMA_STREAM_TERMINAL_INVALID'); usage[key] = row[key] as number }
      }
      const assistantMessage = Object.freeze({ role: 'assistant' as const, content: this.#content,
        ...(this.#thinking ? { thinking: this.#thinking } : {}), ...(this.#toolCalls.length ? { tool_calls: Object.freeze([...this.#toolCalls]) } : {}) }) as OllamaNativeChatMessageV1
      this.#terminal = Object.freeze({ assistantMessage, model: row.model, doneReason: row.done_reason, usage: Object.freeze(usage) })
    } else if (row.done !== false) throw new Error('GENERATION_V2_OLLAMA_STREAM_INVALID')
    return Object.freeze({ contentDelta: message.content, thinkingDelta: thought })
  }
  finish(): OllamaNativeChatStreamResultV1 { if (!this.#terminal) throw new Error('GENERATION_V2_OLLAMA_STREAM_TERMINAL_INVALID'); return this.#terminal }
}
