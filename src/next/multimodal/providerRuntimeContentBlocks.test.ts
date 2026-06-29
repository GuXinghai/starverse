import { describe, expect, it } from 'vitest'
import {
  buildAnthropicUserContent,
  buildGeminiUserParts,
  buildOpenAICompatibleUserContent,
  buildOpenAIResponsesUserContent,
  isProviderRuntimeUploadRequestBlock,
  sanitizeProviderRuntimeFileContentBlocks,
  sanitizeProviderRuntimeImageContentBlocks,
} from '@/next/multimodal/providerRuntimeContentBlocks'

describe('providerRuntimeContentBlocks', () => {
  const uploadBlock = {
    type: 'starverse_provider_file_upload',
    provider: 'openai_responses',
    assetId: 'asset-upload',
    revisionId: 'rev-upload',
    blobSha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    sizeBytes: 4,
    kind: 'pdf',
    filename: 'manual.pdf',
    dataBase64: 'JVBERg==',
  }

  it('rejects credentialed URL image references at the IPC sanitizer boundary', () => {
    const result = sanitizeProviderRuntimeImageContentBlocks('openrouter', [
      {
        type: 'image_url',
        image_url: { url: 'https://user:secret@cdn.example.test/photo.png?token=do-not-leak' },
      },
    ])

    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('user:secret')
    expect(JSON.stringify(result)).not.toContain('do-not-leak')
  })

  it('builds OpenAI-compatible text plus image_url content parts for local runtimes', () => {
    const content = buildOpenAICompatibleUserContent('Describe it.', [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ])

    expect(content).toEqual([
      { type: 'text', text: 'Describe it.' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ])
    expect(JSON.stringify(content)).not.toContain('storagePath')
    expect(JSON.stringify(content)).not.toContain('blobId')
    expect(JSON.stringify(content)).not.toContain('originalPath')
  })

  it('sanitizes OpenAI-compatible image blocks for LM Studio and Ollama without accepting credentialed URLs', () => {
    expect(sanitizeProviderRuntimeImageContentBlocks('lm_studio', [
      { type: 'text', text: 'Describe it.' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/AA==' } },
    ])).toEqual({
      ok: true,
      blocks: [
        { type: 'text', text: 'Describe it.' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/AA==' } },
      ],
    })

    const rejected = sanitizeProviderRuntimeImageContentBlocks('ollama_local', [
      { type: 'image_url', image_url: { url: 'https://user:secret@cdn.example.test/photo.png?token=do-not-leak' } },
    ])
    expect(rejected).toEqual({
      ok: false,
      message: 'Provider runtime image content block is invalid.',
    })
    expect(JSON.stringify(rejected)).not.toContain('user:secret')
    expect(JSON.stringify(rejected)).not.toContain('do-not-leak')
  })

  it('rejects non-M1b image MIME types for direct runtime blocks', () => {
    expect(sanitizeProviderRuntimeImageContentBlocks('google_ai_studio', [
      { inlineData: { mimeType: 'image/webp', data: 'AAAA' } },
    ])).toEqual({
      ok: false,
      message: 'Provider runtime image content block is invalid.',
    })

    expect(sanitizeProviderRuntimeImageContentBlocks('anthropic_messages', [
      { type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'AAAA' } },
    ])).toEqual({
      ok: false,
      message: 'Provider runtime image content block is invalid.',
    })
  })

  it('accepts provider PDF runtime blocks for the M1c file sanitizer', () => {
    expect(sanitizeProviderRuntimeFileContentBlocks('openai_responses', [
      { type: 'input_file', filename: 'manual.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQK' },
    ])).toEqual({
      ok: true,
      blocks: [
        { type: 'input_file', filename: 'manual.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQK' },
      ],
    })

    expect(sanitizeProviderRuntimeFileContentBlocks('anthropic_messages', [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQK' }, title: 'manual.pdf' },
    ])).toEqual({
      ok: true,
      blocks: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQK' }, title: 'manual.pdf' },
      ],
    })

    expect(sanitizeProviderRuntimeFileContentBlocks('google_ai_studio', [
      { inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjQK' } },
    ])).toEqual({
      ok: true,
      blocks: [
        { inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjQK' } },
      ],
    })

    expect(sanitizeProviderRuntimeFileContentBlocks('openrouter', [
      { type: 'file', file: { filename: 'manual.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQK' } },
    ])).toEqual({
      ok: true,
      blocks: [
        { type: 'file', file: { filename: 'manual.pdf', file_data: 'data:application/pdf;base64,JVBERi0xLjQK' } },
      ],
    })
  })

  it('accepts safe provider upload DTOs before main-process upload resolution', () => {
    const result = sanitizeProviderRuntimeFileContentBlocks('openai_responses', [uploadBlock])

    expect(result).toEqual({ ok: true, blocks: [uploadBlock] })
    expect(isProviderRuntimeUploadRequestBlock(uploadBlock)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('storagePath')
    expect(JSON.stringify(result)).not.toContain('blobId')
    expect(JSON.stringify(result)).not.toContain('originalUrl')
  })

  it('rejects provider upload DTOs for DeepSeek and provider mismatches', () => {
    expect(sanitizeProviderRuntimeFileContentBlocks('deepseek', [uploadBlock])).toMatchObject({
      ok: false,
      message: 'Provider runtime file content block is invalid.',
    })
    expect(sanitizeProviderRuntimeFileContentBlocks('anthropic_messages', [uploadBlock])).toMatchObject({
      ok: false,
      message: 'Provider runtime file content block is invalid.',
    })
  })

  it('builds OpenAI Responses file_id request parts', () => {
    const content = buildOpenAIResponsesUserContent('Read it.', [
      { type: 'input_file', file_id: 'file-openai-1' },
    ])

    expect(content).toEqual([
      { type: 'input_text', text: 'Read it.' },
      { type: 'input_file', file_id: 'file-openai-1' },
    ])
  })

  it('builds Anthropic file_id document blocks', () => {
    const content = buildAnthropicUserContent('Read it.', [
      { type: 'document', source: { type: 'file', file_id: 'file-anthropic-1' }, title: 'manual.pdf' },
    ])

    expect(content).toEqual([
      { type: 'text', text: 'Read it.' },
      { type: 'document', source: { type: 'file', file_id: 'file-anthropic-1' }, title: 'manual.pdf' },
    ])
  })

  it('builds Gemini fileUri parts', () => {
    const parts = buildGeminiUserParts('Read it.', [
      { fileData: { mimeType: 'application/pdf', fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/file-a' } },
    ])

    expect(parts).toEqual([
      { text: 'Read it.' },
      { fileData: { mimeType: 'application/pdf', fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/file-a' } },
    ])
  })

  it('rejects PDF URL references with query or hash without leaking tokens', () => {
    const result = sanitizeProviderRuntimeFileContentBlocks('openrouter', [
      {
        type: 'file',
        file: { filename: 'manual.pdf', file_data: 'https://cdn.example.test/manual.pdf?token=do-not-leak#frag' },
      },
    ])

    expect(result).toEqual({
      ok: false,
      message: 'Provider runtime file content block is invalid.',
    })
    expect(JSON.stringify(result)).not.toContain('do-not-leak')
  })

  it('rejects inline PDF runtime blocks over 1 MB without echoing the payload', () => {
    const oversizedBase64 = 'A'.repeat(1_398_104)

    const openAI = sanitizeProviderRuntimeFileContentBlocks('openai_responses', [
      { type: 'input_file', filename: 'large.pdf', file_data: `data:application/pdf;base64,${oversizedBase64}` },
    ])
    const anthropic = sanitizeProviderRuntimeFileContentBlocks('anthropic_messages', [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: oversizedBase64 }, title: 'large.pdf' },
    ])
    const gemini = sanitizeProviderRuntimeFileContentBlocks('google_ai_studio', [
      { inlineData: { mimeType: 'application/pdf', data: oversizedBase64 } },
    ])
    const openRouter = sanitizeProviderRuntimeFileContentBlocks('openrouter', [
      { type: 'file', file: { filename: 'large.pdf', file_data: `data:application/pdf;base64,${oversizedBase64}` } },
    ])

    for (const result of [openAI, anthropic, gemini, openRouter]) {
      expect(result).toEqual({
        ok: false,
        message: 'Provider runtime file content block is invalid.',
      })
      expect(JSON.stringify(result)).not.toContain(oversizedBase64.slice(0, 64))
    }
  })
})
