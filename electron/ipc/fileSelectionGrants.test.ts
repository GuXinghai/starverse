import { describe, expect, it } from 'vitest'
import { createFileSelectionGrantStore } from './fileSelectionGrants'

describe('file selection grants', () => {
  it('allows one matching sender/path consume and rejects reuse', () => {
    let now = 1000
    const store = createFileSelectionGrantStore({
      now: () => now,
      tokenFactory: () => 'grant-1',
      ttlMs: 5000,
    })
    const grant = store.create({ senderId: 7, filePath: 'C:/tmp/report.pdf' })

    expect(grant).toEqual({
      filePath: 'C:/tmp/report.pdf',
      token: 'grant-1',
      expiresAtMs: 6000,
    })
    expect(store.consume({ senderId: 7, filePath: 'C:/tmp/report.pdf', token: 'grant-1' })).toEqual({ ok: true })
    expect(store.consume({ senderId: 7, filePath: 'C:/tmp/report.pdf', token: 'grant-1' })).toEqual({
      ok: false,
      code: 'grant_missing',
    })
  })

  it('rejects expired grants', () => {
    let now = 1000
    const store = createFileSelectionGrantStore({
      now: () => now,
      tokenFactory: () => 'grant-expired',
      ttlMs: 10,
    })
    store.create({ senderId: 7, filePath: 'C:/tmp/report.pdf' })
    now = 1011

    expect(store.consume({ senderId: 7, filePath: 'C:/tmp/report.pdf', token: 'grant-expired' })).toEqual({
      ok: false,
      code: 'grant_expired',
    })
  })

  it('rejects cross-sender and wrong-path attempts', () => {
    const store = createFileSelectionGrantStore({
      now: () => 1000,
      tokenFactory: (() => {
        let seq = 0
        return () => `grant-${++seq}`
      })(),
      ttlMs: 5000,
    })
    const crossSender = store.create({ senderId: 7, filePath: 'C:/tmp/report.pdf' })
    const wrongPath = store.create({ senderId: 7, filePath: 'C:/tmp/report.pdf' })

    expect(store.consume({ senderId: 8, filePath: 'C:/tmp/report.pdf', token: crossSender.token })).toEqual({
      ok: false,
      code: 'sender_mismatch',
    })
    expect(store.consume({ senderId: 7, filePath: 'C:/tmp/other.pdf', token: wrongPath.token })).toEqual({
      ok: false,
      code: 'path_mismatch',
    })
  })
})
