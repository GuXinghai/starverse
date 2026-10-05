import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchModal from './SearchModal.vue'
import ConversationList from './ConversationList.vue'

describe('SearchModal scope selection', () => {
  const originalStore = (globalThis as any).electronStore
  const originalBridge = (window as any).generationV2
  let query: ReturnType<typeof vi.fn>, set: ReturnType<typeof vi.fn>, stored: unknown

  beforeEach(() => {
    query = vi.fn(async () => ({ ok: true, value: [] }))
    set = vi.fn(async () => true)
    stored = undefined
    ;(globalThis as any).electronStore = { get: vi.fn(async () => ({ searchScopeDefault: stored })), set }
    ;(window as any).generationV2 = { search: { query, rebuild: vi.fn() } }
  })
  afterEach(() => {
    cleanup()
    ;(globalThis as any).electronStore = originalStore
    ;(window as any).generationV2 = originalBridge
  })

  const props = { open: true, projects: [], convos: [], activeProjectId: null, activeConvoId: null, selectHit: vi.fn(async () => true) }

  async function openModal() {
    const view = render(SearchModal, { props: { ...props, open: false } })
    await view.rerender({ ...props, open: true })
  }

  async function submit(text: string) {
    const input = await screen.findByPlaceholderText('Search...')
    await fireEvent.update(input, text)
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(query).toHaveBeenCalled())
    return query.mock.calls.at(-1)![0]
  }

  it('starts from the persisted default scope and sends per-search checkbox overrides explicitly', async () => {
    stored = { projectName: false, convoName: true, userMessages: true, assistantMessages: false }
    await openModal()
    await waitFor(() => expect(screen.getByTestId('search-scope-project')).not.toBeChecked())
    expect(screen.getByTestId('search-scope-convo')).toBeChecked()
    expect(screen.getByTestId('search-scope-user')).toBeChecked()
    expect(screen.getByTestId('search-scope-assistant')).not.toBeChecked()
    await fireEvent.click(screen.getByTestId('search-scope-assistant'))
    await fireEvent.click(screen.getByTestId('search-scope-convo'))
    const sent = await submit('nebula')
    expect(sent.scope).toEqual({ projectName: false, convoName: false, userMessages: true, assistantMessages: true })
    expect(set).not.toHaveBeenCalled()
  })

  it('persists the current scope only when saved as the default, and refuses an empty scope', async () => {
    await openModal()
    await waitFor(() => expect(screen.getByTestId('search-scope-project')).toBeChecked())
    await fireEvent.click(screen.getByTestId('search-scope-project'))
    await fireEvent.click(screen.getByTestId('search-scope-assistant'))
    await fireEvent.click(screen.getByTestId('search-scope-save-default'))
    await waitFor(() => expect(set).toHaveBeenCalledWith('generationV2UiPreferences.searchScopeDefault',
      { projectName: false, convoName: true, userMessages: true, assistantMessages: false }))
    await fireEvent.click(screen.getByTestId('search-scope-convo'))
    await fireEvent.click(screen.getByTestId('search-scope-user'))
    expect(screen.getByTestId('search-scope-save-default')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })

  it('does not filter by the active conversation or project unless the user selects one', async () => {
    const active = { ...props, activeProjectId: 'p-active', activeConvoId: 'hidden-new-chat',
      convos: [{ id: 'hidden-new-chat', title: 'New Chat' }, { id: 'c2', title: 'Other' }] }
    const view = render(SearchModal, { props: { ...active, open: false } })
    await view.rerender({ ...active, open: true })
    const first = await submit('nebula')
    expect(first.convoId ?? null).toBeNull()
    expect(first.projectId ?? null).toBeNull()

    await fireEvent.click(screen.getByText('Show filters'))
    const convoSelect = screen.getAllByRole('combobox').find((el) => el.textContent?.includes('Other'))!
    await fireEvent.update(convoSelect, 'c2')
    expect((await submit('nebula')).convoId).toBe('c2')

    await view.rerender({ ...active, open: false })
    await view.rerender({ ...active, open: true })
    query.mockClear()
    expect((await submit('nebula')).convoId ?? null).toBeNull()
  })
})

describe('ConversationList search highlighting', () => {
  afterEach(cleanup)
  it('marks only matched project names and conversation titles', () => {
    render(ConversationList, { props: {
      items: [{ id: 'c1', title: 'Matched title', updatedAt: 1 }, { id: 'c2', title: 'Other title', updatedAt: 2 }],
      activeId: null, activeProjectId: null, inboxId: 'inbox',
      projects: [{ id: 'p1', name: 'Matched project' }, { id: 'p2', name: 'Other project' }],
      highlightedProjectIds: ['p1'], highlightedConvoIds: ['c1'],
    } })
    expect(screen.getByTestId('project-name-match-p1')).toHaveTextContent('Matched project')
    expect(screen.queryByTestId('project-name-match-p2')).toBeNull()
    expect(screen.getByTestId('convo-title-match-c1')).toHaveTextContent('Matched title')
    expect(screen.queryByTestId('convo-title-match-c2')).toBeNull()
  })
})
