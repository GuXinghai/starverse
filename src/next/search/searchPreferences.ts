import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'
import type { SearchOrder } from './searchTypes'

export type SearchPresentation = 'scroll' | 'pagination'
export type SearchLoadStrategy = 'full' | 'on-demand'
export type PaginationCapacity = 'standard' | 'extended' | 'unlimited'
export type PageSizing = 'fixed' | 'adaptive'
/** `direct` navigates immediately; `select-first` only moves the selection until Enter activates it. */
export type PaginatorInteraction = 'direct' | 'select-first'

export type SearchPreferences = Readonly<{
  defaultSort: SearchOrder
  defaultPresentation: SearchPresentation
  /** Maximum number of results one search session may retrieve and display. */
  resultLimit: number
  scroll: Readonly<{
    loading: SearchLoadStrategy
    batchSize: number
    prefetchBatches: number
  }>
  pagination: Readonly<{
    loading: SearchLoadStrategy
    prefetchPages: number
    capacity: PaginationCapacity
    pageSizing: PageSizing
    fixedPageSize: number
    arrowClick: PaginatorInteraction
    pageClick: PaginatorInteraction
    keyboard: PaginatorInteraction
  }>
}>

export const DEFAULT_SEARCH_PREFERENCES: SearchPreferences = Object.freeze({
  defaultSort: 'chronological',
  defaultPresentation: 'scroll',
  resultLimit: 5_000,
  scroll: Object.freeze({ loading: 'on-demand', batchSize: 50, prefetchBatches: 3 }),
  pagination: Object.freeze({
    loading: 'on-demand',
    prefetchPages: 2,
    capacity: 'standard',
    pageSizing: 'fixed',
    fixedPageSize: 50,
    arrowClick: 'direct',
    pageClick: 'direct',
    keyboard: 'direct',
  }),
})

/** Page-count ceiling per capacity mode; `unlimited` has none. */
export const PAGINATION_CAPACITY_PAGES: Readonly<Record<PaginationCapacity, number>> = Object.freeze({
  standard: 99,
  extended: 999,
  unlimited: Number.POSITIVE_INFINITY,
})

export const SEARCH_SORT_ORDERS: readonly SearchOrder[] = ['chronological', 'reverse-chronological', 'relevance']

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback
}

function positive(value: unknown, fallback: number): number {
  return isPositiveInteger(value) ? value : fallback
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Decodes a persisted value field by field; an invalid field falls back to its own default only. */
export function decodeSearchPreferences(raw: unknown): SearchPreferences {
  const d = DEFAULT_SEARCH_PREFERENCES
  const root = record(raw)
  const scroll = record(root.scroll)
  const pagination = record(root.pagination)
  const strategies = ['full', 'on-demand'] as const
  const interactions = ['direct', 'select-first'] as const
  return Object.freeze({
    defaultSort: oneOf(root.defaultSort, SEARCH_SORT_ORDERS, d.defaultSort),
    defaultPresentation: oneOf(root.defaultPresentation, ['scroll', 'pagination'] as const, d.defaultPresentation),
    resultLimit: positive(root.resultLimit, d.resultLimit),
    scroll: Object.freeze({
      loading: oneOf(scroll.loading, strategies, d.scroll.loading),
      batchSize: positive(scroll.batchSize, d.scroll.batchSize),
      prefetchBatches: positive(scroll.prefetchBatches, d.scroll.prefetchBatches),
    }),
    pagination: Object.freeze({
      loading: oneOf(pagination.loading, strategies, d.pagination.loading),
      prefetchPages: positive(pagination.prefetchPages, d.pagination.prefetchPages),
      capacity: oneOf(pagination.capacity, ['standard', 'extended', 'unlimited'] as const, d.pagination.capacity),
      pageSizing: oneOf(pagination.pageSizing, ['fixed', 'adaptive'] as const, d.pagination.pageSizing),
      fixedPageSize: positive(pagination.fixedPageSize, d.pagination.fixedPageSize),
      arrowClick: oneOf(pagination.arrowClick, interactions, d.pagination.arrowClick),
      pageClick: oneOf(pagination.pageClick, interactions, d.pagination.pageClick),
      keyboard: oneOf(pagination.keyboard, interactions, d.pagination.keyboard),
    }),
  })
}

const KEY = 'searchPreferences'

export async function getSearchPreferences(): Promise<SearchPreferences> {
  return decodeSearchPreferences(await getGenerationV2UiPreference(KEY))
}

export async function setSearchPreferences(preferences: SearchPreferences): Promise<boolean> {
  return setGenerationV2UiPreference(KEY, decodeSearchPreferences(preferences))
}
