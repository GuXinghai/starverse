import type { CompatibleDecodedItem } from './semanticDecoder'
import type { CompatibleWireEvent, CompatibleWireSource } from './wireTypes'

export function mapCompatibleDecodedItems(input: Readonly<{
  items: readonly CompatibleDecodedItem[]
  source: CompatibleWireSource
  nextSequence: () => number
}>): readonly CompatibleWireEvent[] {
  return input.items.map((item): CompatibleWireEvent => {
    const sequence = input.nextSequence()
    if (item.kind === 'meta') return Object.freeze({ kind: 'response_meta', source: input.source, sequence, meta: item.meta })
    if (item.kind === 'role') return Object.freeze({ kind: 'choice_role', source: input.source, sequence, choiceIndex: item.choiceIndex, role: item.role })
    if (item.kind === 'content') return Object.freeze({ kind: 'choice_content', source: input.source, sequence, choiceIndex: item.choiceIndex, content: item.content })
    if (item.kind === 'tool') return Object.freeze({ kind: 'tool_fragment', source: input.source, sequence, choiceIndex: item.choiceIndex, fragment: item.fragment })
    if (item.kind === 'finish') return Object.freeze({ kind: 'choice_finish', source: input.source, sequence, choiceIndex: item.choiceIndex, finishReason: item.finishReason })
    if (item.kind === 'usage') return Object.freeze({ kind: 'usage', source: input.source, sequence, usage: item.usage })
    if (item.kind === 'extension') return Object.freeze({ kind: 'extension', source: input.source, sequence, candidate: item.candidate })
    throw new Error('compatible_provider_error_requires_terminal_mapping')
  })
}
