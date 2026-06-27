import { describe, expect, it } from 'vitest'
import { sanitizeProviderRuntimeImageContentBlocks } from '@/next/multimodal/providerRuntimeContentBlocks'

describe('providerRuntimeContentBlocks', () => {
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
})
