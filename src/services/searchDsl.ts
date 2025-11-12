import type { FulltextSearchParams } from './db/types'

export type SearchDslFilters = {
  projectId?: string | null
  tagIds: string[]
  after?: number
  before?: number
  highlight?: boolean
  limit?: number
  offset?: number
}

export type SearchDslParseResult = {
  textQuery: string
  filters: SearchDslFilters
  warnings: string[]
}

export class SearchDslError extends Error {
  constructor(
    public code: 'TEXT_QUERY_REQUIRED' | 'INVALID_DATE',
    message: string
  ) {
    super(message)
    this.name = 'SearchDslError'
  }
}

const WHITESPACE_REGEX = /\s/

export const parseSearchInput = (input: string): SearchDslParseResult => {
  const tokens = tokenize(input)
  const queryTokens: string[] = []
  const filters: SearchDslFilters = {
    tagIds: []
  }
  const warnings: string[] = []

  for (const token of tokens) {
    const colonIndex = token.indexOf(':')
    if (colonIndex > 0) {
      const key = token.slice(0, colonIndex).toLowerCase()
      const rawValue = token.slice(colonIndex + 1)
      const value = stripQuotes(rawValue)

      switch (key) {
        case 'tag':
        case 'tags': {
          const ids = value.split(',').map((item) => item.trim()).filter(Boolean)
          filters.tagIds.push(...ids)
          break
        }
        case 'project':
        case 'projectid': {
          filters.projectId = value || undefined
          break
        }
        case 'after': {
          const parsed = parseDateValue(value)
          if (parsed === null) {
            warnings.push(`无法解析 after:${value}`)
          } else {
            filters.after = parsed
          }
          break
        }
        case 'before': {
          const parsed = parseDateValue(value)
          if (parsed === null) {
            warnings.push(`无法解析 before:${value}`)
          } else {
            filters.before = parsed
          }
          break
        }
        case 'highlight': {
          filters.highlight = value !== 'false' && value !== '0'
          break
        }
        case 'limit': {
          const num = parseInt(value, 10)
          if (!Number.isNaN(num) && num > 0) {
            filters.limit = num
          } else {
            warnings.push(`limit:${value} 无效`)
          }
          break
        }
        case 'offset': {
          const num = parseInt(value, 10)
          if (!Number.isNaN(num) && num >= 0) {
            filters.offset = num
          } else {
            warnings.push(`offset:${value} 无效`)
          }
          break
        }
        default: {
          queryTokens.push(token)
        }
      }
    } else if (token.trim().length > 0) {
      queryTokens.push(token)
    }
  }

  return {
    textQuery: queryTokens.join(' ').trim(),
    filters,
    warnings
  }
}

export const buildSearchParams = (
  input: string,
  overrides?: Partial<Omit<FulltextSearchParams, 'query'>>
): FulltextSearchParams => {
  const parsed = parseSearchInput(input)
  if (!parsed.textQuery) {
    throw new SearchDslError('TEXT_QUERY_REQUIRED', '请输入至少一个检索关键词')
  }

  const params: FulltextSearchParams = {
    query: parsed.textQuery,
    projectId: overrides?.projectId ?? parsed.filters.projectId ?? null,
    tagIds: (overrides?.tagIds ?? parsed.filters.tagIds)?.length
      ? overrides?.tagIds ?? parsed.filters.tagIds
      : undefined,
    after: overrides?.after ?? parsed.filters.after,
    before: overrides?.before ?? parsed.filters.before,
    limit: overrides?.limit ?? parsed.filters.limit ?? 50,
    offset: overrides?.offset ?? parsed.filters.offset ?? 0,
    highlight: overrides?.highlight ?? parsed.filters.highlight ?? true
  }

  return params
}

const tokenize = (input: string): string[] => {
  const tokens: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
      continue
    }

    if (!inQuotes && WHITESPACE_REGEX.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

const stripQuotes = (value: string) => {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
  }
  return value
}

const parseDateValue = (value: string): number | null => {
  if (!value) return null

  if (/^\d{10}$/.test(value)) {
    return Number(value) * 1000
  }

  if (/^\d{13}$/.test(value)) {
    return Number(value)
  }

  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return null
  }
  return parsed
}

