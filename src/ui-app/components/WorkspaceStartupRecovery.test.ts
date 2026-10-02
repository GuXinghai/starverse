import { fireEvent, render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetI18nForTests, t } from '@/shared/i18n'
import WorkspaceStartupRecovery from './WorkspaceStartupRecovery.vue'

describe('workspace startup recovery entry', () => {
  beforeEach(() => resetI18nForTests())

  it('distinguishes loading from a ready empty workspace', async () => {
    const view = render(WorkspaceStartupRecovery, { props: { state: { phase: 'loading', attempt: 1, error: null }, empty: true } })
    expect(screen.getByRole('status')).toHaveTextContent(t('errors.startup.loading'))
    expect(screen.queryByRole('button')).toBeNull()
    await view.rerender({ state: { phase: 'ready', attempt: 1, error: null }, empty: true })
    expect(screen.getByRole('status')).toHaveTextContent(t('errors.startup.empty'))
    expect(screen.queryByTestId('workspace-startup-error')).toBeNull()
    await fireEvent.click(screen.getByTestId('workspace-startup-settings'))
    expect(view.emitted().openSettings).toHaveLength(1)
  })

  it('offers retry and settings for failure without an active conversation', async () => {
    const view = render(WorkspaceStartupRecovery, { props: { state: { phase: 'error', attempt: 1, error: 'initialization_failed' } } })
    expect(screen.getByRole('alert')).toHaveTextContent(t('errors.startup.failed'))
    await fireEvent.click(screen.getByTestId('workspace-startup-retry'))
    await fireEvent.click(screen.getByTestId('workspace-startup-settings'))
    expect(view.emitted().retry).toHaveLength(1)
    expect(view.emitted().openSettings).toHaveLength(1)
    await view.rerender({ state: { phase: 'loading', attempt: 2, error: null } })
    expect(screen.queryByTestId('workspace-startup-retry')).toBeNull()
  })

  it('gives bridge failure a localized action hint', () => {
    render(WorkspaceStartupRecovery, { props: { state: { phase: 'error', attempt: 1, error: 'bridge_unavailable' } } })
    expect(screen.getByRole('alert')).toHaveTextContent(t('errors.startup.bridgeUnavailable'))
    expect(screen.queryByText(/npm run|GENERATION_V2|Error:/)).toBeNull()
  })
})
