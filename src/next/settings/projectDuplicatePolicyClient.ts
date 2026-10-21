import { PROJECT_DUPLICATE_POLICY_KEY, normalizeProjectDuplicatePolicy } from '@/shared/settings/projectDuplicatePolicy'
import type { ProjectDuplicatePolicy } from '@/shared/settings/projectDuplicatePolicy'
import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

export async function getProjectDuplicatePolicy(): Promise<ProjectDuplicatePolicy> {
  return normalizeProjectDuplicatePolicy(await getGenerationV2UiPreference(PROJECT_DUPLICATE_POLICY_KEY))
}

export async function setProjectDuplicatePolicy(value: ProjectDuplicatePolicy): Promise<boolean> {
  return setGenerationV2UiPreference(PROJECT_DUPLICATE_POLICY_KEY, value)
}
