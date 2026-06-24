import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  classifyPackageSize,
  formatPreflightEvidence,
  preflightLibreOfficeSvpkg,
} from './libreoffice-svpkg-preflight.mjs'

describe('LibreOffice svpkg smoke preflight', () => {
  it('rejects missing and non-svpkg inputs with symbolic diagnostics', async () => {
    const missing = await preflightLibreOfficeSvpkg(path.join(os.tmpdir(), 'missing-libreoffice.svpkg'))
    const wrongExtension = await preflightLibreOfficeSvpkg(path.join(os.tmpdir(), 'libreoffice.zip'))

    expect(missing).toMatchObject({
      ok: false,
      diagnosticCode: 'office_pdf_package_missing',
    })
    expect(wrongExtension).toMatchObject({
      ok: false,
      diagnosticCode: 'office_pdf_package_invalid_extension',
    })
  })

  it('rejects tiny placeholder packages before import and keeps evidence sanitized', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'svpkg-preflight-'))
    const packagePath = path.join(root, 'placeholder.svpkg')
    await writeFile(packagePath, '{"error":"not a runtime package"}')
    try {
      const result = await preflightLibreOfficeSvpkg(packagePath)
      const evidence = formatPreflightEvidence(result)

      expect(result).toMatchObject({
        ok: false,
        diagnosticCode: 'office_pdf_package_invalid_size',
        evidence: expect.objectContaining({
          sizeClass: '<100kb',
          bodyClass: 'json_or_text_response',
        }),
      })
      expect(evidence).not.toContain(packagePath)
      expect(evidence).not.toContain('not a runtime package')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('validates expected size and hash while exposing only a short hash prefix', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'svpkg-preflight-'))
    const packagePath = path.join(root, 'runtime.svpkg')
    const bytes = Buffer.from('fixture package bytes')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    await writeFile(packagePath, bytes)
    try {
      const result = await preflightLibreOfficeSvpkg(packagePath, {
        expectedSizeBytes: bytes.byteLength,
        expectedSha256: sha256,
        minRealPackageBytes: 1,
      })
      const evidence = formatPreflightEvidence(result)

      expect(result).toMatchObject({
        ok: true,
        diagnosticCode: null,
        evidence: expect.objectContaining({
          expectedSizeMatched: true,
          expectedHashMatched: true,
          hashPrefix: sha256.slice(0, 12),
        }),
      })
      expect(evidence).toContain(sha256.slice(0, 12))
      expect(evidence).not.toContain(sha256)
      expect(evidence).not.toContain(packagePath)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects hash mismatches before packaged Electron launch', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'svpkg-preflight-'))
    const packagePath = path.join(root, 'runtime.svpkg')
    const bytes = Buffer.from('fixture package bytes')
    await writeFile(packagePath, bytes)
    try {
      const result = await preflightLibreOfficeSvpkg(packagePath, {
        expectedSizeBytes: bytes.byteLength,
        expectedSha256: '0'.repeat(64),
        minRealPackageBytes: 1,
      })

      expect(result).toMatchObject({
        ok: false,
        diagnosticCode: 'office_pdf_package_hash_mismatch',
        evidence: expect.objectContaining({
          expectedSizeMatched: true,
          expectedHashMatched: false,
        }),
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('classifies real package size evidence without exposing paths', () => {
    expect(classifyPackageSize(518907010)).toBe('>=100mb')
    expect(classifyPackageSize(1024)).toBe('<100kb')
  })
})
