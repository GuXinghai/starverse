import { describe, expect, it } from 'vitest'
import { syncOpenRouterModelCatalog } from './catalogSyncJob'

describe('syncOpenRouterModelCatalog', () => {
  it('fetches /api/v1/models (baseUrl + /models) and writes supported_parameters', async () => {
    const calls: any[] = []
    const fakeFetch: any = async (url: string, init: any) => {
      calls.push({ url, init })
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: [
              { id: 'openai/a', name: 'A', supported_parameters: ['reasoning', 'tools'] },
              { id: 'openai/b', name: 'B', supported_parameters: [] },
            ],
          }
        },
      }
    }

    const written: any[] = []
    const writer = {
      syncSnapshot: (input: any) => {
        written.push(input)
      },
    }

    const res = await syncOpenRouterModelCatalog({
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetchImpl: fakeFetch,
      snapshotId: 'snap_test',
      writer,
    })

    expect(res.ok).toBe(true)
    expect(calls.length).toBe(1)
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/models')
    expect(calls[0].init?.method).toBe('GET')
    expect(String(calls[0].init?.headers?.Authorization || '')).toContain('Bearer ')

    expect(written.length).toBe(1)
    expect(written[0].snapshotId).toBe('snap_test')
    expect(written[0].routerSource).toBe('openrouter')
    expect(written[0].models.length).toBe(2)
    expect(written[0].models[0].modelId).toBe('openai/a')
    expect(written[0].models[0].supportedParametersJson).toBe(JSON.stringify(['reasoning', 'tools']))
  })
})

