import { describe, expect, it } from 'vitest'
import {
  BLOCKED_LABEL_CODES,
  CONFIDENCE_LABEL_CODES,
  LABEL_CODES,
  PREVIEW_MODE_LABEL_CODES,
  SEND_ROUTE_LABEL_CODES,
  WARNING_LABEL_CODES,
} from './labelCodes'
import { CONFIDENCE_LEVELS, PREVIEW_MODES, SEND_ROUTES } from './types'

describe('file-type label code registry', () => {
  it('provides one label code for every SendRoute', () => {
    for (const route of SEND_ROUTES) {
      const code = SEND_ROUTE_LABEL_CODES[route]
      expect(code).toBeTruthy()
      expect(code.startsWith('send.route.')).toBe(true)
    }
  })

  it('provides one label code for every PreviewMode', () => {
    for (const previewMode of PREVIEW_MODES) {
      const code = PREVIEW_MODE_LABEL_CODES[previewMode]
      expect(code).toBeTruthy()
      expect(code.startsWith('preview.mode.')).toBe(true)
    }
  })

  it('provides one label code for every ConfidenceLevel', () => {
    for (const level of CONFIDENCE_LEVELS) {
      const code = CONFIDENCE_LABEL_CODES[level]
      expect(code).toBeTruthy()
      expect(code.startsWith('confidence.')).toBe(true)
    }
  })

  it('keeps warning and blocked labels as code-only entries', () => {
    for (const code of WARNING_LABEL_CODES) {
      expect(code.startsWith('warning.')).toBe(true)
    }
    for (const code of BLOCKED_LABEL_CODES) {
      expect(code.startsWith('blocked.')).toBe(true)
    }
  })

  it('maintains a deduplicated aggregate label registry', () => {
    const deduped = new Set(LABEL_CODES)
    expect(deduped.size).toBe(LABEL_CODES.length)
  })
})
