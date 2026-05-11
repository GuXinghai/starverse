import { describe, expect, it } from 'vitest'
import { basenameForLog, redactSensitiveString, summarizeErrorForLog, summarizeIpcParamsForLog } from './logSanitizer'

describe('logSanitizer', () => {
  it('redacts absolute paths, base64, contentToken, and fullHash fragments', () => {
    const raw = 'C:\\Users\\alice\\secret\\report.pdf data:image/png;base64,AAAA contentToken=tok-123 fullHash=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
    const output = redactSensitiveString(raw)
    expect(output).toContain('[redacted-path]')
    expect(output).toContain('data:[redacted]')
    expect(output).toContain('contentToken=[redacted-token]')
    expect(output).toContain('fullHash=[redacted-hash]')
    expect(output).not.toContain('C:\\Users\\alice\\secret\\report.pdf')
    expect(output).not.toContain('base64,AAAA')
    expect(output).not.toContain('tok-123')
    expect(output).not.toContain('a1b2c3d4e5f6')
  })

  it('returns basename only for local paths', () => {
    expect(basenameForLog('C:\\Users\\alice\\Pictures\\report.png')).toBe('report.png')
    expect(basenameForLog('/Users/alice/Pictures/report.png')).toBe('report.png')
    expect(basenameForLog('file:///C:/Users/alice/Pictures/report.png')).toBe('report.png')
  })

  it('summarizes params without values', () => {
    const summary = summarizeIpcParamsForLog({
      filePath: 'C:\\Users\\alice\\secret.txt',
      contentToken: 'token-value',
      blob: 'x'.repeat(1024),
    })
    expect(summary.paramsType).toBe('object')
    expect(summary.paramsKeys).toEqual(expect.arrayContaining(['filePath', 'contentToken', 'blob']))
    expect(summary.paramsCount).toBe(3)
    expect(summary.payloadSizeBucket).toMatch(/<1kb|1-10kb|10-100kb|100kb-1mb|>=1mb|unknown/)
  })

  it('summarizes errors without leaking raw paths or hashes', () => {
    const error = new Error('failed to read C:\\Users\\alice\\notes.txt fullHash=abc123def456abc123def456abc123def456abc123def456abc123def456abc1')
    error.stack = 'Error: failed to read C:\\Users\\alice\\notes.txt\n at fn (C:\\Users\\alice\\app\\x.ts:1:1)'
    ;(error as any).code = 'EFAIL'

    const summary = summarizeErrorForLog(error)
    expect(summary.name).toBe('Error')
    expect(summary.code).toBe('EFAIL')
    expect(summary.sanitizedMessage).toContain('[redacted-path]')
    expect(summary.sanitizedMessage).toContain('[redacted-hash]')
    expect(summary.sanitizedStack).toContain('[redacted-path]')
    expect(summary.sanitizedMessage).not.toContain('C:\\Users\\alice\\notes.txt')
    expect(summary.sanitizedMessage).not.toContain('abc123def456')
  })
})
