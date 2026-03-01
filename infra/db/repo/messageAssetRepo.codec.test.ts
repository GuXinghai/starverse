import { describe, expect, it } from 'vitest'
import {
  decodeImageDataUrl,
  MessageAssetRepoError,
  parseImageDimensions,
} from './messageAssetRepo'

const ONE_BY_ONE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAGgwJ/l7h5NwAAAABJRU5ErkJggg=='

describe('messageAssetRepo codec helpers', () => {
  it('decodes image data URL and parses dimensions from binary payload', () => {
    const decoded = decodeImageDataUrl(ONE_BY_ONE_PNG_DATA_URL)
    const dim = parseImageDimensions(decoded.bytes, decoded.mime)
    expect(decoded.mime).toBe('image/png')
    expect(decoded.bytes.length).toBeGreaterThan(0)
    expect(dim).toEqual({ width: 1, height: 1 })
  })

  it('rejects non-image mime with explicit code', () => {
    const dataUrl = 'data:text/plain;base64,SGVsbG8='
    expect(() => decodeImageDataUrl(dataUrl)).toThrowError(MessageAssetRepoError)
    try {
      decodeImageDataUrl(dataUrl)
      expect.unreachable('decode should throw')
    } catch (error) {
      expect((error as MessageAssetRepoError).code).toBe('invalid_image_mime')
    }
  })

  it('rejects payload above max size', () => {
    const decoded = decodeImageDataUrl(ONE_BY_ONE_PNG_DATA_URL)
    const base64 = decoded.bytes.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`
    expect(() => decodeImageDataUrl(dataUrl, 1)).toThrowError(MessageAssetRepoError)
    try {
      decodeImageDataUrl(dataUrl, 1)
      expect.unreachable('decode should throw')
    } catch (error) {
      expect((error as MessageAssetRepoError).code).toBe('image_too_large')
    }
  })

  it('rejects malformed data URL', () => {
    expect(() => decodeImageDataUrl('not-a-data-url')).toThrowError(MessageAssetRepoError)
    try {
      decodeImageDataUrl('not-a-data-url')
      expect.unreachable('decode should throw')
    } catch (error) {
      expect((error as MessageAssetRepoError).code).toBe('invalid_data_url')
    }
  })
})
