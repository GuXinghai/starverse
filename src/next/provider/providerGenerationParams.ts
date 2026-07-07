export function asProviderGenerationParamsRecord(raw: unknown): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('generationParams must be an object')
  }
  return raw as Record<string, unknown>
}

export function applyProviderGenerationParamsPatch(input: Readonly<{
  target: Record<string, unknown>
  raw: unknown
  allowedKeys: ReadonlySet<string>
  providerLabel: string
}>): void {
  const patch = asProviderGenerationParamsRecord(input.raw)
  if (!patch) return
  for (const [key, value] of Object.entries(patch)) {
    if (!input.allowedKeys.has(key)) {
      throw new Error(`${input.providerLabel} generationParams.${key} is not supported`)
    }
    if (value !== undefined) input.target[key] = value
  }
}
