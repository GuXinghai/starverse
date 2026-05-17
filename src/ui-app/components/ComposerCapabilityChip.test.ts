import { fireEvent, render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'
import ComposerCapabilityChip from './ComposerCapabilityChip.vue'
import { resetI18nForTests } from '@/shared/i18n'

function mountChip(props: Partial<{
  enabled: boolean
  label: string
  activeLabel: string | null
  kind: 'reasoning' | 'webSearch' | 'image'
  disabled: boolean
  options: readonly string[]
  selectedOption: string | null
  dataTestId: string
}> = {}) {
  const defaults = {
    enabled: false,
    label: 'Test',
    activeLabel: null as string | null,
    kind: undefined as undefined,
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
  beforeEach(() => { resetI18nForTests() })

  it('renders label text when disabled', () => {
    mountChip({ label: 'Think', enabled: false })
    expect(screen.getByText('Think')).toBeTruthy()
  })

  it('renders activeLabel when enabled', () => {
    mountChip({ label: 'Think', activeLabel: 'medium', enabled: true })
    expect(screen.getByText('medium')).toBeTruthy()
    expect(screen.queryByText('Think')).toBeNull()
  })

  it('does not render activeLabel when disabled', () => {
    mountChip({ label: 'Think', activeLabel: 'medium', enabled: false })
    expect(screen.getByText('Think')).toBeTruthy()
    expect(screen.queryByText('medium')).toBeNull()
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
    mountChip({ enabled: true, label: 'Think' })
    const body = screen.getByTestId('capability-chip-body')
    expect(body.className).toContain('border-gray-900')
    expect(body.className).toContain('bg-gray-900')
  })

  it('applies inactive styling when disabled', () => {
    mountChip({ enabled: false, label: 'Think' })
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

describe('ComposerCapabilityChip label rules', () => {
  beforeEach(() => { resetI18nForTests() })

  it('Reasoning shows Think when disabled', () => {
    mountChip({ label: 'Think', enabled: false, kind: 'reasoning' })
    expect(screen.getByText('Think')).toBeTruthy()
  })

  it('Reasoning shows effort when enabled, not "Reasoning: medium"', () => {
    mountChip({ label: 'Think', activeLabel: 'medium', enabled: true, kind: 'reasoning' })
    expect(screen.getByText('medium')).toBeTruthy()
    expect(screen.queryByText('Think')).toBeNull()
    expect(screen.queryByText(/Reasoning:/)).toBeNull()
  })

  it('Web Search shows Search when disabled', () => {
    mountChip({ label: 'Search', enabled: false, kind: 'webSearch' })
    expect(screen.getByText('Search')).toBeTruthy()
  })

  it('Web Search shows level when enabled, not "Web Search: high"', () => {
    mountChip({ label: 'Search', activeLabel: 'high', enabled: true, kind: 'webSearch' })
    expect(screen.getByText('high')).toBeTruthy()
    expect(screen.queryByText('Search')).toBeNull()
    expect(screen.queryByText(/Web Search:/)).toBeNull()
  })

  it('Image shows Image when disabled', () => {
    mountChip({ label: 'Image', enabled: false, kind: 'image' })
    expect(screen.getByText('Image')).toBeTruthy()
  })

  it('Image shows size+ratio when enabled, not "Image: 1K · 1:1"', () => {
    mountChip({ label: 'Image', activeLabel: '1K · 1:1', enabled: true, kind: 'image' })
    expect(screen.getByText('1K · 1:1')).toBeTruthy()
    expect(screen.queryByText('Image')).toBeNull()
    expect(screen.queryByText(/Image:/)).toBeNull()
  })

  it('sets title with full description when disabled', () => {
    mountChip({ label: 'Think', enabled: false, kind: 'reasoning' })
    const body = screen.getByTestId('capability-chip-body')
    expect(body.getAttribute('title')).toBe('推理')
  })

  it('sets title with full description when enabled', () => {
    mountChip({ label: 'Think', activeLabel: 'medium', enabled: true, kind: 'reasoning' })
    const body = screen.getByTestId('capability-chip-body')
    expect(body.getAttribute('title')).toBe('推理 medium 已启用')
  })

  it('sets title for Web Search when enabled', () => {
    mountChip({ label: 'Search', activeLabel: 'high', enabled: true, kind: 'webSearch' })
    const body = screen.getByTestId('capability-chip-body')
    expect(body.getAttribute('title')).toBe('搜索 high 已启用')
  })

  it('sets title for Image when enabled', () => {
    mountChip({ label: 'Image', activeLabel: '1K · 1:1', enabled: true, kind: 'image' })
    const body = screen.getByTestId('capability-chip-body')
    expect(body.getAttribute('title')).toBe('图片 1K · 1:1 已启用')
  })
})

describe('ComposerCapabilityChip fixed width', () => {
  beforeEach(() => { resetI18nForTests() })

  it('applies w-[6.25rem] for reasoning kind', () => {
    mountChip({ kind: 'reasoning', label: 'Think', enabled: false })
    const root = screen.getByTestId('test-chip')
    expect(root.className).toContain('w-[6.25rem]')
  })

  it('applies w-[6.25rem] for webSearch kind', () => {
    mountChip({ kind: 'webSearch', label: 'Search', enabled: false })
    const root = screen.getByTestId('test-chip')
    expect(root.className).toContain('w-[6.25rem]')
  })

  it('applies w-[7.75rem] for image kind', () => {
    mountChip({ kind: 'image', label: 'Image', enabled: false })
    const root = screen.getByTestId('test-chip')
    expect(root.className).toContain('w-[7.75rem]')
  })

  it('uses same width class when reasoning is enabled', () => {
    mountChip({ kind: 'reasoning', label: 'Think', activeLabel: 'medium', enabled: true })
    const root = screen.getByTestId('test-chip')
    expect(root.className).toContain('w-[6.25rem]')
  })

  it('uses same width class when webSearch is enabled', () => {
    mountChip({ kind: 'webSearch', label: 'Search', activeLabel: 'high', enabled: true })
    const root = screen.getByTestId('test-chip')
    expect(root.className).toContain('w-[6.25rem]')
  })

  it('uses same width class when image is enabled', () => {
    mountChip({ kind: 'image', label: 'Image', activeLabel: '1K · 1:1', enabled: true })
    const root = screen.getByTestId('test-chip')
    expect(root.className).toContain('w-[7.75rem]')
  })

  it('sets data-width-kind attribute', () => {
    mountChip({ kind: 'reasoning', label: 'Think', enabled: false })
    const root = screen.getByTestId('test-chip')
    expect(root.getAttribute('data-width-kind')).toBe('reasoning')
  })

  it('sets data-width-kind when enabled', () => {
    mountChip({ kind: 'image', label: 'Image', activeLabel: '4K · 16:9', enabled: true })
    const root = screen.getByTestId('test-chip')
    expect(root.getAttribute('data-width-kind')).toBe('image')
  })
})
