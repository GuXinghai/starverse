import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchSettingsSection from './SearchSettingsSection.vue'
import { resetI18nForTests, setLocale } from '@/shared/i18n'

describe('SearchSettingsSection', () => {
  const originalStore = (globalThis as any).electronStore
  let set: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetI18nForTests(); setLocale('en-US')
    set = vi.fn(async () => true)
    ;(globalThis as any).electronStore = { get: vi.fn(async () => ({})), set }
  })
  afterEach(() => { cleanup(); (globalThis as any).electronStore = originalStore })

  const lastSaved = () => set.mock.calls.at(-1)![1] as any

  it('shows the defaults and saves a changed preference to the single search leaf', async () => {
    render(SearchSettingsSection)
    expect(screen.getByTestId('settings-search-resultLimit')).toHaveValue(5000)
    expect(screen.getByTestId('settings-search-batchSize')).toHaveValue(50)
    expect(screen.getByTestId('settings-search-prefetchBatches')).toHaveValue(3)
    await fireEvent.update(screen.getByTestId('settings-search-defaultPresentation'), 'pagination')
    await waitFor(() => expect(set).toHaveBeenCalled())
    expect(set.mock.calls.at(-1)![0]).toBe('generationV2UiPreferences.searchPreferences')
    expect(lastSaved().defaultPresentation).toBe('pagination')
    expect(lastSaved().resultLimit).toBe(5000)
  })

  it('saves the independent Scroll and Pagination configurations separately', async () => {
    render(SearchSettingsSection)
    await fireEvent.change(screen.getByTestId('settings-search-batchSize'), { target: { value: '25' } })
    await waitFor(() => expect(lastSaved().scroll.batchSize).toBe(25))
    await fireEvent.change(screen.getByTestId('settings-search-prefetchPages'), { target: { value: '7' } })
    await waitFor(() => expect(lastSaved().pagination.prefetchPages).toBe(7))
    expect(lastSaved().scroll).toMatchObject({ batchSize: 25, prefetchBatches: 3 })
    await fireEvent.update(screen.getByTestId('settings-search-capacity'), 'extended')
    await waitFor(() => expect(lastSaved().pagination.capacity).toBe('extended'))
    await fireEvent.update(screen.getByTestId('settings-search-keyboard'), 'select-first')
    await waitFor(() => expect(lastSaved().pagination).toMatchObject({ keyboard: 'select-first', arrowClick: 'direct', pageClick: 'direct' }))
  })

  it('rejects zero, negative and fractional numbers without saving', async () => {
    render(SearchSettingsSection)
    for (const bad of ['0', '-3', '2.5', '']) {
      set.mockClear()
      const input = screen.getByTestId('settings-search-resultLimit') as HTMLInputElement
      await fireEvent.change(input, { target: { value: bad } })
      expect(set).not.toHaveBeenCalled()
      expect(await screen.findByRole('alert')).toHaveTextContent('Enter a whole number greater than zero.')
      expect(input.value).toBe('5000')
    }
  })
})
