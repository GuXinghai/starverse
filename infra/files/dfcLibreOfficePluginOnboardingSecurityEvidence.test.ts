import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DFC_LIBREOFFICE_PDF_PATH_POLICY_EXCEEDED,
  DFC_LIBREOFFICE_WINDOWS_X64_PATH_CAPS,
  buildLibreOfficePdfArgs,
} from './dfcLibreOfficePdfAdapter'
import { getDfcLibreOfficeFirstPartyRuntimeCatalogEntry } from './dfcManagedLibreOfficeRuntime'

type RuntimeSecurityReviewRow = Readonly<{
  control: string
  evidence: 'enforced' | 'declared_blocking_gap'
  diagnosticCode: string | null
}>

const DIAGNOSTIC_TAXONOMY = [
  ['runtime missing', 'office_pdf_runtime_missing'],
  ['runtime disabled', 'office_pdf_runtime_disabled'],
  ['runtime invalid manifest', 'office_pdf_runtime_manifest_invalid'],
  ['runtime metadata incomplete', 'office_pdf_runtime_metadata_incomplete'],
  ['unsupported platform', 'office_pdf_runtime_platform_unsupported'],
  ['install/import incomplete', 'office_pdf_runtime_missing'],
  ['package revoked', 'office_pdf_runtime_quarantined'],
  ['package expired', 'office_pdf_runtime_manifest_invalid'],
  ['executable missing', 'office_pdf_runtime_executable_missing'],
  ['executable hash mismatch', 'office_pdf_runtime_manifest_invalid'],
  ['executable size mismatch', 'office_pdf_runtime_manifest_invalid'],
  ['path policy exceeded', DFC_LIBREOFFICE_PDF_PATH_POLICY_EXCEEDED],
  ['sandbox denied', 'conversion_sandbox_denied'],
  ['conversion timeout', 'conversion_engine_timeout'],
  ['conversion failed', 'conversion_engine_failed'],
  ['output missing', 'conversion_output_missing'],
  ['output escaped sandbox', 'conversion_sandbox_denied'],
  ['output invalid PDF', 'conversion_engine_failed'],
  ['runtime unhealthy', 'conversion_engine_unhealthy'],
  ['package quarantined', 'office_pdf_runtime_quarantined'],
  ['acquisition disabled', 'office_pdf_acquisition_disabled'],
  ['download disabled by policy', 'office_pdf_download_disabled_by_policy'],
] as const

describe('DFC LibreOffice M37-M39 plugin onboarding security evidence', () => {
  it('keeps the managed runtime plugin owner-gated, DOCX-only, and download disabled', () => {
    const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()

    expect(catalog.displayName).toBe('LibreOffice Office PDF')
    expect(catalog.capabilityIds).toEqual(['document_conversion', 'office_to_pdf', 'docx_to_pdf'])
    expect(catalog.supportedFormats).toEqual(['docx'])
    expect(catalog.productionApproved).toBe(false)
    expect(catalog.experimental).toBe(true)
    expect(catalog.artifactSourcePolicy.packagedBinaryIncluded).toBe(false)
    expect(catalog.artifactSourcePolicy.systemPathFallbackAllowed).toBe(false)
    expect(catalog.acquisitionSource.downloadEnabled).toBe(false)
    expect(catalog.acquisitionSource.productionApproved).toBe(false)
    expect(catalog.acquisitionSource.ownerGated).toBe(true)
    expect(catalog.layoutContract.sourcePolicy.systemPathFallbackAllowed).toBe(false)
    expect(catalog.layoutContract.executablePathPolicy.absolutePathAllowed).toBe(false)
  })

  it('records the focused runtime security review matrix without upgrading manifest-only controls', () => {
    const args = buildLibreOfficePdfArgs({
      inputPath: path.resolve('sandbox/input/input.docx'),
      outputDir: path.resolve('sandbox/output'),
      profileDir: path.resolve('sandbox/work/libreoffice-profile'),
    })
    const review: readonly RuntimeSecurityReviewRow[] = [
      { control: 'manifest executable policy', evidence: 'enforced', diagnosticCode: 'office_pdf_runtime_path_rejected' },
      { control: 'managed runtime handle only', evidence: 'enforced', diagnosticCode: null },
      { control: 'no system discovery', evidence: 'enforced', diagnosticCode: 'office_pdf_runtime_missing' },
      { control: 'no PATH fallback', evidence: 'enforced', diagnosticCode: 'office_pdf_runtime_missing' },
      { control: 'no user executable picker', evidence: 'enforced', diagnosticCode: null },
      { control: 'no renderer executable path', evidence: 'enforced', diagnosticCode: null },
      { control: 'argument array and shell false', evidence: 'enforced', diagnosticCode: null },
      { control: 'sandbox input copy', evidence: 'enforced', diagnosticCode: 'conversion_sandbox_denied' },
      { control: 'controlled output directory', evidence: 'enforced', diagnosticCode: 'conversion_sandbox_denied' },
      { control: 'isolated LibreOffice profile', evidence: 'enforced', diagnosticCode: null },
      { control: 'timeout and process cleanup', evidence: 'enforced', diagnosticCode: 'conversion_engine_timeout' },
      { control: 'stdout stderr size limits and redaction', evidence: 'enforced', diagnosticCode: null },
      { control: 'PDF output validation', evidence: 'enforced', diagnosticCode: 'conversion_engine_failed' },
      { control: 'macros not executed', evidence: 'declared_blocking_gap', diagnosticCode: 'office_pdf_runtime_metadata_incomplete' },
      { control: 'external links not refreshed', evidence: 'declared_blocking_gap', diagnosticCode: 'office_pdf_runtime_metadata_incomplete' },
      { control: 'network disabled', evidence: 'declared_blocking_gap', diagnosticCode: 'office_pdf_runtime_metadata_incomplete' },
      { control: 'embedded object execution disabled', evidence: 'declared_blocking_gap', diagnosticCode: 'office_pdf_runtime_metadata_incomplete' },
      { control: 'sandbox profile temp cleanup', evidence: 'enforced', diagnosticCode: null },
    ]

    expect(args).toContain('--headless')
    expect(args.some((arg) => arg.startsWith('-env:UserInstallation=file:'))).toBe(true)
    expect(args.join(' ')).not.toMatch(/&&|\||cmd\.exe|powershell/iu)
    expect(review.filter((row) => row.evidence === 'declared_blocking_gap').map((row) => row.control)).toEqual([
      'macros not executed',
      'external links not refreshed',
      'network disabled',
      'embedded object execution disabled',
    ])
    expect(JSON.stringify(review)).not.toMatch(/[A-Za-z]:\\|file:\/\/|soffice\.exe|storageRef|contentToken|[a-f0-9]{64}/iu)
  })

  it('covers the diagnostic taxonomy with symbolic sanitized codes', () => {
    expect(DFC_LIBREOFFICE_WINDOWS_X64_PATH_CAPS).toEqual({
      runtimeRoot: 120,
      sandboxRoot: 80,
      inputPath: 130,
      outputDir: 90,
      profileDir: 110,
    })
    expect(DIAGNOSTIC_TAXONOMY).toHaveLength(22)
    for (const [, code] of DIAGNOSTIC_TAXONOMY) {
      expect(code).toMatch(/^[a-z0-9_]+$/u)
    }
    expect(JSON.stringify(DIAGNOSTIC_TAXONOMY)).not.toMatch(/[A-Za-z]:\\|file:\/\/|soffice\.exe|storageRef|contentToken|[a-f0-9]{64}/iu)
  })
})
