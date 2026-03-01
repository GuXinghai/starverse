import type { RootState } from '../types'
import type { EventByType, HandlerContext } from './reducerTypes'
import {
  annotationMergeKey,
  areAnnotationListsEquivalent,
  dedupeAnnotations,
  freezeOutputStartIfNeeded,
  hasSameImageBlock,
  mergeToolCalls,
  normalizeAnnotation,
  normalizeToolCallDelta,
  updateMessage,
  updateRun,
} from './stateUtils'

export function handleMessageDeltaText(ctx: HandlerContext, event: EventByType<'MessageDeltaText'>): RootState {
  const baseState = event.text ? freezeOutputStartIfNeeded(ctx.state, ctx.runId, event.messageId, ctx.options) : ctx.state
  const nextState = updateMessage(baseState, event.messageId, (m) => {
    if (!event.text) return m

    const nextText = m.contentText + event.text
    const prevBlocks = Array.isArray(m.contentBlocks) ? m.contentBlocks : []

    let nextBlocks = prevBlocks
    const last = prevBlocks.length > 0 ? prevBlocks[prevBlocks.length - 1] : null
    if (!last) {
      nextBlocks = [{ type: 'text', text: event.text } as const]
    } else if (last.type === 'text') {
      nextBlocks = [...prevBlocks.slice(0, -1), { type: 'text', text: last.text + event.text } as const]
    } else {
      nextBlocks = [...prevBlocks, { type: 'text', text: event.text } as const]
    }

    return {
      ...m,
      contentText: nextText,
      contentBlocks: nextBlocks,
      textVersion: m.textVersion + 1,
    }
  })

  if (ctx.run.status === 'requesting') {
    return updateRun(nextState, ctx.runId, (s) => ({ ...s, status: 'streaming' }))
  }
  return nextState
}

export function handleMessageAppendContentBlock(ctx: HandlerContext, event: EventByType<'MessageAppendContentBlock'>): RootState {
  const block = event.block
  const hasBlockContent =
    (block.type === 'text' && typeof (block as any).text === 'string' && (block as any).text.length > 0) ||
    (block.type === 'image' && typeof (block as any).url === 'string' && (block as any).url.length > 0) ||
    block.type === 'unknown'
  const baseState = hasBlockContent ? freezeOutputStartIfNeeded(ctx.state, ctx.runId, event.messageId, ctx.options) : ctx.state
  const nextState = updateMessage(baseState, event.messageId, (m) => {
    const block = event.block

    if (block.type === 'text' && typeof block.text === 'string') {
      const text = block.text
      if (!text) return m

      const prevBlocks = Array.isArray(m.contentBlocks) ? m.contentBlocks : []
      const last = prevBlocks.length > 0 ? prevBlocks[prevBlocks.length - 1] : null
      const nextBlocks =
        last && last.type === 'text'
          ? [...prevBlocks.slice(0, -1), { type: 'text', text: last.text + text } as const]
          : [...prevBlocks, { type: 'text', text } as const]

      return {
        ...m,
        contentText: m.contentText + text,
        contentBlocks: nextBlocks,
        textVersion: m.textVersion + 1,
      }
    }

    if (block.type === 'image' && typeof block.url === 'string') {
      const url = block.url
      if (!url) return m
      if (hasSameImageBlock(m.contentBlocks, url)) return m
      return {
        ...m,
        contentBlocks: [...m.contentBlocks, block],
        textVersion: m.textVersion + 1,
      }
    }

    return {
      ...m,
      contentBlocks: [...m.contentBlocks, block],
      textVersion: m.textVersion + 1,
    }
  })

  if (nextState === ctx.state) return ctx.state
  if (ctx.run.status === 'requesting') {
    return updateRun(nextState, ctx.runId, (s) => ({ ...s, status: 'streaming' }))
  }
  return nextState
}

export function handleMessageDeltaToolCall(ctx: HandlerContext, event: EventByType<'MessageDeltaToolCall'>): RootState {
  const normalizedDeltas = (Array.isArray(event.toolCallDeltas) ? event.toolCallDeltas : [])
    .map(normalizeToolCallDelta)
    .filter((d): d is NonNullable<typeof d> => !!d)

  if (normalizedDeltas.length === 0) return ctx.state
  const baseState = freezeOutputStartIfNeeded(ctx.state, ctx.runId, event.messageId, ctx.options)
  return updateMessage(baseState, event.messageId, (m) => ({
    ...m,
    toolCalls: mergeToolCalls(m.toolCalls, normalizedDeltas, event.mergeStrategy),
  }))
}

export function handleMessageDeltaAnnotationBatch(ctx: HandlerContext, event: EventByType<'MessageDeltaAnnotationBatch'>): RootState {
  const normalized = (Array.isArray(event.annotations) ? event.annotations : [])
    .map(normalizeAnnotation)
    .filter((ann): ann is NonNullable<typeof ann> => !!ann)

  const nextState = updateMessage(ctx.state, event.messageId, (m) => {
    const prev = Array.isArray(m.annotations) ? m.annotations : []
    if (event.mergeStrategy === 'replace') {
      const replaced = dedupeAnnotations(normalized)
      if (areAnnotationListsEquivalent(prev, replaced)) return m
      return {
        ...m,
        annotations: replaced.length > 0 ? replaced : undefined,
      }
    }

    if (normalized.length === 0) return m
    const next = [...prev]
    const indexByKey = new Map<string, number>()
    for (let i = 0; i < next.length; i += 1) {
      indexByKey.set(annotationMergeKey(next[i]), i)
    }
    let changed = false
    for (const ann of normalized) {
      const key = annotationMergeKey(ann)
      const existingIndex = indexByKey.get(key)
      if (typeof existingIndex === 'number') {
        if (next[existingIndex] !== ann) {
          next[existingIndex] = ann
          changed = true
        }
        continue
      }
      indexByKey.set(key, next.length)
      next.push(ann)
      changed = true
    }
    if (!changed) return m
    return {
      ...m,
      annotations: next,
    }
  })

  if (nextState === ctx.state) return ctx.state
  if (ctx.run.status === 'requesting') {
    return updateRun(nextState, ctx.runId, (s) => ({ ...s, status: 'streaming' }))
  }
  return nextState
}
