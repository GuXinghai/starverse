import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(testDir, '..', '..')
const checklistPath = join(
  repoRoot,
  'docs',
  'file-pipeline',
  'document-format-conversion',
  'LIBREOFFICE_PRODUCTION_APPROVAL_CHECKLIST.md',
)

function readChecklist(): string {
  return readFileSync(checklistPath, 'utf8')
}

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(repoRoot, ...segments), 'utf8')
}

function collectProductionFiles(): string[] {
  const roots = ['infra', 'src', 'electron'].map((segment) => join(repoRoot, segment))
  const files: string[] = []
  const stack = [...roots]

  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of readdirSync(current)) {
      const fullPath = join(current, entry)
      const stats = statSync(fullPath)
      if (stats.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!/\.(?:ts|tsx|vue)$/i.test(entry)) continue
      if (/\.test\.(?:ts|tsx)$/i.test(entry)) continue
      files.push(fullPath)
    }
  }

  return files
}

function repoRelative(path: string): string {
  return relative(repoRoot, path).split('\\').join('/')
}

describe('LibreOffice production approval checklist audit', () => {
  it('records scoped Windows x64 DOCX-to-PDF production approval', () => {
    const checklist = readChecklist()

    expect(checklist).toContain('Status: Owner-approved Windows x64 DOCX-to-PDF production support / cross-platform deferred')
    expect(checklist).toContain('Production state: `productionApproved=true` scoped to Windows x64 DOCX-to-PDF only')
    expect(checklist).toContain('approvedPlatform: `win32`')
    expect(checklist).toContain('approvedArch: `x64`')
    expect(checklist).toContain('approvedInput: `docx`')
    expect(checklist).toContain('approvedOutput: `pdf_attachment`')
    expect(checklist).toContain('approvedAcquisitionModes: `manual_github_release`, `offline_import`')
    expect(checklist).toContain('automaticDownloadEnabled: `false`')
    expect(checklist).toContain('postinstallDownloadEnabled: `false`')
    expect(checklist).toContain('conversionTimeDownloadEnabled: `false`')

    const approvalFiles = collectProductionFiles()
      .filter((file) => /productionApproved\s*[:=]\s*true|productionApproved=true/.test(readFileSync(file, 'utf8')))
      .map(repoRelative)

    expect(approvalFiles).toEqual(['infra/files/dfcManagedLibreOfficeRuntime.ts'])
  })

  it('keeps the approved package identity, source provenance, and automatic-download ban explicit', () => {
    const checklist = readChecklist()
    const runtimeGate = readRepoFile('infra', 'files', 'dfcManagedLibreOfficeRuntime.ts')
    const acquisition = readRepoFile('infra', 'files', 'dfcLibreOfficeRuntimeAcquisition.ts')

    expect(checklist).toContain('https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi')
    expect(checklist).toContain('starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg')
    expect(checklist).toContain('starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64')
    expect(checklist).toContain('202f26cda071c5aa4996a5a28412fddceb3891dceb0366982c62650456c0730f')
    expect(checklist).toContain('372539392')
    expect(checklist).toContain('ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e')
    expect(checklist).toContain('518907010')
    expect(checklist).toContain('| Catalog download state | `downloadEnabled=false` |')
    expect(checklist).toContain('Manual GitHub Release install and verified offline import are approved acquisition modes.')
    expect(checklist).toContain('Opening Plugin Management, reading status, uploading DOCX, generating DFC options, Send Plan, and conversion attempts must not download.')

    expect(runtimeGate).toContain("sourceKind: 'github_release_asset'")
    expect(runtimeGate).toContain('downloadEnabled: false')
    expect(runtimeGate).toContain("platform: 'win32'")
    expect(runtimeGate).toContain("arch: 'x64'")
    expect(runtimeGate).toContain("approvedInput: 'docx'")
    expect(runtimeGate).toContain("approvedOutput: 'pdf_attachment'")
    expect(acquisition).toContain('if (!source.downloadEnabled || source.sourceKind === \'disabled\')')

    const accidentalEnabledDownloads = collectProductionFiles()
      .filter((file) => /downloadEnabled\s*:\s*true|automaticDownloadEnabled\s*:\s*true|postinstallDownloadEnabled\s*:\s*true|conversionTimeDownloadEnabled\s*:\s*true/.test(readFileSync(file, 'utf8')))
      .map(repoRelative)

    expect(accidentalEnabledDownloads).toEqual([])
  })

  it('records cross-platform deferral and unsupported format locks', () => {
    const checklist = readChecklist()

    expect(checklist).toContain('## Cross-Platform Deferral Record')
    expect(checklist).toContain('darwin / arm64')
    expect(checklist).toContain('darwin / x64')
    expect(checklist).toContain('linux / x64')
    expect(checklist).toContain('linux / arm64')
    expect(checklist).toContain('Production enablement is package-gated per platform.')
    expect(checklist).toContain('macOS and Linux remain deferred, not rejected.')
    expect(checklist).toContain('`.doc`')
    expect(checklist).toContain('`.rtf`')
    expect(checklist).toContain('`.docm`')
    expect(checklist).toContain('`.xls/.xlsx` Office-to-PDF')
    expect(checklist).toContain('PS/EPS')
    expect(checklist).toContain('PDF OCR/local parsing')
    expect(checklist).toContain('image/audio processing')
    expect(checklist).toContain('system LibreOffice')
    expect(checklist).toContain('PATH fallback')
    expect(checklist).toContain('arbitrary executable path')
    expect(checklist).toContain('renderer-provided executable path')
    expect(checklist).toContain('arbitrary plugin URL input')
  })

  it('keeps legal, provenance, security, rollback, and revocation records scoped', () => {
    const checklist = readChecklist()

    expect(checklist).toContain('Approval statement by Owner: approved for Windows x64 DOCX-to-PDF managed `.svpkg` only.')
    expect(checklist).toContain('The Document Foundation')
    expect(checklist).toContain('Package manifest, runtime manifest, inventory, provenance JSON, license files, NOTICE / CREDITS / attribution files')
    expect(checklist).toContain('managed runtime handle only')
    expect(checklist).toContain('no system LibreOffice')
    expect(checklist).toContain('no PATH fallback')
    expect(checklist).toContain('shell: false')
    expect(checklist).toContain('argument-array invocation')
    expect(checklist).toContain('path-cap guard')
    expect(checklist).toContain('signed catalog/revocation/expiration/rollback checks')
    expect(checklist).toContain('Revoked packages are not launchable and are not rollback targets.')
    expect(checklist).toContain('Accepted macro/external-link/network/embedded-object risk is limited to Windows x64 DOCX-to-PDF')
  })
})
