import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ComposerCapabilityChip from './ComposerCapabilityChip.vue'

function mountChip(props: Partial<{
  enabled: boolean
  label: string
  summary: string | null
  disabled: boolean
  options: readonly string[]
  selectedOption: string | null
  dataTestId: string
}> = {}) {
  const defaults = {
    enabled: false,
    label: 'Test',
    summary: null,
    disabled: false,
    options: ['low', 'medium', 'high'],
    selectedOption: null,
    dataTestId: 'test-chip',
  }
  const merged = { ...defaults, ...props }
  const emitted: Record<string, unknown[]> = {}

  const wrapper = render(ComposerCapabilityChip, {
    props: {
      ...merged,
      onToggle: (...args: unknown[]) => { (emitted.toggle ??= []).push(args) },
      onSelectOption: (...args: unknown[]) => { (emitted.selectOption ??= []).push(args) },
    },
  })

  return { ...wrapper, emitted }
}

describe('ComposerCapabilityChip', () => {
  it('renders label text', () => {
    mountChip({ label: 'Reasoning' })
    expect(screen.getByText('Reasoning')).toBeTruthy()
  })

  it('shows summary when enabled', () => {
    mountChip({ enabled: true, summary: ': medium' })
    expect(screen.getByText(': medium')).toBeTruthy()
  })

  it('does not show summary when disabled/enabled=false', () => {
    mountChip({ enabled: false, summary: ': medium' })
    expect(screen.queryByText(': medium')).toBeNull()
  })

  it('emits toggle when chip body is clicked', async () => {
    const { emitted } = mountChip({ enabled: false })
    const body = screen.getByTestId('capability-chip-body')
    await fireEvent.click(body)
    expect(emitted.toggle).toHaveLength(1)
  })

  it('emits toggle when chip body is clicked while enabled (to disable)', async () => {
    const { emitted } = mountChip({ enabled: true })
    const body = screen.getByTestId('capability-chip-body')
    await fireEvent.click(body)
    expect(emitted.toggle).toHaveLength(1)
  })

  it('does not emit toggle when disabled', async () => {
    const { emitted } = mountChip({ disabled: true })
    const body = screen.getByTestId('capability-chip-body')
    await fireEvent.click(body)
    expect(emitted.toggle).toBeUndefined()
  })

  it('opens menu when chevron is clicked', async () => {
    mountChip({ enabled: false, options: ['low', 'high'] })
    const chevron = screen.getByTestId('capability-chip-chevron')
    await fireEvent.click(chevron)
    expect(screen.getByTestId('capability-chip-menu')).toBeTruthy()
  })

  it('chevron click does not emit toggle', async () => {
    const { emitted } = mountChip({ enabled: false, options: ['low', 'high'] })
    const chevron = screen.getByTestId('capability-chip-chevron')
    await fireEvent.click(chevron)
    expect(emitted.toggle).toBeUndefined()
  })

  it('emits selectOption when a menu option is clicked', async () => {
    const { emitted } = mountChip({ enabled: false, options: ['low', 'medium', 'high'] })
    const chevron = screen.getByTestId('capability-chip-chevron')
    await fireEvent.click(chevron)
    const options = screen.getAllByTestId('capability-chip-option')
    await fireEvent.click(options[1])
    expect(emitted.selectOption).toEqual([['medium']])
  })

  it('closes menu after option is selected', async () => {
    mountChip({ enabled: false, options: ['low', 'high'] })
    const chevron = screen.getByTestId('capability-chip-chevron')
    await fireEvent.click(chevron)
    const options = screen.getAllByTestId('capability-chip-option')
    await fireEvent.click(options[0])
    expect(screen.queryByTestId('capability-chip-menu')).toBeNull()
  })

  it('renders divider for separator options', async () => {
    mountChip({ enabled: false, options: ['1K', '2K', '—', '16:9', '1:1'] })
    const chevron = screen.getByTestId('capability-chip-chevron')
    await fireEvent.click(chevron)
    expect(screen.getByTestId('capability-chip-divider')).toBeTruthy()
    const options = screen.getAllByTestId('capability-chip-option')
    expect(options).toHaveLength(4)
  })

  it('highlights selected option in menu', async () => {
    mountChip({ enabled: true, options: ['low', 'medium', 'high'], selectedOption: 'high' })
    const chevron = screen.getByTestId('capability-chip-chevron')
    await fireEvent.click(chevron)
    const options = screen.getAllByTestId('capability-chip-option')
    const highOption = options.find(el => el.textContent?.trim() === 'high')
    expect(highOption?.className).toContain('font-medium')
  })

  it('applies active styling when enabled', () => {
    mountChip({ enabled: true, label: 'Reasoning' })
    const body = screen.getByTestId('capability-chip-body')
    expect(body.className).toContain('border-gray-900')
    expect(body.className).toContain('bg-gray-900')
  })

  it('applies inactive styling when disabled', () => {
    mountChip({ enabled: false, label: 'Reasoning' })
    const body = screen.getByTestId('capability-chip-body')
    expect(body.className).toContain('border-gray-200')
    expect(body.className).toContain('bg-white')
  })

  it('does not render chevron when no options provided', () => {
    mountChip({ options: [] })
    expect(screen.queryByTestId('capability-chip-chevron')).toBeNull()
  })

  it('closes menu on escape key', async () => {
    mountChip({ enabled: false, options: ['low', 'high'] })
    const chevron = screen.getByTestId('capability-chip-chevron')
    await fireEvent.click(chevron)
    expect(screen.getByTestId('capability-chip-menu')).toBeTruthy()
    await fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('capability-chip-menu')).toBeNull()
  })
})
