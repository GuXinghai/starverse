import { z } from 'zod'
import type { CompatibleLegacyResetService } from '../services/compatibleLegacyResetService'
import type { RegisterInvoke } from './types'

export const COMPATIBLE_LEGACY_RESET_CHANNELS = ['compatible-reset:preview', 'compatible-reset:apply'] as const

export function registerCompatibleLegacyResetIpc(input: Readonly<{ registerInvoke: RegisterInvoke; service: CompatibleLegacyResetService }>): string[] {
  input.registerInvoke('compatible-reset:preview', (_event, raw) => {
    z.object({}).strict().parse(raw ?? {})
    return input.service.preview()
  })
  input.registerInvoke('compatible-reset:apply', (_event, raw) => {
    const command = z.object({ confirmation: z.literal('delete_incompatible_compatible_state') }).strict().parse(raw)
    return input.service.apply(command.confirmation)
  })
  return [...COMPATIBLE_LEGACY_RESET_CHANNELS]
}
