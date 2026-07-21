import { normalizeDfcAttachmentDefaults, type DfcAttachmentDefaults } from '@/shared/files/dfcAttachmentDefaults'
import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

const KEY = 'dfcAttachmentDefaults'

export async function getDfcAttachmentDefaults(): Promise<DfcAttachmentDefaults> {
  return normalizeDfcAttachmentDefaults(await getGenerationV2UiPreference(KEY))
}

export async function setDfcAttachmentDefaults(value: unknown): Promise<boolean> {
  return setGenerationV2UiPreference(KEY, normalizeDfcAttachmentDefaults(value))
}
