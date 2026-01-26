import { render, screen, within, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppChatApp from './AppChatApp.vue'

describe('ui-app AppChatApp (conversation management)', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  beforeEach(() => {
    const now = { value: 10 }

    let convos: Array<{ id: string; title: string; createdAt: number; updatedAt: number; projectId?: string | null }> = [
      { id: 'c1', title: 'Chat 1', createdAt: 1, updatedAt: 10, projectId: null },
      { id: 'c2', title: 'Chat 2', createdAt: 2, updatedAt: 20, projectId: null },
    ]

    const projects = [
      { id: 'p1', name: 'Project 1', createdAt: 1, updatedAt: 1, meta: null },
      { id: 'p2', name: 'Project 2', createdAt: 2, updatedAt: 2, meta: null },
    ]

    const invoke = vi.fn(async (method: string, params?: any) => {
      if (method === 'project.list') return projects

      if (method === 'convo.list') {
        const sorted = [...convos].sort((a, b) => b.updatedAt - a.updatedAt)
        return sorted.map((c) => ({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, projectId: c.projectId ?? null }))
      }

      if (method === 'branch.ensureDefault') {
        const convoId = String(params?.convoId ?? '')
        return { id: `b_${convoId}`, convoId, headMessageId: null, name: 'Main', createdAt: 0, updatedAt: 0, deletedAt: null }
      }

      if (method === 'branch.list') {
        const convoId = String(params?.convoId ?? '')
        return [{ id: `b_${convoId}`, convoId, headMessageId: null, name: 'Main', createdAt: 0, updatedAt: 0, deletedAt: null }]
      }

      if (method === 'context.getRenderableTurns') {
        const branchId = String(params?.branchId ?? '')
        return { messages: [], turns: [], debug: { branchId, excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }

      if (method === 'context.buildForBranch') {
        return { messages: [], debug: { branchId: String(params?.branchId ?? ''), excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
      }

      if (method === 'convo.save') {
        const id = String(params?.id ?? '')
        const title = String(params?.title ?? '')
        now.value += 1
        convos = convos.map((c) => (c.id === id ? { ...c, title, updatedAt: now.value } : c))
        return { ok: true }
      }

      if (method === 'convo.delete') {
        const id = String(params?.id ?? '')
        convos = convos.filter((c) => c.id !== id)
        return { ok: true }
      }

      if (method === 'convo.deleteMany') {
        const ids = Array.isArray(params?.ids) ? params.ids.map((x: any) => String(x)) : []
        const before = convos.length
        convos = convos.filter((c) => !ids.includes(c.id))
        return { deleted: before - convos.length }
      }

      if (method === 'convo.setProject') {
        const id = String(params?.id ?? '')
        const projectId = params?.projectId === null ? null : String(params?.projectId ?? '')
        now.value += 1
        convos = convos.map((c) => (c.id === id ? { ...c, projectId, updatedAt: now.value } : c))
        return { ok: true }
      }

      if (method === 'convo.setProjectMany') {
        const ids = Array.isArray(params?.ids) ? params.ids.map((x: any) => String(x)) : []
        const projectId = params?.projectId === null ? null : String(params?.projectId ?? '')
        now.value += 1
        let moved = 0
        const failed: string[] = []
        convos = convos.map((c) => {
          if (!ids.includes(c.id)) return c
          moved += 1
          return { ...c, projectId, updatedAt: now.value }
        })
        for (const id of ids) {
          if (!convos.some((c) => c.id === id)) failed.push(id)
        }
        return { moved, failed }
      }

      return { ok: true }
    })

    ;(globalThis as any).dbBridge = { invoke }
  })

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
  })

  it('renames a conversation', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByTestId('convo-row-c1')

    const row = screen.getByTestId('convo-row-c1')
    await user.click(within(row).getByRole('button', { name: 'Rename' }))

    const dialog = screen.getByTestId('rename-dialog')
    const input = within(dialog).getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'Renamed')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(within(screen.getByTestId('convo-row-c1')).getByText('Renamed')).toBeTruthy())

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('convo.save', expect.objectContaining({ id: 'c1', title: 'Renamed' }))
  })

  it('moves a conversation to a project', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByTestId('convo-row-c1')

    const row = screen.getByTestId('convo-row-c1')
    await user.click(within(row).getByRole('button', { name: 'Move' }))

    const dialog = screen.getByTestId('move-dialog')
    const select = within(dialog).getByRole('combobox')
    await user.selectOptions(select, 'p1')
    await user.click(within(dialog).getByRole('button', { name: 'Move' }))

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('convo.setProject', expect.objectContaining({ id: 'c1', projectId: 'p1' }))
  })

  it('deletes a conversation', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByTestId('convo-row-c1')

    const row = screen.getByTestId('convo-row-c1')
    await user.click(within(row).getByRole('button', { name: 'Delete' }))

    const dialog = screen.getByTestId('delete-dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByTestId('convo-row-c1')).toBeNull())

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('convo.delete', expect.objectContaining({ id: 'c1' }))
  })

  it('bulk deletes conversations', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByTestId('convo-row-c1')
    await screen.findByTestId('convo-row-c2')

    await user.click(screen.getByRole('button', { name: 'Select' }))

    const row1 = screen.getByTestId('convo-row-c1')
    const row2 = screen.getByTestId('convo-row-c2')
    await user.click(within(row1).getByRole('checkbox', { name: 'Select conversation' }))
    await user.click(within(row2).getByRole('checkbox', { name: 'Select conversation' }))

    const bulkBar = screen.getByTestId('bulk-bar')
    await user.click(within(bulkBar).getByRole('button', { name: 'Bulk delete' }))

    const dialog = screen.getByTestId('delete-dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(screen.queryByTestId('convo-row-c1')).toBeNull()
      expect(screen.queryByTestId('convo-row-c2')).toBeNull()
    })

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith('convo.deleteMany', expect.objectContaining({ ids: expect.arrayContaining(['c1', 'c2']) }))
  })

  it('bulk moves conversations to a project', async () => {
    const user = userEvent.setup()
    render(AppChatApp)

    await screen.findByTestId('convo-row-c1')
    await screen.findByTestId('convo-row-c2')

    await user.click(screen.getByRole('button', { name: 'Select' }))

    const row1 = screen.getByTestId('convo-row-c1')
    const row2 = screen.getByTestId('convo-row-c2')
    await user.click(within(row1).getByRole('checkbox', { name: 'Select conversation' }))
    await user.click(within(row2).getByRole('checkbox', { name: 'Select conversation' }))

    const bulkBar = screen.getByTestId('bulk-bar')
    await user.click(within(bulkBar).getByRole('button', { name: 'Bulk move' }))

    const dialog = screen.getByTestId('move-dialog')
    const select = within(dialog).getByRole('combobox')
    await user.selectOptions(select, 'p2')
    await user.click(within(dialog).getByRole('button', { name: 'Move' }))

    const invoke = (globalThis as any).dbBridge.invoke as ReturnType<typeof vi.fn>
    expect(invoke).toHaveBeenCalledWith(
      'convo.setProjectMany',
      expect.objectContaining({ ids: expect.arrayContaining(['c1', 'c2']), projectId: 'p2' })
    )
  })
})
