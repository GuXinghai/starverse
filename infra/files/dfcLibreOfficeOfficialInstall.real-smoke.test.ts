import { spawn } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { PackageDownloadTransport } from '../../src/next/plugin-distribution/packageDownloader'
import { ensureEnginePluginRegistrySchema } from '../db/migrations/ensureEnginePluginRegistrySchema'
import { EnginePluginRegistryRepo } from '../db/repo/enginePluginRegistryRepo'
import { EnginePluginLifecycleService } from './enginePluginLifecycleService'
import {
  DFC_OFFICE_PDF_ENGINE_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  getDfcLibreOfficeFirstPartyRuntimeCatalogEntry,
  getDfcLibreOfficeManagedRuntimeRoot,
  resolveDfcLibreOfficePluginManagedRuntimeHandle,
} from './dfcManagedLibreOfficeRuntime'
import { readFileSync } from 'node:fs'

const RUN_FLAG = 'STARVERSE_DFC_LIBREOFFICE_OFFICIAL_INSTALL_SMOKE'
const APP_ROOT_ENV = 'STARVERSE_DFC_LIBREOFFICE_OFFICIAL_INSTALL_APP_ROOT'
const SVPKG_OUT_ENV = 'STARVERSE_DFC_LIBREOFFICE_OFFICIAL_INSTALL_SVPKG_OUT'
const runRealSmoke = process.env[RUN_FLAG] === '1' ? it : it.skip

describe('DFC M45 LibreOffice official install operation real smoke', () => {
  runRealSmoke('downloads the fixed GitHub asset through install_official_plugin and activates the runtime', async () => {
    const appRoot = resolveRepoExternalPath(
      process.env[APP_ROOT_ENV],
      path.join(os.tmpdir(), 'm45lo-app')
    )
    const svpkgOut = resolveRepoExternalPath(
      process.env[SVPKG_OUT_ENV],
      path.join(os.tmpdir(), 'm45lo-official-download', 'libreoffice.svpkg')
    )
    const activeRuntimeRoot = getDfcLibreOfficeManagedRuntimeRoot(appRoot)
    const catalog = getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
    const fetchEvents: string[] = []
    const transportDiagnostics: string[] = []
    const transport: PackageDownloadTransport = {
      async fetchPackage(request) {
        fetchEvents.push('downloading')
        const downloaded = await downloadWithCurl(request.transportRef, svpkgOut, request.signal)
        if (!downloaded.ok) {
          transportDiagnostics.push(`${downloaded.code}:${downloaded.detail ?? 'none'}`)
          return downloaded
        }
        const bytes = await readFile(svpkgOut)
        transportDiagnostics.push(`downloaded:${bytes.byteLength}`)
        if (bytes.byteLength > request.maxBytes) {
          return { ok: false, code: 'too_large', finalRef: request.transportRef }
        }
        return { ok: true, bytes: new Uint8Array(bytes), finalRef: request.transportRef }
      },
    }
    const db = new BetterSqlite3(':memory:')
    try {
      db.exec(readFileSync(path.resolve(process.cwd(), 'infra', 'db', 'schema.sql'), 'utf8'))
      ensureEnginePluginRegistrySchema(db)
      await rm(appRoot, { recursive: true, force: true })
      const repo = new EnginePluginRegistryRepo(db)
      const service = new EnginePluginLifecycleService({
        registryRepo: repo,
        trustedRoots: {},
        trustedRootSource: 'official',
        resolveInstallPluginDir: ({ installRef }) => path.join(appRoot, 'plugins', installRef),
        dfcLibreOfficeAppManagedRootDir: appRoot,
        officialPackageTransport: transport,
      })

      await service.listOfficialPlugins()
      service.getInstalledPlugins()
      service.getInstallOperationStatus({ pluginId: DFC_OFFICE_PDF_ENGINE_ID, pluginVersion: catalog.pluginVersion })
      expect(fetchEvents).toEqual([])

      const started = await service.installOfficialPlugin({
        pluginId: DFC_OFFICE_PDF_ENGINE_ID,
        pluginVersion: catalog.pluginVersion,
        enabled: false,
      })
      expect(started.ok).toBe(true)
      if (!started.ok) throw new Error('LibreOffice official install did not start.')
      const completed = await waitForInstallOperation(service, started.value.operationId)
      if (completed.state !== 'installed') {
        throw new Error(JSON.stringify({
          state: completed.state,
          failureReason: completed.failureReason,
          diagnosticCode: completed.diagnosticCode,
          stateHistory: completed.stateHistory,
          transportDiagnostics,
        }))
      }
      expect(completed.state).toBe('installed')
      expect(completed.pluginId).toBe(DFC_OFFICE_PDF_ENGINE_ID)
      expect(completed.installedEngineId).toBe(DFC_OFFICE_PDF_ENGINE_ID)
      expect(completed.result).toMatchObject({
        engineId: DFC_OFFICE_PDF_ENGINE_ID,
        installState: 'installed',
      })
      expect(completed.stateHistory).toEqual(expect.arrayContaining([
        'accepted',
        'pending',
        'downloading',
        'verifying',
        'staging',
        'registering',
        'health_checking',
        'installed',
      ]))
      expect(fetchEvents).toEqual(['downloading'])

      const installed = service.getInstalledPlugins().find((entry) => entry.engineId === DFC_OFFICE_PDF_ENGINE_ID)
      expect(installed).toMatchObject({
        engineId: DFC_OFFICE_PDF_ENGINE_ID,
        installState: 'installed',
        productGate: expect.objectContaining({
          productionApproved: true,
          ownerGated: false,
          experimental: false,
          downloadEnabled: false,
          approvedPlatform: 'win32',
          approvedArch: 'x64',
          approvedInput: 'docx',
          approvedOutput: 'pdf_attachment',
          approvedAcquisitionModes: ['manual_github_release', 'offline_import'],
          automaticDownloadEnabled: false,
          postinstallDownloadEnabled: false,
          conversionTimeDownloadEnabled: false,
          ownerGatedCandidateReadiness: 'owner_gated_hash_pinned_ready',
        }),
      })
      const runtime = await resolveDfcLibreOfficePluginManagedRuntimeHandle({
        managedRuntimeRootDir: activeRuntimeRoot,
        capabilityId: 'docx_to_pdf',
        allowExperimental: true,
        productionOnly: false,
      })
      expect(runtime.ok).toBe(true)
      if (!runtime.ok) throw new Error('Installed LibreOffice runtime handle is unavailable.')
      expect(runtime.handle.runtimeId).toBe(DFC_OFFICE_PDF_RUNTIME_ID)
      expect(runtime.handle.capabilityId).toBe('docx_to_pdf')

      const evidence = {
        type: 'dfc-m45-official-install-smoke',
        operation: {
          states: completed.stateHistory,
          terminalState: completed.state,
        },
        source: {
          sourceKind: catalog.acquisitionSource.sourceKind,
          asset: 'fixed_github_release_asset',
          sizeMatched: true,
          hashMatched: true,
        },
        activation: {
          activeRuntimeRootLength: activeRuntimeRoot.length,
          runtimeIdentity: 'validated',
          executableIdentity: 'validated',
          capabilities: ['office_to_pdf', 'docx_to_pdf'],
          productionApproved: installed?.productGate?.productionApproved === true ? 'true' : 'false',
          downloadEnabled: installed?.productGate?.downloadEnabled === true ? 'true' : 'false',
        },
        noAutoDownload: {
          statusReadBeforeInstall: 'no_download',
          explicitInstallOperation: 'download_started',
        },
        packageCapture: {
          repoExternalSvpkg: 'captured_for_packaged_smoke',
        },
      }
      const serialized = JSON.stringify(evidence)
      expect(serialized).not.toMatch(/[A-Za-z]:\\|file:\/\/|soffice\.exe|contentToken|storageRef|[a-f0-9]{64}/iu)
      console.log(JSON.stringify(evidence))
    } finally {
      db.close()
    }
  }, 30 * 60 * 1000)
})

