import { dbService } from './db'
import type { FulltextSearchResult, FulltextSearchParams } from './db/types'
import {
  buildSearchParams,
  parseSearchInput,
  SearchDslError,
  type SearchDslParseResult
} from './searchDsl'

export type SearchOptions = Partial<Omit<FulltextSearchParams, 'query'>>

export const parseSearch = (input: string): SearchDslParseResult => {
  return parseSearchInput(input)
}

export const runFulltextSearch = async (
  input: string,
  options?: SearchOptions
): Promise<FulltextSearchResult[]> => {
  const params = buildSearchParams(input, options)
  return dbService.searchFulltext(params)
}

export { SearchDslError }

