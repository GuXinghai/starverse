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

  // FTS5 查询语法处理（针对 unicode61 分词器）
  // unicode61 分词器对中文的处理：将每个汉字作为独立的 token
  // 1. 清理 FTS5 特殊字符: " * ( ) AND OR NOT NEAR
  // 2. 对于中文查询，将每个汉字用 AND 连接，确保所有字符都匹配
  let sanitizedQuery = parsed.textQuery
    .replace(/[=<>!@#$%^&\[\]{}\\|;:,"*()]/g, ' ') // 移除特殊字符和引号
    .replace(/\s+/g, ' ') // 合并多个空格
    .trim()

  if (!sanitizedQuery) {
    throw new SearchDslError('TEXT_QUERY_REQUIRED', '请输入有效的检索关键词')
  }

  // 对于包含中文的查询，将字符串拆分成单字并用 AND 连接
  // 这样可以匹配包含所有这些字符的文本（顺序可能不同）
  // 例如: "机器学习" -> "机 AND 器 AND 学 AND 习"
  const hasChinese = /[\u4e00-\u9fa5]/.test(sanitizedQuery)
  let fts5Query: string
  
  if (hasChinese) {
    // 提取所有字符（包括中文和英文单词）
    const chars = sanitizedQuery.split('').filter(c => c.trim())
    // 用 AND 连接所有字符，确保所有字符都存在
    fts5Query = chars.join(' AND ')
  } else {
    // 英文查询保持原样
    fts5Query = sanitizedQuery
  }

  const params: FulltextSearchParams = {
    query: fts5Query,
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

