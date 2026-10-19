import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchModal from './SearchModal.vue'
import { resetI18nForTests, setLocale, t } from '@/shared/i18n'
import { decodeSearchPreferences } from '@/next/search/searchPreferences'
import { SEARCH_RESULT_ROW_HEIGHT } from '@/next/search/searchLayout'

type Preferences = Parameters<typeof decodeSearchPreferences>[0]

describe('SearchModal result navigation', () => {
  const originalStore = (globalThis as any).electronStore
  const originalBridge = (window as any).generationV2
  let query: ReturnType<typeof vi.fn>
  let preferences: Preferences
  let total: number

  beforeEach(() => {
    resetI18nForTests(); setLocale('en-US')
    total = 500
    preferences = undefined
    query = vi.fn(async (params: any) => {
      const hits = []
      const ascending = params.order !== 'reverse-chronological'
      for (let index = params.offset; index < Math.min(total, params.offset + params.limit); index += 1) {
        const rank = ascending ? index : total - 1 - index
        hits.push({ entityType: 'message', entityId: `m${rank}`, projectId: 'p', convoId: 'c', createdAtSec: rank + 1, snippet: `needle \u0001hit\u0002 ${rank}`, score: rank })
      }
      return { ok: true, value: { hits, hasMore: params.offset + params.limit < total } }
    })
    ;(globalThis as any).electronStore = { get: vi.fn(async () => ({ searchPreferences: preferences })), set: vi.fn(async () => true) }
    ;(window as any).generationV2 = { search: { query, rebuild: vi.fn() } }
  })
  afterEach(() => {
    cleanup()
    ;(globalThis as any).electronStore = originalStore
    ;(window as any).generationV2 = originalBridge
  })

  const selectHit = vi.fn(async () => true)
  const baseProps = { open: true, projects: [], convos: [{ id: 'c', title: 'Chat' }], activeProjectId: null, activeConvoId: null, selectHit }

  async function openAndSearch(onOpenSettings = vi.fn(), onClose = vi.fn()) {
    selectHit.mockClear()
    const view = render(SearchModal, { props: { ...baseProps, open: false, onOpenSettings, onClose } })
    await view.rerender({ ...baseProps, open: true, onOpenSettings, onClose })
    const input = await screen.findByPlaceholderText('Search...')
    await fireEvent.update(input, 'needle')
    await fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByTestId('search-result-toolbar')
    return { view, onOpenSettings, onClose }
  }

  const rowCount = () => document.querySelectorAll('[data-testid^="search-hit-"]').length

  it.each([0, 20])('clears %i results back to the initial hint, keeping this open\'s options', async (count) => {
    total = count
    await openAndSearch()
    await waitFor(() => expect(query).toHaveBeenCalled())
    await fireEvent.update(screen.getByTestId('search-sort'), 'relevance')
    await fireEvent.click(screen.getByTestId('search-presentation-pagination'))
    const input = screen.getByPlaceholderText('Search...')
    await fireEvent.update(input, '   ')
    expect(screen.getByTestId('search-initial-hint')).toBeInTheDocument()
    expect(screen.queryByTestId('search-result-toolbar')).toBeNull()
    expect(screen.queryByText('No results.')).toBeNull()
    expect(rowCount()).toBe(0)
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    await fireEvent.update(input, 'second')
    await fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByTestId('search-result-toolbar')
    expect(screen.getByTestId('search-sort')).toHaveValue('relevance')
    expect(screen.getByTestId('search-presentation-pagination')).toHaveAttribute('aria-pressed', 'true')
    expect((globalThis as any).electronStore.set).not.toHaveBeenCalled()
  })

  it('ignores a search response arriving after clearing, then searches normally again', async () => {
    let finish!: (value: any) => void
    query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await openAndSearch()
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    const input = screen.getByPlaceholderText('Search...')
    await fireEvent.update(input, '')
    finish({ ok: true, value: { hits: [{ entityType: 'project', entityId: 'stale', projectId: 'stale', createdAtSec: 1, snippet: 'stale' }], hasMore: false } })
    await Promise.resolve()
    expect(screen.getByTestId('search-initial-hint')).toBeInTheDocument()
    expect(screen.queryByTestId('search-result-toolbar')).toBeNull()
    await fireEvent.update(input, 'fresh')
    await fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByTestId('search-hit-m0')
    expect(screen.queryByTestId('search-hit-stale')).toBeNull()
  })

  it('does not publish a browser from a search cleared while preferences are loading', async () => {
    let finish!: (value: any) => void
    const store = (globalThis as any).electronStore
    store.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const view = render(SearchModal, { props: { ...baseProps, open: false } })
    await view.rerender({ ...baseProps, open: true })
    const input = screen.getByPlaceholderText('Search...')
    await fireEvent.update(input, 'old')
    await fireEvent.keyDown(input, { key: 'Enter' })
    await fireEvent.update(input, '')
    finish({ searchPreferences: { defaultSort: 'reverse-chronological' } })
    await Promise.resolve()
    expect(query).not.toHaveBeenCalled()
    expect(screen.getByTestId('search-initial-hint')).toBeInTheDocument()
    await fireEvent.update(input, 'new')
    await fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByTestId('search-result-toolbar')
    await waitFor(() => expect(query).toHaveBeenCalled())
    expect(query.mock.calls.every(([params]) => params.q === 'new')).toBe(true)
  })

  it('keeps sidebar results, pagination and sort after opening a detail; explicit close still works', async () => {
    const onClose = vi.fn()
    const props = { ...baseProps, variant: 'sidebar' as const, onClose }
    const view = render(SearchModal, { props: { ...props, open: false } })
    await view.rerender({ ...props, open: true })
    expect(screen.getByRole('search')).not.toHaveAttribute('aria-modal')
    await fireEvent.update(screen.getByPlaceholderText('Search...'), 'needle')
    await fireEvent.keyDown(screen.getByPlaceholderText('Search...'), { key: 'Enter' })
    await screen.findByTestId('search-hit-m0')
    await fireEvent.update(screen.getByTestId('search-sort'), 'relevance')
    await fireEvent.click(screen.getByTestId('search-presentation-pagination'))
    await fireEvent.click(screen.getByTestId('search-hit-m0'))
    await waitFor(() => expect(screen.getByTestId('search-hit-m0')).toHaveAttribute('aria-current', 'true'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText('Search...')).toHaveValue('needle')
    expect(screen.getByTestId('search-sort')).toHaveValue('relevance')
    expect(screen.getByTestId('search-paginator')).toBeInTheDocument()
    await fireEvent.click(screen.getByTestId('search-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves sidebar search open when Escape belongs to the right-hand workspace', async () => {
    const onClose = vi.fn()
    const props = { ...baseProps, variant: 'sidebar' as const, onClose }
    const view = render(SearchModal, { props: { ...props, open: false } })
    await view.rerender({ ...props, open: true })
    await fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    await fireEvent.keyDown(screen.getByPlaceholderText('Search...'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has dialog semantics, an initial hint and closes on Escape', async () => {
    const onClose = vi.fn()
    const view = render(SearchModal, { props: { ...baseProps, open: false, onClose } })
    await view.rerender({ ...baseProps, open: true, onClose })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)).toHaveTextContent('Search')
    expect(screen.getByTestId('search-initial-hint')).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText('Search...')))
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders its text from the active locale', async () => {
    setLocale('zh-CN')
    const view = render(SearchModal, { props: { ...baseProps, open: false } })
    await view.rerender({ ...baseProps, open: true })
    expect(screen.getByRole('dialog')).toHaveAccessibleName('搜索')
    expect(screen.getByText('用户消息')).toBeInTheDocument()
    expect(screen.queryByText('User messages')).toBeNull()
  })

  it('renders a bounded number of rows however many results are loaded', async () => {
    total = 6_000
    preferences = { resultLimit: 5_000, scroll: { loading: 'full' } }
    await openAndSearch()
    await waitFor(() => expect(screen.getByTestId('search-count')).toHaveTextContent('5000 results'))
    expect(rowCount()).toBeGreaterThan(0)
    expect(rowCount()).toBeLessThan(40)
  })

  it('shows the display-limit banner with a working Settings link, and no end-of-results claim', async () => {
    total = 500
    preferences = { resultLimit: 120, scroll: { loading: 'full' } }
    const { onOpenSettings } = await openAndSearch()
    const banner = await screen.findByTestId('search-limit-banner')
    expect(banner).toHaveTextContent(`${t('search.limit.message')}${t('search.limit.link')}`)
    expect(screen.queryByTestId('search-end-of-results')).toBeNull()
    await fireEvent.click(screen.getByTestId('search-limit-settings-link'))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('uses the specified Chinese limit notice', async () => {
    setLocale('zh-CN')
    expect(`${t('search.limit.message')}${t('search.limit.link')}`).toBe('已达到搜索结果显示上限。如需继续加载，跳转设置')
  })

  it('reports the natural end when the limit equals the number of matches', async () => {
    total = 120
    preferences = { resultLimit: 120, scroll: { loading: 'full' } }
    await openAndSearch()
    expect(await screen.findByTestId('search-end-of-results')).toBeInTheDocument()
    expect(screen.queryByTestId('search-limit-banner')).toBeNull()
  })

  it('shows an empty-state message when nothing matches', async () => {
    total = 0
    await openAndSearch()
    expect(await screen.findByText('No results.')).toBeInTheDocument()
  })

  it('changes sort and presentation without activating any result', async () => {
    total = 300
    await openAndSearch()
    await fireEvent.update(screen.getByTestId('search-sort'), 'reverse-chronological')
    await waitFor(() => expect(query.mock.calls.some(([params]) => params.order === 'reverse-chronological' && params.offset === 0)).toBe(true))
    await fireEvent.click(screen.getByTestId('search-presentation-pagination'))
    expect(await screen.findByTestId('search-paginator')).toBeInTheDocument()
    await fireEvent.click(screen.getByTestId('search-presentation-scroll'))
    await waitFor(() => expect(screen.queryByTestId('search-paginator')).toBeNull())
    expect(selectHit).not.toHaveBeenCalled()
  })

  it('does not persist temporary sort or presentation: reopening restores the configured defaults', async () => {
    total = 300
    const { view, onOpenSettings, onClose } = await openAndSearch()
    await fireEvent.update(screen.getByTestId('search-sort'), 'relevance')
    await fireEvent.click(screen.getByTestId('search-presentation-pagination'))
    await view.rerender({ ...baseProps, open: false, onOpenSettings, onClose })
    await view.rerender({ ...baseProps, open: true, onOpenSettings, onClose })
    const input = await screen.findByPlaceholderText('Search...')
    await fireEvent.update(input, 'needle')
    await fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByTestId('search-result-toolbar')
    expect((screen.getByTestId('search-sort') as HTMLSelectElement).value).toBe('chronological')
    expect(screen.getByTestId('search-presentation-scroll')).toHaveAttribute('aria-pressed', 'true')
    expect((globalThis as any).electronStore.set).not.toHaveBeenCalled()
  })

  describe('Pagination', () => {
    it('shows one page of the shared result set with distinct current and selected states', async () => {
      preferences = { defaultPresentation: 'pagination', pagination: { fixedPageSize: 10, prefetchPages: 2 } }
      await openAndSearch()
      await screen.findByTestId('search-paginator')
      await waitFor(() => expect(screen.getByTestId('search-hit-m0')).toBeInTheDocument())
      expect(screen.queryByTestId('search-hit-m10')).toBeNull()
      expect(screen.getByTestId('search-page-1')).toHaveAttribute('data-state', 'both')

      await fireEvent.click(screen.getByTestId('search-page-2'))
      await waitFor(() => expect(screen.getByTestId('search-hit-m10')).toBeInTheDocument())
      expect(screen.queryByTestId('search-hit-m0')).toBeNull()
      expect(screen.getByTestId('search-page-2')).toHaveAttribute('aria-current', 'page')
      expect(selectHit).not.toHaveBeenCalled()
    })

    it('in select-first mode moves the selection only, then navigates on Enter', async () => {
      preferences = {
        defaultPresentation: 'pagination',
        pagination: { fixedPageSize: 10, prefetchPages: 3, pageClick: 'select-first', arrowClick: 'select-first', keyboard: 'select-first' },
      }
      await openAndSearch()
      await waitFor(() => expect(screen.getByTestId('search-page-3')).toBeInTheDocument())
      await fireEvent.click(screen.getByTestId('search-page-3'))
      expect(screen.getByTestId('search-page-3')).toHaveAttribute('data-state', 'selected')
      expect(screen.getByTestId('search-page-1')).toHaveAttribute('data-state', 'current')
      expect(screen.getByTestId('search-hit-m0')).toBeInTheDocument()
      await fireEvent.keyDown(screen.getByTestId('search-paginator'), { key: 'ArrowRight' })
      expect(screen.getByTestId('search-page-4')).toHaveAttribute('data-state', 'selected')
      expect(screen.getByTestId('search-hit-m0')).toBeInTheDocument()
      await fireEvent.keyDown(screen.getByTestId('search-paginator'), { key: 'Enter' })
      await waitFor(() => expect(screen.getByTestId('search-hit-m30')).toBeInTheDocument())
      expect(screen.getByTestId('search-page-4')).toHaveAttribute('data-state', 'both')
    })

    it('keeps the old page and offers a retry when a page cannot be loaded', async () => {
      preferences = { defaultPresentation: 'pagination', pagination: { fixedPageSize: 10, prefetchPages: 1 } }
      await openAndSearch()
      await waitFor(() => expect(screen.getByTestId('search-page-3')).toBeInTheDocument())
      const original = query.getMockImplementation()!
      query.mockImplementation(async () => { throw new Error('boom') })
      await fireEvent.click(screen.getByTestId('search-page-3'))
      await waitFor(() => expect(screen.getByTestId('search-page-error')).toBeInTheDocument())
      expect(screen.getByTestId('search-hit-m0')).toBeInTheDocument()
      expect(screen.getByTestId('search-page-3')).toHaveAttribute('data-state', 'selected')
      query.mockImplementation(original)
      await fireEvent.click(screen.getByTestId('search-page-retry'))
      await waitFor(() => expect(screen.getByTestId('search-hit-m20')).toBeInTheDocument())
      expect(screen.queryByTestId('search-page-error')).toBeNull()
    })

    it('reserves the paginator outside the scrollable result area and shows the capacity notice', async () => {
      total = 400
      preferences = { defaultPresentation: 'pagination', pagination: { fixedPageSize: 1, prefetchPages: 150, capacity: 'standard' } }
      const { onOpenSettings } = await openAndSearch()
      const viewport = await screen.findByTestId('search-result-viewport')
      const paginator = screen.getByTestId('search-paginator')
      expect(viewport.contains(paginator)).toBe(false)
      await waitFor(() => expect(screen.getByTestId('search-page-next')).toBeEnabled())
      for (let i = 0; i < 98; i += 1) {
        await fireEvent.click(screen.getByTestId('search-page-next'))
        await waitFor(() => expect(screen.getByTestId(`search-page-${Math.min(i + 2, 99)}`)).toHaveAttribute('aria-current', 'page'))
      }
      expect(screen.getByTestId('search-page-next')).toBeDisabled()
      const banner = await screen.findByTestId('search-capacity-banner')
      expect(banner).toHaveTextContent('99 pages')
      await fireEvent.click(screen.getByTestId('search-capacity-settings-link'))
      expect(onOpenSettings).toHaveBeenCalled()
    }, 30_000)

    it('measures the real viewport once for Adaptive sizing and keeps it until Re-adapt', async () => {
      let height = 5 * SEARCH_RESULT_ROW_HEIGHT
      const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return height } })
      try {
        preferences = { defaultPresentation: 'pagination', pagination: { pageSizing: 'adaptive', fixedPageSize: 50, prefetchPages: 4 } }
        await openAndSearch()
        await waitFor(() => expect(screen.getByTestId('search-hit-m0')).toBeInTheDocument())
        expect(screen.getByTestId('search-hit-m4')).toBeInTheDocument()
        expect(screen.queryByTestId('search-hit-m20')).toBeNull() // 5 rows per page, not the placeholder fixed size
        expect(screen.getByTestId('search-page-1')).toHaveAttribute('data-state', 'both')
        await waitFor(() => expect(screen.getByTestId('search-page-3')).toBeInTheDocument())
        await fireEvent.click(screen.getByTestId('search-page-3'))
        await waitFor(() => expect(screen.getByTestId('search-hit-m10')).toBeInTheDocument())
        height = 10 * SEARCH_RESULT_ROW_HEIGHT // window grew: nothing changes until the explicit control is used
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(screen.getByTestId('search-page-3')).toHaveAttribute('data-state', 'both')
        await fireEvent.click(screen.getByTestId('search-readapt'))
        await waitFor(() => expect(screen.getByTestId('search-hit-m19')).toBeInTheDocument()) // ten rows per page now
        expect(screen.getByTestId('search-hit-m10')).toBeInTheDocument()
        expect(screen.getByTestId('search-page-2')).toHaveAttribute('data-state', 'both') // old page 3 started at #10
      } finally {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, 'clientHeight', descriptor)
        else delete (HTMLElement.prototype as any).clientHeight
      }
    })

    it('lets Escape close the dialog while the paginator has focus', async () => {
      preferences = { defaultPresentation: 'pagination', pagination: { fixedPageSize: 10 } }
      const { onClose } = await openAndSearch()
      const paginator = await screen.findByTestId('search-paginator')
      paginator.focus()
      await fireEvent.keyDown(paginator, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('offers Re-adapt only for Adaptive sizing', async () => {
      preferences = { defaultPresentation: 'pagination', pagination: { pageSizing: 'adaptive' } }
      await openAndSearch()
      expect(await screen.findByTestId('search-readapt')).toBeInTheDocument()
      cleanup()
      preferences = { defaultPresentation: 'pagination', pagination: { pageSizing: 'fixed' } }
      await openAndSearch()
      await screen.findByTestId('search-paginator')
      expect(screen.queryByTestId('search-readapt')).toBeNull()
    })
  })

  it('activates exactly the clicked result', async () => {
    await openAndSearch()
    await fireEvent.click(await screen.findByTestId('search-hit-m3'))
    expect(selectHit).toHaveBeenCalledTimes(1)
    expect((selectHit.mock.calls[0] as any[])[0]).toMatchObject({ entityId: 'm3' })
    expect((selectHit.mock.calls[0] as any[])[1].hits.length).toBeGreaterThanOrEqual(50)
  })
})
