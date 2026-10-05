import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'
import type { SearchScope } from './searchTypes'
import { decodeSearchScopeDefault, hasSearchScope } from './searchUiState'

const KEY = 'searchScopeDefault'

export async function getSearchScopeDefault(): Promise<SearchScope> {
  return decodeSearchScopeDefault(await getGenerationV2UiPreference(KEY))
}

export async function setSearchScopeDefault(scope: SearchScope): Promise<boolean> {
  if (!hasSearchScope(scope)) return false
  return setGenerationV2UiPreference(KEY, {
    projectName: scope.projectName, convoName: scope.convoName,
    userMessages: scope.userMessages, assistantMessages: scope.assistantMessages,
  })
}
