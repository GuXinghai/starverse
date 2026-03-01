import { toRaw } from 'vue'

export function sanitizeForIpc<T>(input: T): T {
  return deepToRaw(input, new WeakMap()) as T
}

function deepToRaw(input: unknown, seen: WeakMap<object, unknown>): unknown {
  if (input === null || input === undefined) return input
  if (typeof input === 'function' || typeof input === 'symbol') return undefined
  if (typeof input !== 'object') return input

  const raw = toRaw(input as any)
  if (raw === null || raw === undefined) return raw
  if (typeof raw === 'function' || typeof raw === 'symbol') return undefined
  if (typeof raw !== 'object') return raw

  if (raw instanceof Date) return new Date(raw.getTime())
  if (raw instanceof RegExp) return new RegExp(raw)
  if (raw instanceof ArrayBuffer) return raw.slice(0)
  if (ArrayBuffer.isView(raw)) return cloneArrayBufferView(raw)

  const cached = seen.get(raw)
  if (cached !== undefined) return cached

  if (Array.isArray(raw)) {
    const out: unknown[] = []
    seen.set(raw, out)
    for (const item of raw) out.push(deepToRaw(item, seen))
    return out
  }

  if (raw instanceof Map) {
    const out = new Map<unknown, unknown>()
    seen.set(raw, out)
    for (const [key, value] of raw.entries()) {
      const sanitizedKey = deepToRaw(key, seen)
      if (typeof sanitizedKey === 'function' || typeof sanitizedKey === 'symbol') continue
      out.set(sanitizedKey, deepToRaw(value, seen))
    }
    return out
  }

  if (raw instanceof Set) {
    const out = new Set<unknown>()
    seen.set(raw, out)
    for (const value of raw.values()) {
      out.add(deepToRaw(value, seen))
    }
    return out
  }

  const out: Record<string, unknown> = {}
  seen.set(raw, out)
  for (const key of Object.keys(raw)) {
    const sanitizedValue = deepToRaw((raw as Record<string, unknown>)[key], seen)
    if (typeof sanitizedValue === 'function' || typeof sanitizedValue === 'symbol') continue
    out[key] = sanitizedValue
  }
  return out
}

function cloneArrayBufferView(view: ArrayBufferView): ArrayBufferView {
  if (view instanceof DataView) {
    const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
    return new DataView(buffer)
  }
  const ctor = view.constructor as {
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): ArrayBufferView
  }
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
  const bytesPerElement = (view as any).BYTES_PER_ELEMENT
  const length = typeof bytesPerElement === 'number' && bytesPerElement > 0 ? view.byteLength / bytesPerElement : undefined
  return length === undefined ? new ctor(buffer) : new ctor(buffer, 0, length)
}
