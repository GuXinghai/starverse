import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/vue'
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
