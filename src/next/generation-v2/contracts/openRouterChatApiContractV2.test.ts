import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isOpenRouterChatApiContractV2,
  readOpenRouterChatApiContractV2,
  readOpenRouterChatRegistrySurfaceV2,
  resolveOpenRouterChatApiEndpointV2,
} from './openRouterChatApiContractV2'

const artifactPath = path.resolve(
  'docs/architecture/generation-compiler-v2/evidence/openrouter-chat-api-contract-20260715.json',
)

describe('OpenRouter Chat API V2 static contract', () => {
  it('freezes the exact core Chat endpoint, Bearer auth and streaming terminal policy', () => {
    const contract = readOpenRouterChatApiContractV2()
    expect(isOpenRouterChatApiContractV2(contract)).toBe(true)
    expect(isOpenRouterChatApiContractV2({ ...contract })).toBe(false)
    expect(contract).toMatchObject({
      classification: 'reviewed_provider_family_definition',
      executionAuthority: 'none',
      implementationStatus: 'definition_only',
      providerId: 'openrouter',
      contractFamilyId: 'openrouter-chat-api-v1',
      apiOrigin: 'https://openrouter.ai',
      auth: { kind: 'header', name: 'Authorization', scheme: 'Bearer' },
    })
    expect(contract.surfaces).toHaveLength(1)
    expect(contract.surfaces[0]).toEqual({
      surfaceId: 'openrouter-chat-completions-v1',
      codecKind: 'openrouter_chat_completions_v1',
      endpointOperation: 'create_chat_completion',
      method: 'POST',
      relativePathTemplate: '/api/v1/chat/completions',
      requestContentType: 'application/json',
      streamRequestPolicy: {
        location: 'body', field: 'stream', requiredValue: true,
        responseProtocol: 'data_only_sse', commentsMayAppear: true,
        commentPolicy: 'ignore', doneSentinel: 'required',
      },
      continuationFamily: 'ordered_native_chat_messages_with_reasoning_details_and_tools',
    })
    expect(Object.isFrozen(contract)).toBe(true)
    expect(Object.isFrozen(contract.surfaces)).toBe(true)
    expect(Object.isFrozen(contract.surfaces[0])).toBe(true)
    expect(Object.isFrozen(contract.surfaces[0].streamRequestPolicy)).toBe(true)
  })

  it('resolves only the reviewed surface without caller URL or path injection', () => {
    const contract = readOpenRouterChatApiContractV2()
    expect(resolveOpenRouterChatApiEndpointV2(contract, {
      surfaceId: 'openrouter-chat-completions-v1',
    })).toEqual({
      surface: contract.surfaces[0],
      method: 'POST',
      url: 'https://openrouter.ai/api/v1/chat/completions',
    })
    expect(() => resolveOpenRouterChatApiEndpointV2({ ...contract } as never, {
      surfaceId: 'openrouter-chat-completions-v1',
    })).toThrow('GENERATION_V2_OPENROUTER_CHAT_CONTRACT_INVALID')
    expect(() => resolveOpenRouterChatApiEndpointV2(contract, {
      surfaceId: 'unknown',
    })).toThrow('GENERATION_V2_OPENROUTER_CHAT_ENDPOINT_UNKNOWN')
    expect(() => resolveOpenRouterChatApiEndpointV2(contract, {
      surfaceId: 'openrouter-chat-completions-v1', path: '/evil',
    })).toThrow('GENERATION_V2_OPENROUTER_CHAT_ENDPOINT_INPUT_INVALID')
    let reads = 0
    const accessor = Object.defineProperty({}, 'surfaceId', {
      enumerable: true,
      get: () => { reads += 1; return 'openrouter-chat-completions-v1' },
    })
    expect(() => resolveOpenRouterChatApiEndpointV2(contract, accessor))
      .toThrow('GENERATION_V2_OPENROUTER_CHAT_ENDPOINT_INPUT_INVALID')
    expect(reads).toBe(0)
  })

  it('projects only core text/tool continuation facts into the registry surface', () => {
    expect(readOpenRouterChatRegistrySurfaceV2()).toEqual({
      providerFamilyContractId: 'openrouter-chat-api-v1',
      apiOrigin: 'https://openrouter.ai',
      auth: { kind: 'header', name: 'Authorization', scheme: 'Bearer' },
      ...readOpenRouterChatApiContractV2().surfaces[0],
      kind: 'openrouter_chat',
    })
  })

  it('locks the reviewed evidence artifact digest and excludes unresolved extensions', () => {
    const bytes = readFileSync(artifactPath)
    expect(createHash('sha256').update(bytes).digest('hex'))
      .toBe('85ecd0b97ef9b6371e710797f072968a7718d837ef683526d9b5750dd8ce72b2')
    const artifact = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
    expect(artifact).toMatchObject({
      artifactId: 'openrouter-chat-api-contract-20260715',
      providerId: 'openrouter',
      contractFamilyId: 'openrouter-chat-api-v1',
      verifiedAt: '2026-07-15',
      openApiSha256: null,
    })
    const source = readFileSync(path.resolve(
      'src/next/generation-v2/contracts/openRouterChatApiContractV2.ts',
    ), 'utf8')
    expect(source).not.toMatch(/plugins|:online|modalities|image_config|providerFile|profileId|credentialScope|fetch\(|net\.request|ipcMain/iu)
  })
})
