import { CompatibleExtensionCollector } from './extensionCapture'
import { decodeCompatibleResponseObject, parseCompatibleJsonBytes } from './semanticDecoder'
import { mapCompatibleDecodedItems } from './semanticMapper'
import { CompatibleWireError, createCompatibleWireError } from './wireError'
import { resolveCompatibleWireLimits, type CompatibleWireEvent, type CompatibleWireLimits } from './wireTypes'

export function decodeCompatibleNonStreamResponse(input: Readonly<{
  bytes: Uint8Array
  expectedChoiceCount?: number
  limits?: Partial<CompatibleWireLimits>
}>): readonly CompatibleWireEvent[] {
  let sequence = 0
  const nextSequence = () => sequence++
  const terminal = (outcome: 'done' | 'error', error?: CompatibleWireError['envelope']): CompatibleWireEvent => Object.freeze({
    kind: 'terminal',
    source: 'non_stream',
    sequence: nextSequence(),
    outcome,
    ...(error === undefined ? {} : { error }),
  })
  try {
    const expected = input.expectedChoiceCount ?? 1
    if (!Number.isInteger(expected) || expected < 1 || expected > 16) {
      throw createCompatibleWireError({ code: 'compatible_config_invalid', category: 'shape', stage: 'request' })
    }
    let limits: CompatibleWireLimits
    try {
      limits = resolveCompatibleWireLimits(input.limits)
    } catch {
      throw createCompatibleWireError({ code: 'compatible_config_invalid', category: 'shape', stage: 'request' })
    }
    const value = parseCompatibleJsonBytes(input.bytes, { maxBytes: limits.maxNonStreamBytes, malformedCode: 'compatible_json_malformed' })
    const decoded = decodeCompatibleResponseObject({
      value,
      source: 'non_stream',
      collector: new CompatibleExtensionCollector(limits),
      expectedChoiceCount: expected,
    })
    const providerError = decoded.items.find((item) => item.kind === 'provider_error')
    if (providerError?.kind === 'provider_error') return [terminal('error', providerError.error)]
    assertComplete(decoded.choiceIndexes, expected)
    return Object.freeze([
      ...mapCompatibleDecodedItems({ items: decoded.items, source: 'non_stream', nextSequence }),
      terminal('done'),
    ])
  } catch (error) {
    const normalized = error instanceof CompatibleWireError
      ? error
      : createCompatibleWireError({ code: 'compatible_json_malformed', category: 'json' })
    return Object.freeze([terminal('error', normalized.envelope)])
  }
}

function assertComplete(indexes: readonly number[], expected: number): void {
  if (indexes.length !== expected) throw createCompatibleWireError({ code: 'compatible_response_unsupported', category: 'shape' })
  const set = new Set(indexes)
  for (let index = 0; index < expected; index += 1) {
    if (!set.has(index)) throw createCompatibleWireError({ code: 'compatible_response_unsupported', category: 'shape' })
  }
}
