import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/vue'
import { t } from '@/shared/i18n'
import ConversationList from './ConversationList.vue'

const props = {
  items: [{ id: 'conversation-a', title: 'Conversation A', updatedAt: 1 }],
  activeId: 'conversation-a',
  activeProjectId: 'project-a',
  inboxId: 'inbox',
  projects: [
    { id: 'inbox', name: 'Inbox', isSystem: true },
    { id: 'project-a', name: 'Project A' },
  ],
}

afterEach(cleanup)

describe.each(['create', 'rename'] as const)('project name %s', (action) => {
  async function open(listeners: Record<string, unknown> = {}) {
    const view = render(ConversationList, { props: { ...props, ...listeners } })
    await fireEvent.click(screen.getByRole('button', { name: t(action === 'create' ? 'navigation.project.newProject' : 'navigation.project.renameProject') }))
    return { view, input: screen.getByPlaceholderText(t('navigation.project.projectName')),
      submit: screen.getByRole('button', { name: t(action === 'create' ? 'common.create' : 'common.save') }) }
  }
  const listener = (submit: (name: string, confirmed: boolean, done: (result: any) => void) => void) => action === 'create'
    ? { onCreateProject: submit } : { onRenameProject: (_id: string, ...args: Parameters<typeof submit>) => submit(...args) }

  it('disables empty and whitespace names and guards Enter', async () => {
    const handler = vi.fn()
    const { input, submit } = await open(listener(handler))
    await fireEvent.update(input, '   ')
    expect(submit).toBeDisabled()
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(handler).not.toHaveBeenCalled()
    await fireEvent.update(input, 'Valid')
    expect(submit).not.toBeDisabled()
  })

  it('keeps the duplicate hint through edits and updates it only after another submission', async () => {
    const handler = vi.fn((_name, _confirmed, done) => done({ status: 'duplicate', policy: 'deny' }))
    const { input, submit } = await open(listener(handler))
    await fireEvent.update(input, 'Duplicate')
    expect(screen.queryByTestId('project-name-error')).toBeNull()
    await fireEvent.click(submit)
    expect(await screen.findByTestId('project-name-error')).toHaveTextContent(t('navigation.project.duplicateName'))
    await fireEvent.update(input, '')
    expect(screen.getByTestId('project-name-error')).toBeInTheDocument()
    await fireEvent.update(input, 'Unique')
    expect(screen.getByTestId('project-name-error')).toBeInTheDocument()
    await fireEvent.click(submit)
    expect(screen.getByTestId('project-name-error')).toBeInTheDocument()
    handler.mockImplementationOnce((_name, _confirmed, done) => done({ status: 'saved', projectId: 'new' }))
    await fireEvent.click(submit)
    await waitFor(() => expect(screen.queryByPlaceholderText(t('navigation.project.projectName'))).toBeNull())
    expect(screen.queryByTestId('project-name-error')).toBeNull()
  })

  it('asks before applying a duplicate and supports cancellation without applying', async () => {
    const handler = vi.fn((_name, confirmed, done) => done(confirmed
      ? { status: 'saved', projectId: 'new' } : { status: 'duplicate', policy: 'ask' }))
    const { input, submit } = await open(listener(handler))
    await fireEvent.update(input, ' Duplicate ')
    await fireEvent.click(submit)
    let confirmation = await screen.findByRole('dialog')
    expect(input).toBeDisabled()
    expect(screen.queryByTestId('project-name-error')).toBeNull()
    await fireEvent.click(within(confirmation).getByRole('button', { name: t('common.cancel') }))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(input).not.toBeDisabled()
    await fireEvent.click(submit)
    confirmation = await screen.findByRole('dialog')
    await fireEvent.click(within(confirmation).getByRole('button', { name: t('common.confirm') }))
    expect(handler.mock.calls.map(([name, confirmed]) => [name, confirmed])).toEqual([
      ['Duplicate', false], ['Duplicate', false], ['Duplicate', true],
    ])
    await waitFor(() => expect(screen.queryByPlaceholderText(t('navigation.project.projectName'))).toBeNull())
  })

  it('prevents repeated submissions while the mutation is pending', async () => {
    const handler = vi.fn()
    const { input, submit } = await open(listener(handler))
    await fireEvent.update(input, 'Valid')
    await fireEvent.click(submit)
    expect(submit).toBeDisabled()
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('ConversationList mutation guards', () => {
  it('keeps search, new conversation, and selection navigation available while mutations are disabled', async () => {
    const view = render(ConversationList, { props: { ...props, mutationDisabled: true } })

    await fireEvent.click(screen.getByText(t('common.search')).closest('button')!)
    await fireEvent.click(screen.getByRole('button', { name: t('common.new') }))
    await fireEvent.click(screen.getByText('Conversation A').closest('button')!)

    expect(view.emitted('openSearch')).toHaveLength(1)
    expect(view.emitted('create')).toHaveLength(1)
    expect(view.emitted('select')?.[0]).toEqual(['conversation-a'])
  })

  it('disables conversation and project mutation controls independently of navigation', async () => {
    render(ConversationList, { props: { ...props, mutationDisabled: true } })

    expect(screen.getByTestId('convo-menu-conversation-a')).toBeDisabled()
    expect(screen.getByRole('button', { name: t('navigation.project.newProject') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('navigation.project.renameProject') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('navigation.project.deleteProject') })).toBeDisabled()

    await fireEvent.click(screen.getByRole('button', { name: t('common.select') }))
    expect(screen.getByRole('button', { name: t('navigation.actions.bulkMove') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('navigation.actions.bulkDelete') })).toBeDisabled()
  })

  it('blocks open conversation and project confirmations if mutations become disabled', async () => {
    const view = render(ConversationList, { props })
    const row = screen.getByTestId('convo-row-conversation-a')

    await fireEvent.click(screen.getByTestId('convo-menu-conversation-a'))
    await fireEvent.click(within(row).getByRole('button', { name: t('common.rename') }))
    let dialog = screen.getByTestId('rename-dialog')
    await view.rerender({ mutationDisabled: true })
    const saveRename = within(dialog).getByRole('button', { name: t('common.save') })
    expect(saveRename).toBeDisabled()
    await fireEvent.click(saveRename)
    expect(view.emitted('rename')).toBeUndefined()
    await fireEvent.click(within(dialog).getByRole('button', { name: t('common.cancel') }))

    await view.rerender({ mutationDisabled: false })
    await fireEvent.click(screen.getByTestId('convo-menu-conversation-a'))
    await fireEvent.click(within(row).getByRole('button', { name: t('common.delete') }))
    dialog = screen.getByTestId('delete-dialog')
    await view.rerender({ mutationDisabled: true })
    const confirmDelete = within(dialog).getByRole('button', { name: t('common.delete') })
    expect(confirmDelete).toBeDisabled()
    await fireEvent.click(confirmDelete)
    expect(view.emitted('delete')).toBeUndefined()
    await fireEvent.click(within(dialog).getByRole('button', { name: t('common.cancel') }))

    await view.rerender({ mutationDisabled: false })
    await fireEvent.click(screen.getByTestId('convo-menu-conversation-a'))
    await fireEvent.click(within(row).getByRole('button', { name: t('common.move') }))
    dialog = screen.getByTestId('move-dialog')
    await view.rerender({ mutationDisabled: true })
    const confirmMove = within(dialog).getByRole('button', { name: t('common.move') })
    expect(confirmMove).toBeDisabled()
    await fireEvent.click(confirmMove)
    expect(view.emitted('moveToProject')).toBeUndefined()
    await fireEvent.click(within(dialog).getByRole('button', { name: t('common.cancel') }))

    await view.rerender({ mutationDisabled: false })
    await fireEvent.click(screen.getByRole('button', { name: t('navigation.project.newProject') }))
    await fireEvent.update(screen.getByPlaceholderText(t('navigation.project.projectName')), 'New project')
    await view.rerender({ mutationDisabled: true })
    const createProject = screen.getByRole('button', { name: t('common.create') })
    expect(createProject).toBeDisabled()
    await fireEvent.click(createProject)
    expect(view.emitted('createProject')).toBeUndefined()
    await fireEvent.click(screen.getByRole('button', { name: t('common.cancel') }))

    await view.rerender({ mutationDisabled: false })
    await fireEvent.click(screen.getByRole('button', { name: t('navigation.project.renameProject') }))
    await view.rerender({ mutationDisabled: true })
    const saveProject = screen.getByRole('button', { name: t('common.save') })
    expect(saveProject).toBeDisabled()
    await fireEvent.click(saveProject)
    expect(view.emitted('renameProject')).toBeUndefined()
    await fireEvent.click(screen.getByRole('button', { name: t('common.cancel') }))

    await view.rerender({ mutationDisabled: false })
    await fireEvent.click(screen.getByRole('button', { name: t('navigation.project.deleteProject') }))
    await view.rerender({ mutationDisabled: true })
    const deleteProject = screen.getByRole('button', { name: t('common.delete') })
    expect(deleteProject).toBeDisabled()
    await fireEvent.click(deleteProject)
    expect(view.emitted('deleteProject')).toBeUndefined()
  })
})

// R5-01 (P6a-01): bulk actions only ever touch rows that are visible when the action is confirmed.
describe('bulk selection follows the visible list', () => {
  const rows = (...ids: string[]) => ids.map((id, index) => ({ id, title: `Title ${id}`, updatedAt: index + 1 }))
  async function selectAll(view: ReturnType<typeof render>) {
    await fireEvent.click(screen.getByTestId('conversation-selection-toggle'))
    await fireEvent.click(screen.getByLabelText(t('navigation.actions.selectAll')))
    return view
  }

  it('drops selected rows that left the list and counts only the visible ones', async () => {
    const view = render(ConversationList, { props: { ...props, items: rows('a', 'b', 'c') } })
    await selectAll(view)
    await view.rerender({ items: rows('c', 'd') })
    expect(screen.getByTestId('bulk-bar')).toHaveTextContent(`${t('navigation.actions.selected')} 1`)
    await fireEvent.click(screen.getByLabelText(t('navigation.actions.bulkDelete')))
    await fireEvent.click(within(screen.getByTestId('delete-dialog')).getByRole('button', { name: t('common.delete') }))
    expect(view.emitted('delete')).toEqual([['c']])
    expect(view.emitted('bulkDelete')).toBeUndefined()
  })

  it('does not delete or move hidden rows after a project switch', async () => {
    const view = render(ConversationList, { props: { ...props, items: rows('a', 'b') } })
    await selectAll(view)
    await view.rerender({ items: rows('x', 'y') })
    expect(screen.getByLabelText(t('navigation.actions.bulkDelete'))).toBeDisabled()
    expect(screen.getByLabelText(t('navigation.actions.bulkMove'))).toBeDisabled()
  })

  it('does not act on rows that left the list while a bulk dialog was open', async () => {
    const view = render(ConversationList, { props: { ...props, items: rows('a', 'b', 'c') } })
    await selectAll(view)
    await fireEvent.click(screen.getByLabelText(t('navigation.actions.bulkDelete')))
    await view.rerender({ items: rows('b', 'c') })
    await fireEvent.click(within(screen.getByTestId('delete-dialog')).getByRole('button', { name: t('common.delete') }))
    expect(view.emitted('bulkDelete')).toEqual([[['b', 'c']]])
    expect(view.emitted('delete')).toBeUndefined()
  })

  it('reselecting everything after a list change selects exactly the visible rows', async () => {
    const view = render(ConversationList, { props: { ...props, items: rows('a', 'b') } })
    await selectAll(view)
    await view.rerender({ items: rows('b', 'c', 'd') })
    expect(screen.getByTestId('bulk-bar')).toHaveTextContent(`${t('navigation.actions.selected')} 1`)
    await fireEvent.click(screen.getByLabelText(t('navigation.actions.selectAll')))
    expect(screen.getByTestId('bulk-bar')).toHaveTextContent(`${t('navigation.actions.selected')} 3`)
  })
})
