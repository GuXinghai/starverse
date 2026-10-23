/**
 * Normalizes SSE line endings (CRLF, CR or LF) to LF across chunk boundaries.
 * A CR that ends one chunk is held back until the next chunk shows whether an
 * LF follows it, so a CRLF split between chunks stays one line break (P4a-05).
 */
export class SseLineEndingNormalizerV1 {
  #trailingCr = false

  push(text: string): string {
    if (this.#trailingCr) {
      text = `\r${text}`
      this.#trailingCr = false
    }
    if (text.endsWith('\r')) {
      text = text.slice(0, -1)
      this.#trailingCr = true
    }
    return text.replace(/\r\n?/gu, '\n')
  }

  /** Flushes a held CR as a line break at the end of the stream. */
  finish(text = ''): string {
    const normalized = this.push(text)
    if (!this.#trailingCr) return normalized
    this.#trailingCr = false
    return `${normalized}\n`
  }
}
