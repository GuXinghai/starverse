import type { CompatibleJsonValue } from '../request/messageTypes'
import { createCompatibleWireError } from './wireError'
import { resolveCompatibleWireLimits, type CompatibleExtensionCandidate, type CompatibleWireLimits } from './wireTypes'

export class CompatibleExtensionCollector {
  readonly #limits: CompatibleWireLimits
  readonly #encoder = new TextEncoder()
  #count = 0
  #totalBytes = 0

  constructor(limits: Partial<CompatibleWireLimits> = {}) {
    try {
      this.#limits = resolveCompatibleWireLimits(limits)
    } catch {
      throw createCompatibleWireError({ code: 'compatible_config_invalid', category: 'extension', stage: 'request' })
    }
  }

  collect(input: Readonly<{
    object: Readonly<Record<string, CompatibleJsonValue>>
    knownKeys: ReadonlySet<string>
    sourcePath: readonly (string | number)[]
    choiceIndex?: number
  }>): readonly CompatibleExtensionCandidate[] {
    const result: CompatibleExtensionCandidate[] = []
    for (const [key, value] of Object.entries(input.object)) {
      if (input.knownKeys.has(key)) continue
      let serialized: string
      try {
        serialized = JSON.stringify(value)
      } catch {
        throw overflow()
      }
      const bytes = this.#encoder.encode(serialized).byteLength
      this.#count += 1
      this.#totalBytes += bytes
      if (this.#count > this.#limits.maxExtensionCandidates ||
        bytes > this.#limits.maxExtensionValueBytes ||
        this.#totalBytes > this.#limits.maxExtensionTotalBytes) {
        throw overflow()
      }
      result.push(Object.freeze({
        sourcePath: Object.freeze([...input.sourcePath, key]),
        ...(input.choiceIndex === undefined ? {} : { choiceIndex: input.choiceIndex }),
        value,
      }))
    }
    return result
  }
}

function overflow() {
  return createCompatibleWireError({ code: 'compatible_extension_overflow', category: 'extension' })
}
