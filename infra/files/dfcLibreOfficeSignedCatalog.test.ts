import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DFC_OFFICE_PDF_CAPABILITIES,
  DFC_OFFICE_PDF_PLUGIN_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
  type DfcOfficePdfRuntimeManifest,
} from './dfcManagedLibreOfficeRuntime'
import {
  DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION,
  DFC_LIBREOFFICE_SIGNED_CATALOG_TRUST_POLICY_ID,
  canonicalizeDfcLibreOfficeCatalogPayload,
  evaluateDfcLibreOfficeCatalogRollbackEligibility,
  evaluateDfcLibreOfficeUnsignedCatalogCompatibility,
  verifyDfcLibreOfficeSignedCatalog,
  type DfcLibreOfficeCatalogEntry,
  type DfcLibreOfficeSignedCatalogEnvelope,
  type DfcLibreOfficeSignedCatalogPayload,
  type DfcLibreOfficeSignedCatalogTrustRoot,
} from './dfcLibreOfficeSignedCatalog'

describe('dfc LibreOffice signed catalog verification', () => {
  it('verifies a signed owner-gated catalog entry without granting production readiness', () => {
    const fixture = signedFixture()
    const result = verifyDfcLibreOfficeSignedCatalog({
      envelope: fixture.envelope,
      trustRoot: fixture.trustRoot,
      packageEvidence: fixture.packageEvidence,
      manifest: fixture.manifest,
      mode: 'owner_gated_candidate',
      now: '2026-06-22T00:00:00.000Z',
    })

    expect(result).toMatchObject({
      ok: true,
      trust: expect.objectContaining({
        signatureCatalogStatus: 'signature_valid_catalog_trusted',
        catalogSignatureStatus: 'valid',
        keyIdStatus: 'trusted',
        revocationStatus: 'not_revoked',
        expirationStatus: 'not_expired',
        ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
        productionTrustReadiness: 'blocked_source_unapproved',
        lastVerificationResult: 'signed_catalog_verified',
      }),
    })
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE\s+KEY/u)
  })

  it('preserves unsigned hash-pinned owner-gated candidate compatibility while blocking production mode', () => {
    const ownerGated = evaluateDfcLibreOfficeUnsignedCatalogCompatibility({
      hashPinned: true,
      mode: 'owner_gated_candidate',
    })
    const production = evaluateDfcLibreOfficeUnsignedCatalogCompatibility({
      hashPinned: true,
      mode: 'production',
    })

    expect(ownerGated).toMatchObject({
      ok: true,
      trust: expect.objectContaining({
        ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
        productionTrustReadiness: 'blocked_signature_missing',
        signatureCatalogStatus: 'signature_missing_catalog_unsigned',
      }),
    })
    expect(production).toMatchObject({
      ok: false,
      diagnosticCode: 'office_pdf_catalog_signature_missing',
      trust: expect.objectContaining({
        productionTrustReadiness: 'blocked_signature_missing',
        lastVerificationResult: 'blocked',
      }),
    })
  })

  it('rejects invalid signatures, untrusted keys, revoked packages, expired packages, and package mismatches', () => {
    const fixture = signedFixture()
    const tamperedEnvelope = {
      ...fixture.envelope,
      payload: {
        ...fixture.envelope.payload,
        entries: [{ ...fixture.entry, packageSizeBytes: fixture.entry.packageSizeBytes + 1 }],
      },
    }
    const untrustedKey = {
      ...fixture.trustRoot,
      trustedKeys: [{ ...fixture.trustRoot.trustedKeys[0], keyId: 'other-test-key' }],
    }

    expect(verifyDfcLibreOfficeSignedCatalog({
      envelope: tamperedEnvelope,
      trustRoot: fixture.trustRoot,
      packageEvidence: fixture.packageEvidence,
      manifest: fixture.manifest,
      mode: 'owner_gated_candidate',
    })).toMatchObject({ ok: false, diagnosticCode: 'office_pdf_catalog_signature_invalid' })

    expect(verifyDfcLibreOfficeSignedCatalog({
      envelope: fixture.envelope,
      trustRoot: untrustedKey,
      packageEvidence: fixture.packageEvidence,
      manifest: fixture.manifest,
      mode: 'owner_gated_candidate',
    })).toMatchObject({ ok: false, diagnosticCode: 'office_pdf_catalog_untrusted_key' })

    const revoked = signedFixture({ revokedAt: '2026-06-21T00:00:00.000Z' })
    expect(verifyDfcLibreOfficeSignedCatalog({
      envelope: revoked.envelope,
      trustRoot: revoked.trustRoot,
      packageEvidence: revoked.packageEvidence,
      manifest: revoked.manifest,
      mode: 'owner_gated_candidate',
    })).toMatchObject({
      ok: false,
      diagnosticCode: 'office_pdf_catalog_package_revoked',
      trust: expect.objectContaining({ productionTrustReadiness: 'blocked_revoked' }),
    })

    const expired = signedFixture({ expiresAt: '2026-06-21T00:00:00.000Z' })
    expect(verifyDfcLibreOfficeSignedCatalog({
      envelope: expired.envelope,
      trustRoot: expired.trustRoot,
      packageEvidence: expired.packageEvidence,
      manifest: expired.manifest,
      mode: 'owner_gated_candidate',
      now: '2026-06-22T00:00:00.000Z',
    })).toMatchObject({
      ok: false,
      diagnosticCode: 'office_pdf_catalog_package_expired',
      trust: expect.objectContaining({ productionTrustReadiness: 'blocked_expired' }),
    })

    expect(verifyDfcLibreOfficeSignedCatalog({
      envelope: fixture.envelope,
      trustRoot: fixture.trustRoot,
      packageEvidence: { sha256: 'f'.repeat(64), sizeBytes: fixture.packageEvidence.sizeBytes },
      manifest: fixture.manifest,
      mode: 'owner_gated_candidate',
    })).toMatchObject({ ok: false, diagnosticCode: 'office_pdf_catalog_package_mismatch' })
  })

  it('enforces rollback eligibility from signed catalog trust metadata', () => {
    const current = signedFixture({ packageVersion: '0.1.1' })
    const rollback = signedFixture({ rollbackAllowed: true })
    const rollbackVerification = verifyDfcLibreOfficeSignedCatalog({
      envelope: rollback.envelope,
      trustRoot: rollback.trustRoot,
      packageEvidence: rollback.packageEvidence,
      manifest: rollback.manifest,
      mode: 'owner_gated_candidate',
    })

    expect(evaluateDfcLibreOfficeCatalogRollbackEligibility({
      currentEntry: current.entry,
      rollbackEntry: rollback.entry,
      rollbackVerification,
      mode: 'owner_gated_candidate',
    })).toMatchObject({ ok: true, rollbackEligibility: 'eligible' })

    expect(evaluateDfcLibreOfficeCatalogRollbackEligibility({
      currentEntry: current.entry,
      rollbackEntry: { ...rollback.entry, platform: 'darwin' },
      rollbackVerification,
      mode: 'owner_gated_candidate',
    })).toMatchObject({ ok: false, reason: 'platform_arch_mismatch' })

    expect(evaluateDfcLibreOfficeCatalogRollbackEligibility({
      currentEntry: current.entry,
      rollbackEntry: { ...rollback.entry, revokedAt: '2026-06-21T00:00:00.000Z' },
      rollbackVerification,
      mode: 'owner_gated_candidate',
    })).toMatchObject({ ok: false, reason: 'revoked' })

    expect(evaluateDfcLibreOfficeCatalogRollbackEligibility({
      currentEntry: current.entry,
      rollbackEntry: { ...rollback.entry, expiresAt: '2026-06-21T00:00:00.000Z' },
      rollbackVerification,
      mode: 'owner_gated_candidate',
      now: '2026-06-22T00:00:00.000Z',
    })).toMatchObject({ ok: false, reason: 'expired' })

    expect(evaluateDfcLibreOfficeCatalogRollbackEligibility({
      currentEntry: current.entry,
      rollbackEntry: { ...rollback.entry, rollbackAllowed: false },
      rollbackVerification,
      mode: 'owner_gated_candidate',
    })).toMatchObject({ ok: false, reason: 'rollback_disallowed' })

    expect(evaluateDfcLibreOfficeCatalogRollbackEligibility({
      currentEntry: current.entry,
      rollbackEntry: rollback.entry,
      rollbackVerification: verifyDfcLibreOfficeSignedCatalog({
        envelope: rollback.envelope,
        trustRoot: rollback.trustRoot,
        packageEvidence: { ...rollback.packageEvidence, sizeBytes: rollback.packageEvidence.sizeBytes + 1 },
        manifest: rollback.manifest,
        mode: 'owner_gated_candidate',
      }),
      mode: 'owner_gated_candidate',
    })).toMatchObject({ ok: false, reason: 'catalog_verification_failed' })
  })
})

