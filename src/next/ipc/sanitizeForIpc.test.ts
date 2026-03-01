import { describe, expect, it } from 'vitest'
import { isProxy, reactive } from 'vue'
import { sanitizeForIpc } from './sanitizeForIpc'

describe('sanitizeForIpc', () => {
  it('deeply strips Vue reactive proxies and keeps payload cloneable', () => {
    const payload = reactive({
      meta: {
        selectedModelKey: 'google/gemini-2.5-flash-image',
        webSearchOverride: reactive({
          searchMode: 'default',
          maxResults: 5,
        }),
      },
    })

    const sanitized = sanitizeForIpc(payload)
    expect(isProxy(sanitized)).toBe(false)
    expect(isProxy((sanitized as any).meta)).toBe(false)
    expect(isProxy((sanitized as any).meta.webSearchOverride)).toBe(false)
    expect(() => structuredClone(sanitized)).not.toThrow()
  })

  it('preserves circular references', () => {
    const a: Record<string, unknown> = {}
    const b: Record<string, unknown> = { a }
    a.b = b
    const reactivePayload = reactive({ a })

    const sanitized = sanitizeForIpc(reactivePayload) as any
    expect(sanitized.a.b.a).toBe(sanitized.a)
    expect(() => structuredClone(sanitized)).not.toThrow()
  })

  it('drops non-cloneable function and symbol values', () => {
    const payload = reactive({
      meta: {
        ok: true,
        fn: () => 1,
        nested: {
          marker: Symbol('x'),
          arr: [1, () => 2, Symbol('y')],
        },
      },
    })

    const sanitized = sanitizeForIpc(payload) as any
    expect(sanitized.meta.ok).toBe(true)
    expect(sanitized.meta.fn).toBeUndefined()
    expect(sanitized.meta.nested.marker).toBeUndefined()
    expect(sanitized.meta.nested.arr[0]).toBe(1)
    expect(sanitized.meta.nested.arr[1]).toBeUndefined()
    expect(sanitized.meta.nested.arr[2]).toBeUndefined()
    expect(() => structuredClone(sanitized)).not.toThrow()
  })
})
