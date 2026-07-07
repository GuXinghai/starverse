import type { ProviderStreamConfig } from '../../src/next/provider/providerTypes'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

export function validateProviderGenerationParamsPayload(
  raw: unknown,
): ProviderStreamConfig['generationParams'] | null | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isPlainRecord(raw)) return null
  try {
    const text = JSON.stringify(raw)
    if (text.length > 20000) return null
    const parsed = JSON.parse(text)
    return isPlainRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}
