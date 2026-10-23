import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { mount, flushPromises } from '@vue/test-utils'
import NetworkProxySettingsPanel from './NetworkProxySettingsPanel.vue'
import { DEFAULT_NETWORK_PROXY_SETTINGS, defaultBrowserProxySettings, type NetworkProxyConfiguration } from '@/shared/plugin-distribution/networkProxyShared'
import * as client from '@/next/settings/networkProxySettingsClient'

vi.mock('@/next/settings/networkProxySettingsClient', () => ({
  getProxyConfiguration: vi.fn(), getProxyEnvironment: vi.fn(async () => ({ HTTP_PROXY: 'http://proxy.test:80' })),
  saveProxyConfiguration: vi.fn(), probeProxyDraft: vi.fn(), cancelProxyProbe: vi.fn(),
  reapplyProxySettings: vi.fn(), resetProxySettings: vi.fn(), probeLibreOfficeOfficialDownloadNetwork: vi.fn(),
}))
let configuration: NetworkProxyConfiguration
beforeEach(() => {
  configuration = { application: { ...DEFAULT_NETWORK_PROXY_SETTINGS }, browser: defaultBrowserProxySettings() }
  const snapshot = () => ({ ok: true, configuration: JSON.parse(JSON.stringify(configuration)), states: null })
  vi.mocked(client.getProxyConfiguration).mockImplementation(async () => snapshot() as any)
  vi.mocked(client.saveProxyConfiguration).mockImplementation(async (value) => { configuration = value; return snapshot() as any })
  vi.mocked(client.probeProxyDraft).mockResolvedValue({ ok: true, code: 'http_response_received', configurationValid: true, httpStatus: 401, resolvedProxy: 'DIRECT', elapsedMs: 2 })
  vi.mocked(client.reapplyProxySettings).mockResolvedValue(undefined)
  vi.mocked(client.resetProxySettings).mockImplementation(async (scope) => {
    configuration = scope === 'application' ? { ...configuration, application: { ...DEFAULT_NETWORK_PROXY_SETTINGS } }
      : { ...configuration, browser: defaultBrowserProxySettings() }
  })
})
async function ready() {
  render(NetworkProxySettingsPanel, { props: { disabled: false } })
  await waitFor(() => expect(screen.getByTestId('proxy-save')).not.toBeDisabled())
}
describe('proxy configuration UI', () => {
  // R4-09 (P6a-02): a rejected load used to leave the placeholder defaults editable and saveable, so a
  // global Save replaced the stored proxy configuration with them.
  it('R4-09: after a failed load the controls are disabled and save() persists nothing', async () => {
    vi.mocked(client.getProxyConfiguration).mockRejectedValue(new Error('proxy_load_failed'))
    const wrapper = mount(NetworkProxySettingsPanel, { props: { disabled: false } })
    await flushPromises()
    for (const id of ['proxy-application-mode', 'proxy-browser-policy', 'proxy-save', 'proxy-application-test']) {
      expect(wrapper.get(`[data-testid="${id}"]`).attributes('disabled'), id).toBeDefined()
    }
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    expect(client.saveProxyConfiguration).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('R4-09: a successful load still saves a changed draft through the exposed save()', async () => {
    const wrapper = mount(NetworkProxySettingsPanel, { props: { disabled: false } })
    await flushPromises()
    await wrapper.get('[data-testid="proxy-application-mode"]').setValue('direct')
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    expect(client.saveProxyConfiguration).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('shows fields only for the mode which uses them', async () => {
    await ready()
    expect(screen.queryByTestId('proxy-application-bypass')).toBeNull()
    await fireEvent.update(screen.getByTestId('proxy-application-mode'), 'manual')
    expect(screen.getByTestId('proxy-application-bypass')).toBeVisible()
    await fireEvent.update(screen.getByTestId('proxy-application-mode'), 'environment')
    expect(screen.queryByTestId('proxy-application-bypass')).toBeNull()
    expect(screen.getByTestId('proxy-application-environment')).toHaveTextContent('HTTP_PROXY')
  })
  it('keeps independent settings when switching to follow and back', async () => {
    await ready()
    await fireEvent.update(screen.getByTestId('proxy-browser-policy'), 'independent')
    await fireEvent.update(screen.getByTestId('proxy-browser-mode'), 'manual')
    await fireEvent.update(screen.getByTestId('proxy-browser-url'), 'socks5://localhost:1080')
    await fireEvent.update(screen.getByTestId('proxy-browser-policy'), 'inherit')
    expect(screen.queryByTestId('proxy-browser-url')).toBeNull()
    await fireEvent.update(screen.getByTestId('proxy-browser-policy'), 'independent')
    expect(screen.getByTestId('proxy-browser-url')).toHaveValue('socks5://localhost:1080')
    await fireEvent.click(screen.getByTestId('proxy-save'))
    await waitFor(() => expect(client.saveProxyConfiguration).toHaveBeenCalledTimes(1))
    expect(configuration.browser.settings.manualProxyUrl).toBe('socks5://localhost:1080')
  })
  it('tests an unsaved draft without persisting it and explains HTTP results', async () => {
    await ready()
    await fireEvent.update(screen.getByTestId('proxy-application-mode'), 'manual')
    await fireEvent.update(screen.getByTestId('proxy-application-url'), 'http://localhost:10808')
    await fireEvent.click(screen.getByTestId('proxy-application-test'))
    await waitFor(() => expect(screen.getByTestId('proxy-application-result')).toHaveTextContent('401'))
    expect(client.saveProxyConfiguration).not.toHaveBeenCalled()
    expect(client.probeProxyDraft).toHaveBeenCalledWith(expect.objectContaining({ scope: 'application', configuration: expect.objectContaining({ application: expect.objectContaining({ manualProxyUrl: 'http://localhost:10808' }) }) }))
  })
  it('skips unchanged saves and reapply does not save current drafts', async () => {
    await ready()
    await fireEvent.click(screen.getByTestId('proxy-save'))
    expect(client.saveProxyConfiguration).not.toHaveBeenCalled()
    await fireEvent.update(screen.getByTestId('proxy-application-mode'), 'direct')
    await fireEvent.click(screen.getByTestId('proxy-browser-reapply'))
    await waitFor(() => expect(client.reapplyProxySettings).toHaveBeenCalledWith('browser'))
    expect(client.saveProxyConfiguration).not.toHaveBeenCalled()
    expect(screen.getByTestId('proxy-application-mode')).toHaveValue('direct')
  })
  it('resets only the selected scope and retains the other unsaved draft', async () => {
    await ready()
    await fireEvent.update(screen.getByTestId('proxy-application-mode'), 'direct')
    await fireEvent.click(screen.getByTestId('proxy-browser-reset'))
    await waitFor(() => expect(client.resetProxySettings).toHaveBeenCalledWith('browser'))
    expect(screen.getByTestId('proxy-application-mode')).toHaveValue('direct')
    expect(client.saveProxyConfiguration).not.toHaveBeenCalled()
  })
})
