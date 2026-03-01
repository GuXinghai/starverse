import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ModelEndpointDetail } from '@/next/modelCatalog/modelEndpointDetailService'
import EndpointDetailPanel from './EndpointDetailPanel.vue'

function makeEndpoint(input: Partial<ModelEndpointDetail> & { endpointKey: string }): ModelEndpointDetail {
  return {
    endpointKey: input.endpointKey,
    providerName: input.providerName ?? null,
    tag: input.tag ?? null,
    quantization: input.quantization ?? null,
    contextLength: input.contextLength ?? null,
    maxCompletionTokens: input.maxCompletionTokens ?? null,
    maxPromptTokens: input.maxPromptTokens ?? null,
    supportedParameters: input.supportedParameters ?? [],
    supportsImplicitCaching: input.supportsImplicitCaching ?? null,
    status: input.status ?? null,
    uptimeLast30m: input.uptimeLast30m ?? null,
    latencyLast30m: input.latencyLast30m ?? null,
    throughputLast30m: input.throughputLast30m ?? null,
    rawJson: input.rawJson ?? null,
  }
}

describe('EndpointDetailPanel', () => {
  it('filters endpoints by provider/quantization/caching/status/uptime/params', async () => {
    const user = userEvent.setup()
    render(EndpointDetailPanel, {
      props: {
        modelId: 'openai/gpt-4o',
        loading: false,
        fetchedAtMs: 1700000000000,
        items: [
          makeEndpoint({
            endpointKey: 'm::openai::fp16::OpenAI',
            providerName: 'OpenAI',
            tag: 'openai',
            quantization: 'fp16',
            supportedParameters: ['tools', 'temperature'],
            supportsImplicitCaching: true,
            status: 0,
            uptimeLast30m: 99.5,
            latencyLast30m: { p50: 0.2, p99: 0.8 },
            throughputLast30m: { p50: 40, p99: 20 },
          }),
          makeEndpoint({
            endpointKey: 'm::openai::int8::OpenAI',
            providerName: 'OpenAI',
            tag: 'openai',
            quantization: 'int8',
            supportedParameters: ['reasoning'],
            supportsImplicitCaching: false,
            status: 1,
            uptimeLast30m: 90,
            latencyLast30m: { p50: 0.3, p99: 1.1 },
            throughputLast30m: { p50: 35, p99: 15 },
          }),
          makeEndpoint({
            endpointKey: 'm::anthropic::fp16::Anthropic',
            providerName: 'Anthropic',
            tag: 'anthropic',
            quantization: 'fp16',
            supportedParameters: ['tools', 'reasoning'],
            supportsImplicitCaching: true,
            status: null,
            uptimeLast30m: null,
            latencyLast30m: { p50: 0.15, p99: 0.7 },
            throughputLast30m: { p50: 50, p99: 25 },
          }),
        ],
      },
    })

    await user.selectOptions(screen.getByTestId('endpoint-filter-provider'), 'OpenAI')
    await user.selectOptions(screen.getByTestId('endpoint-filter-quantization'), 'fp16')
    await user.selectOptions(screen.getByTestId('endpoint-filter-supports-caching'), 'yes')
    await user.selectOptions(screen.getByTestId('endpoint-filter-status'), '0')
    await user.type(screen.getByTestId('endpoint-filter-uptime-min'), '98')
    await user.click(screen.getByTestId('endpoint-filter-param-tools'))

    expect(screen.getByTestId('endpoint-detail-item-m::openai::fp16::OpenAI')).toBeTruthy()
    expect(screen.queryByTestId('endpoint-detail-item-m::openai::int8::OpenAI')).toBeNull()
    expect(screen.queryByTestId('endpoint-detail-item-m::anthropic::fp16::Anthropic')).toBeNull()
  })

  it('sorts endpoints by selected metric in endpoint tab', async () => {
    const user = userEvent.setup()
    render(EndpointDetailPanel, {
      props: {
        modelId: 'openai/gpt-4o',
        loading: false,
        fetchedAtMs: 1700000000000,
        items: [
          makeEndpoint({
            endpointKey: 'm::a',
            providerName: 'A',
            throughputLast30m: { p50: 30, p99: 10 },
            latencyLast30m: { p50: 0.25, p99: 0.9 },
            uptimeLast30m: 98,
          }),
          makeEndpoint({
            endpointKey: 'm::b',
            providerName: 'B',
            throughputLast30m: { p50: 50, p99: 20 },
            latencyLast30m: { p50: 0.2, p99: 0.8 },
            uptimeLast30m: 99,
          }),
          makeEndpoint({
            endpointKey: 'm::c',
            providerName: 'C',
            throughputLast30m: { p50: 20, p99: 5 },
            latencyLast30m: { p50: 0.15, p99: 0.7 },
            uptimeLast30m: 97,
          }),
        ],
      },
    })

    await user.selectOptions(screen.getByTestId('endpoint-sort-metric'), 'throughput_p99')
    await user.selectOptions(screen.getByTestId('endpoint-sort-order'), 'desc')

    const sorted = screen.getAllByTestId(/^endpoint-detail-item-/).map((el) => el.getAttribute('data-testid'))
    expect(sorted).toEqual([
      'endpoint-detail-item-m::b',
      'endpoint-detail-item-m::a',
      'endpoint-detail-item-m::c',
    ])
  })
})