function signedFixture(overrides: Partial<DfcLibreOfficeCatalogEntry> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const entry = entryFixture(overrides)
  const payload: DfcLibreOfficeSignedCatalogPayload = {
    schemaVersion: DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION,
    catalogId: 'starverse-dfc-libreoffice-runtime-catalog',
    createdAt: '2026-06-22T00:00:00.000Z',
    entries: [entry],
  }
  const signatureValue = sign(null, Buffer.from(canonicalizeDfcLibreOfficeCatalogPayload(payload), 'utf8'), privateKey).toString('base64')
  const envelope: DfcLibreOfficeSignedCatalogEnvelope = {
    schemaVersion: DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION,
    payload,
    signature: {
      algorithm: 'ed25519',
      keyId: 'starverse-test-libreoffice-catalog-key',
      value: signatureValue,
      signedAt: '2026-06-22T00:00:00.000Z',
    },
  }
  const trustRoot: DfcLibreOfficeSignedCatalogTrustRoot = {
    schemaVersion: DFC_LIBREOFFICE_SIGNED_CATALOG_SCHEMA_VERSION,
    trustedKeys: [{
      keyId: 'starverse-test-libreoffice-catalog-key',
      algorithm: 'ed25519',
      publicKeyPem,
      scope: 'test_only',
    }],
  }
  return {
    entry,
    envelope,
    trustRoot,
    packageEvidence: {
      sha256: entry.packageSha256,
      sizeBytes: entry.packageSizeBytes,
    },
    manifest: manifestFixture(entry),
  }
}

