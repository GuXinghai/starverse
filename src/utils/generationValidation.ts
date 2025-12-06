import type { GenerationConfig, SamplingConfig } from '../types/generation'

export interface ValidationResult {
  valid: boolean
  errors: Array<{ field: string; message: string }>
}

export function validateGenerationConfig(config: GenerationConfig): ValidationResult {
  const errors: Array<{ field: string; message: string }> = []
  const s: SamplingConfig | undefined = config.sampling
  if (s) {
    const checkRange = (key: keyof SamplingConfig, min: number, max: number) => {
      const v = s[key] as number | undefined
      if (v !== undefined && (v < min || v > max)) {
        errors.push({ field: `sampling.${String(key)}`, message: `out of range: ${v}` })
      }
    }
    checkRange('temperature', 0, 2)
    checkRange('top_p', 0, 1)
    checkRange('min_p', 0, 1)
    checkRange('top_a', 0, 1)
    checkRange('frequency_penalty', -2, 2)
    checkRange('presence_penalty', -2, 2)
    checkRange('repetition_penalty', 0, 2)
    const tk = s.top_k
    if (tk !== undefined && tk < 0) {
      errors.push({ field: 'sampling.top_k', message: `must be >= 0` })
    }
  }
  // Ensure reasoning has no 'auto' (by type it can't), just presence check
  // Ensure no null values leak
  const scan = (obj: any, path: string) => {
    if (!obj) return
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      if (v === null) errors.push({ field: `${path}.${k}`, message: 'must be undefined, not null' })
    }
  }
  scan(config.sampling, 'sampling')
  scan(config.length, 'length')
  scan(config.reasoning, 'reasoning')
  return { valid: errors.length === 0, errors }
}
