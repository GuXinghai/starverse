import { describe, expect, it } from 'vitest'
import type { SearchHit } from './searchTypes'
import { collectNameMatchIds, cycleMatchIndex, decodeSearchScopeDefault, DEFAULT_SEARCH_SCOPE, matchNavLabel } from './searchUiState'

const hit = (entityType: SearchHit['entityType'], entityId: string): SearchHit =>
  ({ entityType, entityId, createdAtSec: 0, snippet: '', score: 0 })

describe('search UI state', () => {
  it('cycles 1/n navigation: previous wraps 1/n to n/n, next wraps n/n to 1/n', () => {
    expect(matchNavLabel(0, 3)).toBe('1/3')
    expect(matchNavLabel(cycleMatchIndex(0, 3, -1), 3)).toBe('3/3')
    expect(matchNavLabel(cycleMatchIndex(2, 3, 1), 3)).toBe('1/3')
    expect(matchNavLabel(cycleMatchIndex(0, 3, 1), 3)).toBe('2/3')
    expect(matchNavLabel(cycleMatchIndex(2, 3, -1), 3)).toBe('2/3')
    expect(cycleMatchIndex(0, 1, 1)).toBe(0)
    expect(cycleMatchIndex(0, 1, -1)).toBe(0)
  })

  it('takes highlighted names only from project and conversation hits, never message hits', () => {
    expect(collectNameMatchIds([hit('project', 'p1'), hit('convo', 'c1'), hit('message', 'm1'), hit('convo', 'c2')]))
      .toEqual({ projectIds: ['p1'], convoIds: ['c1', 'c2'] })
  })

  it('decodes a persisted default scope and falls back to all scopes for malformed or empty values', () => {
    const custom = { projectName: false, convoName: true, userMessages: true, assistantMessages: false }
    expect(decodeSearchScopeDefault(custom)).toEqual(custom)
    expect(decodeSearchScopeDefault(undefined)).toEqual(DEFAULT_SEARCH_SCOPE)
    expect(decodeSearchScopeDefault({ ...custom, extra: true })).toEqual(DEFAULT_SEARCH_SCOPE)
    expect(decodeSearchScopeDefault({ ...custom, userMessages: 'yes' })).toEqual(DEFAULT_SEARCH_SCOPE)
    expect(decodeSearchScopeDefault({ projectName: false, convoName: false, userMessages: false, assistantMessages: false }))
      .toEqual(DEFAULT_SEARCH_SCOPE)
  })
})
