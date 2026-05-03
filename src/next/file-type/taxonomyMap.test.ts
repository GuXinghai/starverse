import { describe, expect, it } from 'vitest'
import {
  EXTENSION_TO_FORMAT_ID,
  FILE_TYPE_TAXONOMY_MAP_VERSION,
  MAGIKA_LABEL_TO_FORMAT_ID,
  MIME_TO_FORMAT_ID,
} from './taxonomyMap'
import { FILE_FORMAT_IDS } from './types'

describe('file-type taxonomy map', () => {
  it('exposes a taxonomy map version', () => {
    expect(FILE_TYPE_TAXONOMY_MAP_VERSION).toBeTruthy()
  })

  it('uses lowercase extension keys without leading dot', () => {
    for (const extension of Object.keys(EXTENSION_TO_FORMAT_ID)) {
      expect(extension).toBe(extension.toLowerCase())
      expect(extension.startsWith('.')).toBe(false)
    }
  })

  it('uses lowercase MIME keys', () => {
    for (const mime of Object.keys(MIME_TO_FORMAT_ID)) {
      expect(mime).toBe(mime.toLowerCase())
    }
  })

  it('maps only to known FileFormatId values', () => {
    const known = new Set(FILE_FORMAT_IDS)
    for (const mapped of Object.values(EXTENSION_TO_FORMAT_ID)) {
      expect(known.has(mapped)).toBe(true)
    }
    for (const mapped of Object.values(MIME_TO_FORMAT_ID)) {
      expect(known.has(mapped)).toBe(true)
    }
    for (const mapped of Object.values(MAGIKA_LABEL_TO_FORMAT_ID)) {
      expect(known.has(mapped)).toBe(true)
    }
  })

  it('does not map unknown external labels into new internal ids', () => {
    expect(MAGIKA_LABEL_TO_FORMAT_ID['__unknown_label__']).toBeUndefined()
  })
})