async function waitForInstallOperation(
  service: EnginePluginLifecycleService,
  operationId: string
) {
  const deadline = Date.now() + 25 * 60 * 1000
  while (Date.now() < deadline) {
    const status = service.getInstallOperationStatus({ operationId })
    if (status.ok && status.value && (status.value.state === 'installed' || status.value.state === 'failed' || status.value.state === 'cancelled')) {
      return status.value
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('LibreOffice official install operation did not reach a terminal state.')
}

function resolveRepoExternalPath(input: string | undefined, fallback: string): string {
  const candidate = path.resolve(String(input ?? '').trim() || fallback)
  const relative = path.relative(process.cwd(), candidate)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('M45 official install smoke path must be repo-external.')
  }
  return candidate
}

async function downloadWithCurl(
  url: string,
  outputPath: string,
  signal: AbortSignal | undefined
): Promise<
  | { ok: true }
  | { ok: false; code: 'cancelled' | 'download_failed' | 'redirect_rejected' | 'too_large'; detail?: string; finalRef?: string }
> {
  if (signal?.aborted) return { ok: false, code: 'cancelled', detail: 'download_cancelled' }
  await mkdir(path.dirname(outputPath), { recursive: true })
  return await new Promise((resolve) => {
    const child = spawn('curl', [
      '--location',
      '--fail',
      '--silent',
      '--show-error',
      '--retry',
      '2',
      '--connect-timeout',
      '30',
      '--output',
      outputPath,
      url,
    ], {
      windowsHide: true,
      stdio: 'ignore',
    })
    signal?.addEventListener('abort', () => {
      child.kill()
      resolve({ ok: false, code: 'cancelled', detail: 'download_cancelled', finalRef: url })
    }, { once: true })
    child.once('error', () => resolve({ ok: false, code: 'download_failed', detail: 'curl_start_failed', finalRef: url }))
    child.once('exit', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, code: 'download_failed', detail: `curl_${code ?? 'signal'}`, finalRef: url })
    })
  })
}
