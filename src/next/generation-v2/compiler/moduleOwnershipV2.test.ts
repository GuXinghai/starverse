import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import * as legacyBody from './stableSerialize'
import * as coreBody from '../../../core/generation-v2/compiler/stableSerialize'
import * as legacyLedger from './semanticConsumptionLedgerV2'
import * as coreLedger from '../../../core/generation-v2/compiler/semanticConsumptionLedgerV2'

describe('Generation V2 kernel ownership', () => {
  it('shares a single prepared-body issuer and rejects structural forgeries', () => {
    expect(legacyBody.ImmutablePreparedBodyV2).toBe(coreBody.ImmutablePreparedBodyV2)
    const body = legacyBody.ImmutablePreparedBodyV2.fromNativeRequest({ text: '中文 😀', temperature: 0.7 })
    expect(coreBody.isImmutablePreparedBodyV2(body)).toBe(true)
    expect(coreBody.isImmutablePreparedBodyV2({ byteLength: body.byteLength, sha256: body.sha256 })).toBe(false)
    const copy = body.copyBytes()
    copy.fill(0)
    expect(body.verifyIntegrity()).toBe(true)
    expect(body.sha256).toBe(createHash('sha256').update(body.copyBytes()).digest('hex'))
  })

  it('shares one ledger brand and preserves canonical UTF-8 SHA-256', () => {
    const ledger = legacyLedger.createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'generation.temperature', disposition: 'encoded',
      nativeField: 'temperature', encodingKind: 'identity', evidence: '来源 😀',
    }])
    expect(coreLedger.isSemanticConsumptionLedgerV2(ledger)).toBe(true)
    expect(coreLedger.isSemanticConsumptionLedgerV2({ ...ledger })).toBe(false)
    expect(ledger.sha256).toBe(createHash('sha256').update(ledger.canonicalJson, 'utf8').digest('hex'))
  })
})
