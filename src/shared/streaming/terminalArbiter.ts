export class TerminalArbiter {
  #terminated = false

  get isTerminated(): boolean {
    return this.#terminated
  }

  tryEnterTerminal(): boolean {
    if (this.#terminated) return false
    this.#terminated = true
    return true
  }
}