function entryFixture(overrides: Partial<DfcLibreOfficeCatalogEntry> = {}): DfcLibreOfficeCatalogEntry {
  return {
    packageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    runtimePackageId: DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID,
    runtimeId: DFC_OFFICE_PDF_RUNTIME_ID,
    pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
    runtimeVersion: '26.2.4',
    packageVersion: '0.1.0',
    platform: 'win32',
    arch: 'x64',
    packageSha256: 'a'.repeat(64),
    packageSizeBytes: 518907010,
    executableRelativePath: 'program/soffice.exe',
    executableSha256: 'b'.repeat(64),
    executableSizeBytes: 123456,
    capabilities: [...DFC_OFFICE_PDF_CAPABILITIES],
    sourceKind: 'github_prerelease_asset',
    channel: 'owner_gated_candidate',
    productionApproved: false,
    trustPolicyId: DFC_LIBREOFFICE_SIGNED_CATALOG_TRUST_POLICY_ID,
    createdAt: '2026-06-22T00:00:00.000Z',
    expiresAt: '2027-06-22T00:00:00.000Z',
    revokedAt: null,
    revocationReason: null,
    rollbackAllowed: true,
    minimumStarverseContractVersion: '1',
    ...overrides,
  }
}

function manifestFixture(entry: DfcLibreOfficeCatalogEntry): DfcOfficePdfRuntimeManifest {
  return {
    manifestSchemaVersion: '1',
    pluginId: entry.pluginId,
    packageId: entry.packageId,
    runtimePackageId: entry.runtimePackageId,
    engineId: 'libreoffice',
    runtimeId: entry.runtimeId,
    displayName: 'LibreOffice Office PDF',
    pluginVersion: entry.packageVersion,
    runtimeKind: 'managed_external_process',
    enabled: true,
    platform: entry.platform,
    arch: entry.arch,
    executablePath: entry.executableRelativePath,
    libreOfficeVersion: entry.runtimeVersion,
    packageVersion: entry.packageVersion,
    artifactSha256: entry.packageSha256,
    executableSha256: entry.executableSha256,
    executableSizeBytes: entry.executableSizeBytes,
    provenance: 'test-only',
    licenseId: 'MPL-2.0',
    attribution: 'test-only',
    notices: ['test-only'],
    capabilities: entry.capabilities,
    minimumStarverseContractVersion: entry.minimumStarverseContractVersion ?? '1',
    officialRelease: {
      sourceKind: 'official',
      packageRef: 'test-only-package-ref',
      provenance: 'test-only',
    },
    securityPolicy: {
      macrosDisabled: true,
      networkDisabled: true,
      externalLinksDisabled: true,
      embeddedObjectExecutionDisabled: true,
      isolatedProfileRequired: true,
    },
  }
}
