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
  it('keeps production approval explicitly false and blocks accidental production approval in source', () => {
    const checklist = readChecklist()
    expect(checklist).toContain('Status: Owner approval checklist / production not approved')
    expect(checklist).toContain('Production state: `productionApproved=false`')
    expect(checklist).toContain('- `productionApproved=false` remains correct.')
    expect(checklist).toContain('- Not allowed now: production-ready, bundled LibreOffice, broad Office support, automatic runtime download, system fallback, or `productionApproved=true`.')
    expect(checklist).toContain('- change `productionApproved` to true,')

    const accidentalApprovals = collectProductionFiles()
      .filter((file) => /productionApproved\s*[:=]\s*true|productionApproved=true/.test(readFileSync(file, 'utf8')))
      .map(repoRelative)

    expect(accidentalApprovals).toEqual([])
  })

  it('records the verified package and upstream metadata required for approval review', () => {
    const checklist = readChecklist()

    expect(checklist).toContain('https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi')
    expect(checklist).toContain('starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg')
    expect(checklist).toContain('starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64')
    expect(checklist).toContain('202f26cda071c5aa4996a5a28412fddceb3891dceb0366982c62650456c0730f')
    expect(checklist).toContain('372539392')
    expect(checklist).toContain('ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e')
    expect(checklist).toContain('518907010')
    expect(checklist).toContain('| Release type | prerelease |')
    expect(checklist).toContain('| Catalog download state | `downloadEnabled=false` |')
  })

  it('keeps DOCX-only scope explicit and records non-goal format expansion blockers', () => {
    const checklist = readChecklist()

    expect(checklist).toContain('Office-to-PDF product status remains DOCX-only, owner-gated, and experimental.')
    expect(checklist).toContain('- Input: DOCX only for Office-to-PDF.')
    expect(checklist).toContain('- `.doc`, `.rtf`, `.docm`.')
    expect(checklist).toContain('- HTML PDF expansion in this approval package.')
    expect(checklist).toContain('- PS/EPS.')
    expect(checklist).toContain('- PDF OCR or local PDF parsing.')
    expect(checklist).toContain('- implement `.doc`, `.rtf`, `.docm`,')
    expect(checklist).toContain('- implement HTML PDF changes,')
    expect(checklist).toContain('- implement PS/EPS,')
    expect(checklist).toContain('- implement PDF OCR or local PDF parsing,')
  })

  it('keeps path-depth and sandbox output risk recorded as a blocker before approval', () => {
    const checklist = readChecklist()

    expect(checklist).toContain('- Windows path-depth / sandbox / LibreOffice output path risk.')
    expect(checklist).toContain('- Deep repo-external runtime root smoke failed at process conversion.')
    expect(checklist).toContain('- Short repo-external runtime root smoke succeeded with the same redownloaded prerelease package.')
    expect(checklist).toContain('## 8. Path-Depth / Sandbox / Output Risk')
    expect(checklist).toContain('| Runtime root depth | short, medium, deep |')
    expect(checklist).toContain('Define a maximum supported runtime root/output path length or harden the sandbox/runtime root selection to enforce short controlled paths.')
    expect(checklist).toContain('Production approval must not proceed until the chosen maximum path-length policy or controlled short-path policy is written down and verified against the reproduction matrix above.')
    expect(checklist).toContain('npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot --silent')
    expect(checklist).toContain('The default command validates the matrix definition and sanitized evidence shape only. It does not run real LibreOffice.')
    expect(checklist).toContain('STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SMOKE')
    expect(checklist).toContain('STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SHORT_RUNTIME_ROOT')
    expect(checklist).toContain('STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_DEEP_RUNTIME_ROOT')
    expect(checklist).toContain('harness output records only case ids, path classes, path lengths, cleanup status, and diagnostic codes')
  })

  it('keeps runtime security approval gates present before production approval', () => {
    const checklist = readChecklist()

    expect(checklist).toContain('## 9. Runtime Security Checklist')
    expect(checklist).toContain('- Execution only through a managed runtime handle.')
    expect(checklist).toContain('- No system LibreOffice discovery.')
    expect(checklist).toContain('- No PATH fallback.')
    expect(checklist).toContain('- Argument-array process launch; no shell command concatenation.')
    expect(checklist).toContain('- Controlled sandbox output directory.')
    expect(checklist).toContain('- Isolated temporary LibreOffice profile.')
    expect(checklist).toContain('- Timeout and process-tree cleanup.')
    expect(checklist).toContain('- stdout/stderr size limits and redaction.')
    expect(checklist).toContain('- Macro execution disabled or not triggered.')
    expect(checklist).toContain('- External links are not refreshed.')
    expect(checklist).toContain('- Network is disabled or blocked according to policy.')
    expect(checklist).toContain('- Embedded object execution is disabled.')
    expect(checklist).toContain('- Temporary profile cleanup occurs on success and failure.')
    expect(checklist).toContain('- Sandbox input/output/work dirs are cleaned up.')
    expect(checklist).toContain('- Process timeout kills child process tree.')
    expect(checklist).toContain('- Logs do not include sensitive absolute paths.')
    expect(checklist).toContain('Production approval must not proceed until runtime security evidence proves the manifest policy and actual LibreOffice process invocation agree')
    expect(checklist).toContain('If any of these controls are only declared in manifest metadata rather than enforced by invocation or sandbox policy')
    expect(checklist).toContain('| Legal/license/provenance | Owner/legal | Blocked |')
    expect(checklist).toContain('## 4. Package Signing And Trust Checklist')
    expect(checklist).toContain('| Signing/trust |')
    expect(checklist).toContain('| Production acquisition |')
    expect(checklist).toContain('| Windows path-depth |')
  })

  it('locks current runtime security seams to manifest policy, sandboxed invocation, redaction, timeout, and cleanup evidence', () => {
    const runtimeGate = readRepoFile('infra', 'files', 'dfcManagedLibreOfficeRuntime.ts')
    const adapter = readRepoFile('infra', 'files', 'dfcLibreOfficePdfAdapter.ts')
    const adapterTest = readRepoFile('infra', 'files', 'dfcLibreOfficePdfAdapter.test.ts')

    expect(runtimeGate).toContain('requiredSecurityPolicy')
    expect(runtimeGate).toContain("'macrosDisabled'")
    expect(runtimeGate).toContain("'networkDisabled'")
    expect(runtimeGate).toContain("'externalLinksDisabled'")
    expect(runtimeGate).toContain("'embeddedObjectExecutionDisabled'")
    expect(runtimeGate).toContain("'isolatedProfileRequired'")
    expect(runtimeGate).toContain('policy?.macrosDisabled === true')
    expect(runtimeGate).toContain('policy.networkDisabled === true')
    expect(runtimeGate).toContain('policy.externalLinksDisabled === true')
    expect(runtimeGate).toContain('policy.embeddedObjectExecutionDisabled === true')
    expect(runtimeGate).toContain('policy.isolatedProfileRequired === true')

    expect(adapter).toContain("sourceExtension: 'docx'")
    expect(adapter).toContain('const profileDir = path.join(plan.request.workingDir, \'libreoffice-profile\')')
    expect(adapter).toContain('env: {} as NodeJS.ProcessEnv')
    expect(adapter).toContain('maxStdoutBytes: processPolicy.policy.maxStdoutBytes')
    expect(adapter).toContain('maxStderrBytes: processPolicy.policy.maxStderrBytes')
    expect(adapter).toContain('terminationGraceMs: processPolicy.policy.terminationGraceMs')
    expect(adapter).toContain('shell: false')
    expect(adapter).toContain('allowBatchEntrypoint: false')
    expect(adapter).toContain('`-env:UserInstallation=${pathToFileURL(input.profileDir).href}`')
    expect(adapter).toContain('sanitizeDfcSandboxDiagnostic')
    expect(adapter).toContain("buildDiagnostic('office_pdf_process_timeout'")
    expect(adapter).toContain('rm(sandboxRootDir, { recursive: true, force: true })')

    expect(adapterTest).toContain('fails closed for fake process failure and timeout with sanitized diagnostics')
    expect(adapterTest).toContain('attempts sandbox cleanup after fake success and fake failure when requested')
    expect(adapterTest).toContain('builds args without shell fragments and with an isolated profile descriptor')
    expect(adapterTest).toContain('expect(serialized).not.toContain')
    expect(adapterTest).toContain("expect(recordedProcessInput).toMatchObject")
    expect(adapterTest).toContain('expect(args.some((arg) => arg.startsWith(\'-env:UserInstallation=file:\'))).toBe(true)')
  })
})
