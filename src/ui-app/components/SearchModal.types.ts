import type { SearchHit, SearchQueryParams, SearchScope } from '@/next/search/searchTypes'

export type SearchProjectOption = Readonly<{ id: string; name: string }>
export type SearchConvoOption = Readonly<{ id: string; title: string; projectId?: string | null }>

/** What the modal submitted, handed to the opener so it can highlight name matches and enumerate message matches. */
export type SearchSelectionContext = Readonly<{
  query: string
  scope: SearchScope
  mode: NonNullable<SearchQueryParams['mode']>
  hits: readonly SearchHit[]
}>
