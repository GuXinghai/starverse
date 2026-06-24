import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import path from 'node:path'

export const DFC_LIBREOFFICE_EXPECTED_SVPKG = Object.freeze({
  sizeBytes: 518907010,
  sha256: 'ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e',
  minRealPackageBytes: 100 * 1024 * 1024,
})

export async function preflightLibreOfficeSvpkg(packagePath, options = {}) {
  const expectedSizeBytes = options.expectedSizeBytes ?? DFC_LIBREOFFICE_EXPECTED_SVPKG.sizeBytes
  const expectedSha256 = options.expectedSha256 ?? DFC_LIBREOFFICE_EXPECTED_SVPKG.sha256
  const minRealPackageBytes = options.minRealPackageBytes ?? DFC_LIBREOFFICE_EXPECTED_SVPKG.minRealPackageBytes
  const normalized = String(packagePath ?? '').trim()
  const extension = path.extname(normalized).toLowerCase()
  if (!normalized) {
    return failure('office_pdf_package_missing', { extension })
  }
  if (extension !== '.svpkg') {
    return failure('office_pdf_package_invalid_extension', { extension })
  }

  const fileStat = await stat(normalized).catch((error) => {
    if (isNotFound(error)) return null
    return undefined
  })
  if (!fileStat) {
    return failure(fileStat === null ? 'office_pdf_package_missing' : 'office_pdf_package_unreadable', { extension })
  }
  if (!fileStat.isFile()) {
    return failure('office_pdf_package_unreadable', { extension })
  }

  const sizeBytes = fileStat.size
  const baseEvidence = {
    extension,
    sizeBytes,
    sizeClass: classifyPackageSize(sizeBytes),
    expectedSizeMatched: expectedSizeBytes == null ? null : sizeBytes === expectedSizeBytes,
    expectedHashMatched: expectedSha256 ? false : null,
    hashPrefix: null,
  }
  if (sizeBytes <= 0 || sizeBytes < minRealPackageBytes) {
    const bodyClass = await classifyTinyBody(normalized)
    return failure('office_pdf_package_invalid_size', { ...baseEvidence, bodyClass })
  }
  if (expectedSizeBytes != null && sizeBytes !== expectedSizeBytes) {
    return failure('office_pdf_package_size_mismatch', baseEvidence)
  }
  if (expectedSha256) {
    const hash = await sha256File(normalized)
    const evidence = {
      ...baseEvidence,
      expectedHashMatched: hash === expectedSha256,
      hashPrefix: hash.slice(0, 12),
    }
    if (hash !== expectedSha256) return failure('office_pdf_package_hash_mismatch', evidence)
    return { ok: true, diagnosticCode: null, evidence }
  }
  return { ok: true, diagnosticCode: null, evidence: baseEvidence }
}

export function formatPreflightEvidence(result) {
  return JSON.stringify({
    type: 'dfc-libreoffice-svpkg-preflight',
    passed: result.ok,
    diagnosticCode: result.diagnosticCode,
    evidence: result.evidence,
  })
}

export function classifyPackageSize(sizeBytes) {
  if (sizeBytes >= 500 * 1024 * 1024) return '>=500mb'
  if (sizeBytes >= 100 * 1024 * 1024) return '>=100mb'
  if (sizeBytes >= 10 * 1024 * 1024) return '>=10mb'
  if (sizeBytes >= 1024 * 1024) return '>=1mb'
  if (sizeBytes >= 100 * 1024) return '>=100kb'
  return '<100kb'
}

async function classifyTinyBody(filePath) {
  const handle = await open(filePath, 'r').catch(() => null)
  if (!handle) return 'unreadable'
  try {
    const buffer = Buffer.alloc(256)
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0)
    const text = buffer.subarray(0, bytesRead).toString('utf8').trimStart()
    if (!text) return 'empty_or_binary'
    if (/^<!doctype html|^<html[\s>]/iu.test(text)) return 'html_error_page'
    if (/^[\[{]/u.test(text)) return 'json_or_text_response'
    return 'truncated_or_placeholder'
  } finally {
    await handle.close().catch(() => undefined)
  }
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', resolve)
  })
  return hash.digest('hex')
}

function failure(diagnosticCode, evidence) {
  return { ok: false, diagnosticCode, evidence }
}

function isNotFound(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT'
}
