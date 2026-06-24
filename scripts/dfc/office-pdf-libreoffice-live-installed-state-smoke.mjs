#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'
import { preflightLibreOfficeSvpkg } from './libreoffice-svpkg-preflight.mjs'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const port = Number.parseInt(process.env.SV_M47_LIVE_SMOKE_PORT ?? '5179', 10)
const host = process.env.SV_M47_LIVE_SMOKE_HOST ?? '127.0.0.1'
const viteUrl = `http://${host}:${port}/`
const appUrl = `${viteUrl}?sv-electron-smoke-dfc=1`
const mainPath = path.join(repoRoot, 'dist-electron', 'main.js')
const viteConfigPath = path.join(repoRoot, 'scripts', 'smoke', 'vite.renderer-smoke.config.ts')
const tmpRoot = path.join(os.tmpdir(), `svm47-live-lo-${process.pid}`)
const docxFixturePath = path.join(tmpRoot, 'm47-live-docx-pdf-smoke.docx')
const installTimeoutMs = Number.parseInt(process.env.SV_M47_LIVE_SMOKE_INSTALL_TIMEOUT_MS ?? String(30 * 60 * 1000), 10)
const installIdleTimeoutMs = Number.parseInt(process.env.SV_M47_LIVE_SMOKE_INSTALL_IDLE_TIMEOUT_MS ?? String(10 * 60 * 1000), 10)
const installedStateOnly = process.env.SV_M48_INSTALLED_STATE_ONLY === '1'
const proxyDiagnosticOnly = process.env.SV_M57_PROXY_DIAGNOSTIC_ONLY === '1'
const dualProxyProbeOnly = process.env.SV_M58_DUAL_PROXY_PROBE === '1'
const systemRouteRealInstall = process.env.SV_M59_SYSTEM_ROUTE_REAL_INSTALL === '1'
const m53AssetBodyInterceptEnabled = process.env.STARVERSE_DFC_M53_OFFICIAL_ASSET_BODY_INTERCEPT === '1'
const m53AssetBodyInterceptSvpkg = process.env.STARVERSE_DFC_M53_OFFICIAL_ASSET_BODY_SVPKG ?? ''

const disallowedLibreOfficeEnv = [
  'STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG',
  'STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG',
  'STARVERSE_DFC_LIBREOFFICE_REAL_SVPKG',
  'STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_EXE',
  'STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_USER_DATA',
  'STARVERSE_DFC_LIBREOFFICE_PACKAGED_APP_ROOT',
  'STARVERSE_DFC_LIBREOFFICE_RUNTIME_ROOT',
  'STARVERSE_DFC_LIBREOFFICE_SOURCE_RUNTIME_ROOT',
  'STARVERSE_DFC_LIBREOFFICE_IMPORT_APP_ROOT',
  'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SHORT_RUNTIME_ROOT',
  'STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_DEEP_RUNTIME_ROOT',
]

async function main() {
  const presentDisallowedEnv = disallowedLibreOfficeEnv.filter((name) => String(process.env[name] ?? '').trim())
  if (presentDisallowedEnv.length > 0) {
    fail(`M47 live smoke forbids external LibreOffice env injection: ${presentDisallowedEnv.join(', ')}`)
  }
  if (!(await pathExists(mainPath))) fail('M47 live smoke requires built Electron main output.')
  if (!(await pathExists(viteConfigPath))) fail('M47 live smoke renderer config is missing.')

  await mkdir(tmpRoot, { recursive: true })
  await writeFile(docxFixturePath, createMinimalDocxBuffer())

  const vite = spawnVite()
  let electronApp = null
  let page = null
  const rendererDiagnostics = createRendererDiagnostics()
  let restoreNetworkProxySettings = null
  let evidence = {
    type: dualProxyProbeOnly
      ? 'dfc-m58-dual-proxy-path-probe'
      : proxyDiagnosticOnly
      ? 'dfc-m57-proxy-aware-libreoffice-app-path-diagnostic'
      : systemRouteRealInstall
      ? 'dfc-m59-electron-net-system-real-install-and-live-docx'
      : 'dfc-m57-proxy-aware-real-install-and-live-docx-verification',
    appMode: 'dev_electron_live_user_data',
    externalSvpkgPathInjection: 'not_used',
    externalRuntimePathInjection: 'not_used',
    networkProxy: {
      proxyMode: 'unknown',
      manualProxyConfigured: false,
      environmentProxyAvailable: false,
      systemModeUnsupportedSelected: false,
      diagnosticAttempted: false,
      metadataReachable: false,
      assetFound: false,
      headPassed: false,
      contentLength: 'unavailable',
      redirectHostAllowed: false,
      rangePassed: false,
      terminalDiagnostic: null,
    },
    proxyRoutes: {
      manual: {
        attempted: false,
        configured: false,
        classification: 'not_run',
        metadataReachable: false,
        assetFound: false,
        headPassed: false,
        contentLength: 'unavailable',
        redirectHostAllowed: false,
        rangePassed: false,
        terminalDiagnostic: null,
      },
      system: {
        attempted: false,
        classification: 'not_run',
        metadataReachable: false,
        assetFound: false,
        headPassed: false,
        contentLength: 'unavailable',
        redirectHostAllowed: false,
        rangePassed: false,
        terminalDiagnostic: null,
      },
      selectedM59Route: 'none',
      finalClassification: 'unresolved',
      settingsRestored: false,
    },
    runtime: {
      initialStatusClass: 'unknown',
      finalStatusClass: 'unknown',
      reusedExistingRuntime: false,
      oneTimeInstallAttempted: false,
      downloadAttempted: false,
      operationStates: [],
      diagnosticCode: null,
      productionApproved: false,
      approvedPlatform: null,
      approvedArch: null,
      approvedRoute: null,
      automaticDownloadEnabled: null,
      conversionTimeDownloadEnabled: null,
      sourceKind: null,
      packageVersion: null,
      runtimeVersion: null,
      operationStatusDiagnostic: null,
    },
    pluginManagement: {
      visible: false,
      statusReadDidNotStartDownload: false,
      openingPanelDidNotStartDownload: false,
      recheckAttempted: false,
      recheckDidNotStartDownload: null,
      uiWordingVerified: false,
      noSensitiveUiTextDetected: false,
    },
    docxWorkflow: {
      attempted: false,
      result: 'not_run',
      targetKind: null,
      derivedKind: null,
      sendStrategy: null,
      assetRefKind: null,
      preview: null,
      availableTargets: [],
      pdfValidation: null,
      diagnosticCode: null,
    },
    noSilentFallback: 'not_run',
    negativeState: 'destructive_checks_skipped',
    privacy: {
      rawPathLeakDetected: false,
      sensitiveEvidenceLeakDetected: false,
    },
    harnessAssetBodyIntercept: await readHarnessAssetBodyInterceptPreflight(),
  }

  try {
    await waitForHttp(viteUrl, 30_000)
    const electronExecutable = require('electron')
    electronApp = await electron.launch({
      executablePath: electronExecutable,
      args: [mainPath],
      cwd: repoRoot,
      env: buildElectronEnv(),
      timeout: 90_000,
    })
    installElectronDiagnostics(electronApp, rendererDiagnostics)
    page = await waitForAppWindow(electronApp, 90_000)
    await waitForMountedApp(page, 120_000)
    await page.waitForFunction(
      () => typeof window.__starverseElectronSmokeSeedDocxPdfAttachment === 'function',
      undefined,
      { timeout: 90_000 },
    )

    const initial = await readLibreOfficeState(page)
    const initialSummary = summarizeLibreOfficeState(initial)
    evidence.runtime = { ...evidence.runtime, ...initialSummary, initialStatusClass: initialSummary.statusClass }
    evidence.pluginManagement.statusReadDidNotStartDownload = !hasActiveLibreOfficeOperation(initial.operation)
    evidence.networkProxy = {
      ...evidence.networkProxy,
      ...(await readNetworkProxyPreflight(page)),
    }
    if (systemRouteRealInstall) {
      restoreNetworkProxySettings = await selectSystemProxyRouteForM59(page)
      evidence.networkProxy = {
        ...evidence.networkProxy,
        proxyMode: 'system',
        systemModeUnsupportedSelected: false,
      }
    }
    if (dualProxyProbeOnly) {
      evidence.proxyRoutes = await runDualProxyProbe(page)
      evidence.runtime.finalStatusClass = initialSummary.statusClass
      await openPluginManagementPanel(page)
      const afterOpen = await readLibreOfficeState(page)
      evidence.pluginManagement.visible = await pluginPanelHasLibreOffice(page)
      evidence.pluginManagement.openingPanelDidNotStartDownload = !hasActiveLibreOfficeOperation(afterOpen.operation)
      evidence.pluginManagement.noSensitiveUiTextDetected = !(await pageBodyHasSensitiveEvidence(page))
      evidence.docxWorkflow.result = 'not_run_dual_proxy_probe_only'
      evidence.noSilentFallback = 'not_run_dual_proxy_probe_only'
      printEvidence(evidence)
      return
    }
    const proxyDiagnostic = systemRouteRealInstall
      ? await runLibreOfficeSystemProxyDiagnostic(page)
      : await runLibreOfficeProxyDiagnostic(page)
    evidence.networkProxy = {
      ...evidence.networkProxy,
      ...proxyDiagnostic,
      diagnosticAttempted: true,
    }
    if (installedStateOnly && initialSummary.statusClass !== 'ready') {
      evidence.runtime.finalStatusClass = initialSummary.statusClass
      evidence.docxWorkflow.result = 'not_run_installed_state_only'
      evidence.noSilentFallback = 'not_run_installed_state_only'
      printEvidence(evidence)
      return
    }

    await openPluginManagementPanel(page)
    const afterOpen = await readLibreOfficeState(page)
    evidence.pluginManagement.visible = await pluginPanelHasLibreOffice(page)
    evidence.pluginManagement.openingPanelDidNotStartDownload = !hasActiveLibreOfficeOperation(afterOpen.operation)
    evidence.pluginManagement.uiWordingVerified = await verifyPluginManagementWording(page)
    evidence.pluginManagement.noSensitiveUiTextDetected = !(await pageBodyHasSensitiveEvidence(page))
    if (proxyDiagnosticOnly) {
      evidence.runtime.finalStatusClass = initialSummary.statusClass
      evidence.docxWorkflow.result = 'not_run_proxy_diagnostic_only'
      evidence.noSilentFallback = 'not_run_proxy_diagnostic_only'
      printEvidence(evidence)
      if (!proxyDiagnostic.ok) fail(`M57 app-path proxy diagnostic failed: ${proxyDiagnostic.terminalDiagnostic ?? 'proxy_probe_failed'}`)
      return
    }

    let readyState = afterOpen
    let readySummary = summarizeLibreOfficeState(readyState)
    if (readySummary.statusClass === 'ready') {
      evidence.runtime.reusedExistingRuntime = true
      if (await recheckLibreOffice(page)) {
        evidence.pluginManagement.recheckAttempted = true
        const afterRecheck = await readLibreOfficeState(page)
        evidence.pluginManagement.recheckDidNotStartDownload = !hasActiveLibreOfficeOperation(afterRecheck.operation)
        readyState = afterRecheck
        readySummary = summarizeLibreOfficeState(readyState)
      }
    } else if (readySummary.statusClass === 'missing') {
      if (!proxyDiagnostic.ok) {
        evidence.runtime.finalStatusClass = 'missing'
        evidence.docxWorkflow.result = 'not_run_proxy_diagnostic_failed'
        evidence.noSilentFallback = 'not_run_proxy_diagnostic_failed'
        printEvidence(evidence)
        fail(`${systemRouteRealInstall ? 'M59 system route' : 'M57 app-path'} proxy diagnostic failed before install: ${proxyDiagnostic.terminalDiagnostic ?? 'proxy_probe_failed'}`)
      }
      if (evidence.harnessAssetBodyIntercept.enabled && !evidence.harnessAssetBodyIntercept.preflightPassed) {
        evidence.runtime.finalStatusClass = 'missing'
        printEvidence(evidence)
        fail(`M53 harness asset body intercept preflight failed: ${evidence.harnessAssetBodyIntercept.diagnosticCode ?? 'intercept_preflight_failed'}`)
      }
      const missingAttempt = await assertMissingConversionDoesNotDownload(page)
      evidence.docxWorkflow = {
        ...evidence.docxWorkflow,
        attempted: true,
        result: 'blocked_missing_runtime',
        diagnosticCode: missingAttempt.diagnosticCode,
      }
      evidence.noSilentFallback = missingAttempt.noDownload ? 'missing_runtime_no_download_no_fallback' : 'failed'
      const installed = await installOfficialLibreOfficeOnce(page, readySummary.pluginVersion)
      evidence.runtime.oneTimeInstallAttempted = true
      evidence.runtime.downloadAttempted = installed.stateHistory.includes('downloading')
      evidence.runtime.operationStates = installed.stateHistory
      evidence.runtime.diagnosticCode = installed.diagnosticCode
      if (!installed.ok) {
        evidence.runtime.finalStatusClass = 'blocked'
        printEvidence(evidence)
        fail(`M47 one-time official install failed: ${installed.diagnosticCode ?? installed.failureReason ?? 'install_failed'}`)
      }
      readyState = await readLibreOfficeState(page)
      readySummary = summarizeLibreOfficeState(readyState)
    }

    evidence.runtime = {
      ...evidence.runtime,
      ...readySummary,
      initialStatusClass: evidence.runtime.initialStatusClass,
      finalStatusClass: readySummary.statusClass,
    }

    if (readySummary.statusClass !== 'ready') {
      printEvidence(evidence)
      fail(`M47 LibreOffice runtime is not ready: ${readySummary.diagnosticCode ?? readySummary.statusClass}`)
    }

    const docx = await runDocxWorkflow(page)
    evidence.docxWorkflow = docx
    evidence.noSilentFallback = docx.result === 'ready_pdf_attachment' &&
      docx.targetKind === 'pdf_attachment' &&
      docx.derivedKind === 'converted_pdf' &&
      docx.sendStrategy === 'file_attachment' &&
      docx.assetRefKind === 'derived_asset'
      ? 'passed'
      : 'failed'
    evidence.privacy.rawPathLeakDetected = await pageBodyHasSensitiveEvidence(page)
    evidence.privacy.sensitiveEvidenceLeakDetected = evidence.privacy.rawPathLeakDetected
    printEvidence(evidence)
    if (evidence.privacy.rawPathLeakDetected) fail('M47 live smoke detected sensitive UI text.')
    if (evidence.noSilentFallback !== 'passed') fail('M47 DOCX PDF workflow did not preserve selected-ref PDF semantics.')
  } catch (error) {
    const pageState = page ? await capturePageState(page).catch(() => null) : null
    process.stderr.write(`${JSON.stringify({
      type: 'dfc-m47-live-smoke-failure-diagnostics',
      appMode: evidence.appMode,
      pageState,
      consoleMessages: rendererDiagnostics.consoleMessages,
      pageErrors: rendererDiagnostics.pageErrors,
      error: sanitizeText(error instanceof Error ? error.message : String(error)).slice(0, 500),
    }, null, 2)}\n`)
    throw error
  } finally {
    if (restoreNetworkProxySettings) await restoreNetworkProxySettings().catch(() => undefined)
    if (electronApp) await closeElectronApp(electronApp)
    await closeVite(vite)
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function readHarnessAssetBodyInterceptPreflight() {
  const base = {
    enabled: m53AssetBodyInterceptEnabled,
    sourceClass: m53AssetBodyInterceptEnabled ? 'harness_local_equivalent_to_official_github_asset' : 'disabled',
    localPackageProvided: Boolean(String(m53AssetBodyInterceptSvpkg).trim()),
    preflightPassed: false,
    sizeClass: null,
    expectedSizeMatched: null,
    expectedHashMatched: null,
    diagnosticCode: m53AssetBodyInterceptEnabled ? 'not_run' : null,
  }
  if (!m53AssetBodyInterceptEnabled) return base
  const result = await preflightLibreOfficeSvpkg(m53AssetBodyInterceptSvpkg)
  return {
    ...base,
    preflightPassed: result.ok,
    sizeClass: result.evidence?.sizeClass ?? null,
    expectedSizeMatched: result.evidence?.expectedSizeMatched ?? null,
    expectedHashMatched: result.evidence?.expectedHashMatched ?? null,
    diagnosticCode: result.diagnosticCode,
  }
}

function createRendererDiagnostics() {
  const includeText = process.env.SV_M47_LIVE_SMOKE_INCLUDE_RENDERER_CONSOLE === '1'
  const consoleMessages = []
  const pageErrors = []
  const pushBounded = (target, value) => {
    target.push(value)
    if (target.length > 30) target.shift()
  }
  return {
    consoleMessages,
    pageErrors,
    attach(page) {
      page.on('console', (message) => {
        const text = sanitizeText(message.text())
        pushBounded(consoleMessages, {
          type: message.type(),
          textLength: text.length,
          text: includeText ? text.slice(0, 500) : '<renderer-console-text-redacted>',
        })
      })
      page.on('pageerror', (error) => {
        const message = sanitizeText(error?.message ?? String(error))
        pushBounded(pageErrors, {
          name: sanitizeText(error?.name ?? 'Error').slice(0, 120),
          messageLength: message.length,
          message: includeText ? message.slice(0, 500) : '<renderer-page-error-text-redacted>',
        })
      })
    },
  }
}

function installElectronDiagnostics(electronApp, diagnostics) {
  for (const openPage of electronApp.windows()) diagnostics.attach(openPage)
  electronApp.on('window', (openPage) => diagnostics.attach(openPage))
}

function buildElectronEnv() {
  const env = { ...process.env }
  for (const name of disallowedLibreOfficeEnv) delete env[name]
  return {
    ...env,
    NODE_ENV: 'development',
    VITE_DEV_SERVER_URL: appUrl,
    SV_ELECTRON_SMOKE: '1',
    STARVERSE_DB_WORKER_CALL_TIMEOUT_MS: process.env.STARVERSE_DB_WORKER_CALL_TIMEOUT_MS ?? String(3 * 60 * 1000),
    FORCE_COLOR: '0',
  }
}

function spawnVite() {
  const child = spawn(
    [
      'npx',
      'vite',
      '--config',
      quoteForShell(viteConfigPath),
      '--host',
      host,
      '--port',
      String(port),
      '--strictPort',
      '--logLevel',
      'info',
    ].join(' '),
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        FORCE_COLOR: '0',
      },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  pipeSanitized(child.stdout, process.stdout)
  pipeSanitized(child.stderr, process.stderr)
  return child
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }
  throw new Error(`renderer did not become ready: ${sanitizeText(lastError?.message ?? 'timeout')}`)
}

async function waitForAppWindow(electronApp, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      const diagnostics = await describePage(page)
      if (diagnostics.hasAppRoot && !diagnostics.url.startsWith('devtools://')) return page
    }
    try {
      const page = await electronApp.waitForEvent('window', { timeout: 1000 })
      const diagnostics = await describePage(page)
      if (diagnostics.hasAppRoot && !diagnostics.url.startsWith('devtools://')) return page
    } catch {
      await delay(250)
    }
  }
  throw new Error('app window did not become ready')
}

async function waitForMountedApp(page, timeoutMs) {
  await page.waitForSelector('#app', { state: 'attached', timeout: timeoutMs })
  await page.waitForFunction(
    () => {
      const appRoot = document.querySelector('#app')
      const composerDraft = document.querySelector('[data-testid="composer-draft"]')
      return Boolean(composerDraft || (appRoot && (appRoot.children.length > 0 || appRoot.textContent?.trim())))
    },
    undefined,
    { timeout: timeoutMs },
  )
}

async function describePage(page) {
  try {
    return await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      hasAppRoot: Boolean(document.querySelector('#app')),
    }))
  } catch {
    return { url: page.url(), title: '', hasAppRoot: false }
  }
}

async function capturePageState(page) {
  return await page.evaluate(() => {
    const appRoot = document.querySelector('#app')
    const selectors = [
      '#app',
      '[data-testid="composer-draft"]',
      '[data-testid="draft-attachment-card"]',
      '[data-testid^="draft-attachment-card-"]',
      '[data-testid="draft-attachment-details-dialog"]',
    ]
    return {
      urlProtocol: window.location.protocol,
      readyState: document.readyState,
      titleLength: document.title.length,
      bodyTextLength: document.body?.innerText?.length ?? 0,
      appRootPresent: Boolean(appRoot),
      appRootChildCount: appRoot?.children.length ?? 0,
      appRootHtmlLength: appRoot?.innerHTML?.length ?? 0,
      selectorPresence: selectors.map((selector) => ({
        selector,
        present: Boolean(document.querySelector(selector)),
      })),
    }
  })
}

async function openPluginManagementPanel(page) {
  await page.getByRole('button', { name: /^Settings$/u }).first().click({ timeout: 60_000 })
  await page.getByText('Plugin Management', { exact: true }).waitFor({ timeout: 60_000 })
  await page.getByText('LibreOffice Office PDF', { exact: false }).waitFor({ timeout: 60_000 })
}

async function pluginPanelHasLibreOffice(page) {
  return await page.evaluate(() => document.body.innerText.includes('LibreOffice Office PDF'))
}

async function verifyPluginManagementWording(page) {
  return await page.evaluate(() => {
    const text = document.body.innerText
    return [
      'Production approved',
      'Approved platform: win32 / x64',
      'Approved route: docx to pdf_attachment',
      'Automatic download: Disabled',
      'Conversion-time download: Disabled',
      'Downloads LibreOffice runtime package from GitHub',
      'User-initiated only',
      'Runtime scope: Windows x64 DOCX-to-PDF production approved when package gate is valid; macOS/Linux package pending',
      'Activation: Package is verified before activation',
    ].every((needle) => text.includes(needle))
  })
}

async function readLibreOfficeState(page) {
  return await page.evaluate(async () => {
    const official = await window.dbBridge.invoke('enginePluginLifecycle.listOfficialPlugins', undefined)
    const installed = await window.dbBridge.invoke('enginePluginLifecycle.listInstalledPlugins', undefined)
    const diagnostics = await window.dbBridge.invoke('enginePluginLifecycle.getDiagnosticsSummary', undefined)
    const officialEntry = official?.ok && Array.isArray(official.value)
      ? official.value.find((item) => item?.pluginId === 'libreoffice') ?? null
      : null
    const pluginVersion = officialEntry?.pluginVersion ?? '0.1.0'
    let operation = null
    let operationStatusDiagnostic = null
    try {
      operation = await window.dbBridge.invoke('enginePluginLifecycle.getInstallOperationStatus', {
        pluginId: 'libreoffice',
        pluginVersion,
      })
    } catch {
      operationStatusDiagnostic = 'install_operation_status_unavailable'
    }
    return {
      official,
      officialEntry,
      installed,
      diagnostics,
      operation: operation?.ok ? operation.value : null,
      operationStatusDiagnostic,
    }
  })
}

async function readNetworkProxyPreflight(page) {
  return await page.evaluate(async () => {
    const raw = await window.dbBridge.invoke('settings.getNetworkProxySettings', undefined)
    const value = raw?.ok === true ? raw.value : raw?.value ?? raw
    const proxyMode = typeof value?.proxyMode === 'string' ? value.proxyMode : 'environment'
    const manualProxyUrl = typeof value?.manualProxyUrl === 'string' ? value.manualProxyUrl : ''
    const env = globalThis.process?.env ?? {}
    return {
      proxyMode,
      manualProxyConfigured: manualProxyUrl.trim().length > 0,
      environmentProxyAvailable: Boolean(
        String(env.HTTPS_PROXY ?? '').trim() ||
        String(env.HTTP_PROXY ?? '').trim() ||
        String(env.https_proxy ?? '').trim() ||
        String(env.http_proxy ?? '').trim()
      ),
      systemModeUnsupportedSelected: proxyMode === 'system',
    }
  })
}

async function runLibreOfficeProxyDiagnostic(page) {
  const raw = await page.evaluate(async () => {
    return await window.dbBridge.invoke('enginePluginLifecycle.probeLibreOfficeOfficialDownloadNetwork', undefined)
  })
  const value = raw?.ok === true && raw.value ? raw.value : raw
  return {
    ok: value?.ok === true,
    proxyMode: sanitizeCode(value?.proxyMode ?? null) ?? 'unknown',
    metadataReachable: value?.metadataReachable === true,
    assetFound: value?.assetFound === true,
    headPassed: value?.headPassed === true,
    contentLength: value?.contentLength === 'match' || value?.contentLength === 'mismatch'
      ? value.contentLength
      : 'unavailable',
    redirectHostAllowed: value?.redirectHostAllowed === true,
    rangePassed: value?.rangePassed === true,
    terminalDiagnostic: sanitizeCode(value?.terminalDiagnostic ?? 'proxy_probe_failed'),
  }
}

async function runLibreOfficeSystemProxyDiagnostic(page) {
  const raw = await page.evaluate(async () => {
    if (!window.electronAPI?.probeLibreOfficeSystemProxyDownloadNetwork) {
      return {
        ok: false,
        proxyMode: 'system',
        metadataReachable: false,
        assetFound: false,
        headPassed: false,
        contentLength: 'unavailable',
        redirectHostAllowed: false,
        rangePassed: false,
        terminalDiagnostic: 'electron_net_transport_blocked',
      }
    }
    return await window.electronAPI.probeLibreOfficeSystemProxyDownloadNetwork()
  })
  const value = raw?.ok === true && raw.value ? raw.value : raw
  return {
    ok: value?.ok === true,
    proxyMode: 'system',
    metadataReachable: value?.metadataReachable === true,
    assetFound: value?.assetFound === true,
    headPassed: value?.headPassed === true,
    contentLength: value?.contentLength === 'match' || value?.contentLength === 'mismatch'
      ? value.contentLength
      : 'unavailable',
    redirectHostAllowed: value?.redirectHostAllowed === true,
    rangePassed: value?.rangePassed === true,
    terminalDiagnostic: sanitizeCode(value?.terminalDiagnostic ?? 'proxy_probe_failed'),
  }
}

async function selectSystemProxyRouteForM59(page) {
  const original = await page.evaluate(async () => {
    const raw = await window.dbBridge.invoke('settings.getNetworkProxySettings', undefined)
    const value = raw?.ok === true ? raw.value : raw?.value ?? raw
    const proxyMode = ['system', 'manual', 'environment', 'direct'].includes(value?.proxyMode) ? value.proxyMode : 'environment'
    return {
      proxyMode,
      manualProxyUrl: typeof value?.manualProxyUrl === 'string' ? value.manualProxyUrl : '',
      noProxy: typeof value?.noProxy === 'string' ? value.noProxy : '',
      strictSSL: value?.strictSSL === false ? false : true,
    }
  })
  await page.evaluate(async (settings) => {
    await window.dbBridge.invoke('settings.setNetworkProxySettings', { value: settings })
  }, {
    proxyMode: 'system',
    manualProxyUrl: '',
    noProxy: typeof original?.noProxy === 'string' ? original.noProxy : '',
    strictSSL: original?.strictSSL === false ? false : true,
  })
  return async () => {
    await page.evaluate(async (settings) => {
      await window.dbBridge.invoke('settings.setNetworkProxySettings', { value: settings })
    }, original)
  }
}

async function runDualProxyProbe(page) {
  const manualProxyUrl = process.env.SV_M58_MANUAL_PROXY_URL ?? ''
  const raw = await page.evaluate(async (candidateManualProxyUrl) => {
    const bridge = window.dbBridge
    const originalRaw = await bridge.invoke('settings.getNetworkProxySettings', undefined)
    const original = normalizeSettings(originalRaw?.ok === true ? originalRaw.value : originalRaw?.value ?? originalRaw)
    const route = {
      manual: {
        attempted: false,
        configured: false,
        classification: 'manual_proxy_missing',
        metadataReachable: false,
        assetFound: false,
        headPassed: false,
        contentLength: 'unavailable',
        redirectHostAllowed: false,
        rangePassed: false,
        terminalDiagnostic: null,
      },
      system: {
        attempted: false,
        classification: 'system_proxy_probe_failed',
        metadataReachable: false,
        assetFound: false,
        headPassed: false,
        contentLength: 'unavailable',
        redirectHostAllowed: false,
        rangePassed: false,
        terminalDiagnostic: null,
      },
      selectedM59Route: 'none',
      finalClassification: 'both_proxy_routes_failed',
      settingsRestored: false,
    }

    const manualProxyUrl = String(candidateManualProxyUrl || original.manualProxyUrl || '').trim()
    const useExistingManual = original.proxyMode === 'manual' && original.manualProxyUrl.trim().length > 0
    const shouldProbeManual = manualProxyUrl.length > 0 && (candidateManualProxyUrl || useExistingManual)

    try {
      if (shouldProbeManual) {
        route.manual.configured = true
        if (!isValidManualProxyUrl(manualProxyUrl)) {
          route.manual.classification = 'manual_proxy_invalid'
          route.manual.terminalDiagnostic = 'proxy_manual_failed'
        } else if (manualProxyUrlContainsCredentials(manualProxyUrl)) {
          route.manual.classification = 'manual_proxy_invalid'
          route.manual.terminalDiagnostic = 'proxy_auth_required'
        } else {
          route.manual.attempted = true
          await bridge.invoke('settings.setNetworkProxySettings', {
            value: {
              proxyMode: 'manual',
              manualProxyUrl,
              noProxy: original.noProxy,
              strictSSL: true,
            },
          })
          const manualProbe = normalizeProbeResult(
            await bridge.invoke('enginePluginLifecycle.probeLibreOfficeOfficialDownloadNetwork', undefined)
          )
          route.manual = {
            ...route.manual,
            ...stripProbe(manualProbe),
            classification: manualProbe.ok ? 'manual_proxy_probe_passed' : 'manual_proxy_probe_failed',
          }
        }
      }

      route.system.attempted = true
      await bridge.invoke('settings.setNetworkProxySettings', {
        value: {
          proxyMode: 'system',
          manualProxyUrl: '',
          noProxy: original.noProxy,
          strictSSL: true,
        },
      })
      if (!window.electronAPI?.probeLibreOfficeSystemProxyDownloadNetwork) {
        route.system.classification = 'electron_net_transport_blocked'
        route.system.terminalDiagnostic = 'electron_net_transport_blocked'
      } else {
        const systemProbe = normalizeProbeResult(await window.electronAPI.probeLibreOfficeSystemProxyDownloadNetwork())
        route.system = {
          ...route.system,
          ...stripProbe(systemProbe),
          classification: systemProbe.ok ? 'system_proxy_probe_passed' : 'system_proxy_probe_failed',
        }
      }
    } finally {
      await bridge.invoke('settings.setNetworkProxySettings', { value: original }).catch(() => undefined)
      route.settingsRestored = true
    }

    const manualPassed = route.manual.classification === 'manual_proxy_probe_passed'
    const systemPassed = route.system.classification === 'system_proxy_probe_passed'
    if (manualPassed && systemPassed) {
      route.selectedM59Route = 'system'
      route.finalClassification = 'both_proxy_routes_passed_system_preferred'
    } else if (systemPassed) {
      route.selectedM59Route = 'system'
      route.finalClassification = 'system_proxy_probe_passed_retry_available'
    } else if (manualPassed) {
      route.selectedM59Route = 'manual'
      route.finalClassification = 'manual_proxy_probe_passed_retry_available'
    } else if (route.system.classification === 'electron_net_transport_blocked' && route.manual.classification === 'manual_proxy_missing') {
      route.finalClassification = 'system_blocked_manual_missing'
    } else {
      route.finalClassification = 'both_proxy_routes_failed'
    }
    return route

    function normalizeSettings(value) {
      const raw = value && typeof value === 'object' ? value : {}
      const proxyMode = ['system', 'manual', 'environment', 'direct'].includes(raw.proxyMode) ? raw.proxyMode : 'environment'
      return {
        proxyMode,
        manualProxyUrl: typeof raw.manualProxyUrl === 'string' ? raw.manualProxyUrl : '',
        noProxy: typeof raw.noProxy === 'string' ? raw.noProxy : '',
        strictSSL: raw.strictSSL === false ? false : true,
      }
    }

    function normalizeProbeResult(raw) {
      const value = raw?.ok === true && raw.value ? raw.value : raw
      return {
        ok: value?.ok === true,
        metadataReachable: value?.metadataReachable === true,
        assetFound: value?.assetFound === true,
        headPassed: value?.headPassed === true,
        contentLength: value?.contentLength === 'match' || value?.contentLength === 'mismatch'
          ? value.contentLength
          : 'unavailable',
        redirectHostAllowed: value?.redirectHostAllowed === true,
        rangePassed: value?.rangePassed === true,
        terminalDiagnostic: sanitizeCodeInPage(value?.terminalDiagnostic ?? 'proxy_probe_failed'),
      }
    }

    function stripProbe(value) {
      return {
        metadataReachable: value.metadataReachable,
        assetFound: value.assetFound,
        headPassed: value.headPassed,
        contentLength: value.contentLength,
        redirectHostAllowed: value.redirectHostAllowed,
        rangePassed: value.rangePassed,
        terminalDiagnostic: value.terminalDiagnostic,
      }
    }

    function isValidManualProxyUrl(value) {
      try {
        const parsed = new URL(value)
        return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        return false
      }
    }

    function manualProxyUrlContainsCredentials(value) {
      try {
        const parsed = new URL(value)
        return Boolean(parsed.username || parsed.password)
      } catch {
        return /:\/\/[^/@\s:]+:[^/@\s]+@/u.test(String(value ?? ''))
      }
    }

    function sanitizeCodeInPage(value) {
      const text = String(value ?? '').trim()
      return /^[a-z0-9_:-]{1,120}$/iu.test(text) ? text : 'proxy_probe_failed'
    }
  }, manualProxyUrl)

  return {
    manual: {
      attempted: raw?.manual?.attempted === true,
      configured: raw?.manual?.configured === true,
      classification: sanitizeCode(raw?.manual?.classification ?? 'manual_proxy_probe_failed'),
      metadataReachable: raw?.manual?.metadataReachable === true,
      assetFound: raw?.manual?.assetFound === true,
      headPassed: raw?.manual?.headPassed === true,
      contentLength: raw?.manual?.contentLength === 'match' || raw?.manual?.contentLength === 'mismatch'
        ? raw.manual.contentLength
        : 'unavailable',
      redirectHostAllowed: raw?.manual?.redirectHostAllowed === true,
      rangePassed: raw?.manual?.rangePassed === true,
      terminalDiagnostic: sanitizeCode(raw?.manual?.terminalDiagnostic ?? null),
    },
    system: {
      attempted: raw?.system?.attempted === true,
      classification: sanitizeCode(raw?.system?.classification ?? 'system_proxy_probe_failed'),
      metadataReachable: raw?.system?.metadataReachable === true,
      assetFound: raw?.system?.assetFound === true,
      headPassed: raw?.system?.headPassed === true,
      contentLength: raw?.system?.contentLength === 'match' || raw?.system?.contentLength === 'mismatch'
        ? raw.system.contentLength
        : 'unavailable',
      redirectHostAllowed: raw?.system?.redirectHostAllowed === true,
      rangePassed: raw?.system?.rangePassed === true,
      terminalDiagnostic: sanitizeCode(raw?.system?.terminalDiagnostic ?? null),
    },
    selectedM59Route: sanitizeCode(raw?.selectedM59Route ?? 'none') ?? 'none',
    finalClassification: sanitizeCode(raw?.finalClassification ?? 'both_proxy_routes_failed') ?? 'both_proxy_routes_failed',
    settingsRestored: raw?.settingsRestored === true,
  }
}

function summarizeLibreOfficeState(state) {
  const installed = Array.isArray(state.installed)
    ? state.installed.find((item) => item?.engineId === 'libreoffice') ?? null
    : null
  const diagnosticEntry = Array.isArray(state.diagnostics?.engines)
    ? state.diagnostics.engines.find((item) => item?.engineId === 'libreoffice') ?? null
    : null
  const gate = installed?.productGate ?? diagnosticEntry?.productGate ?? null
  const installedState = installed?.installState ?? (diagnosticEntry?.installed ? 'installed' : 'missing')
  const enabled = installed?.enabled ?? diagnosticEntry?.enabled ?? false
  const productStatus = gate?.status ?? 'missing'
  const diagnosticCode = gate?.productCode ?? gate?.internalCode ?? installed?.failureReason ?? diagnosticEntry?.failureReason ?? null
  let statusClass = 'blocked'
  if (installedState !== 'installed' && productStatus === 'missing') statusClass = 'missing'
  else if (installedState === 'installed' && enabled && gate?.productionApproved === true && productStatus === 'available') statusClass = 'ready'
  else if (productStatus === 'quarantined') statusClass = 'quarantined'
  else if (!enabled && installedState === 'installed') statusClass = 'disabled'
  else if (productStatus === 'blocked') statusClass = 'blocked'
  else if (productStatus === 'unhealthy') statusClass = 'invalid'

  return {
    statusClass,
    pluginVersion: state.officialEntry?.pluginVersion ?? installed?.pluginVersion ?? '0.1.0',
    diagnosticCode: sanitizeCode(diagnosticCode),
    productionApproved: gate?.productionApproved === true,
    approvedPlatform: gate?.approvedPlatform ?? null,
    approvedArch: gate?.approvedArch ?? null,
    approvedRoute: gate?.approvedInput && gate?.approvedOutput ? `${gate.approvedInput}->${gate.approvedOutput}` : null,
    automaticDownloadEnabled: gate?.automaticDownloadEnabled ?? null,
    conversionTimeDownloadEnabled: gate?.conversionTimeDownloadEnabled ?? null,
    sourceKind: gate?.source ?? installed?.installSource ?? null,
    packageVersion: installed?.packageVersion ?? null,
    runtimeVersion: installed?.runtimeVersion ?? null,
    operationStatusDiagnostic: sanitizeCode(state.operationStatusDiagnostic ?? null),
  }
}

async function recheckLibreOffice(page) {
  const result = await page.evaluate(async () => {
    return await window.dbBridge.invoke('enginePluginLifecycle.runHealthCheck', { engineId: 'libreoffice' })
  })
  return result?.ok === true
}

async function assertMissingConversionDoesNotDownload(page) {
  let diagnosticCode = null
  try {
    await page.evaluate(async (filePath) => {
      const seed = window.__starverseElectronSmokeSeedDocxPdfAttachment
      if (typeof seed !== 'function') throw new Error('DOCX smoke seeder is missing')
      return await seed(filePath)
    }, docxFixturePath)
  } catch (error) {
    diagnosticCode = sanitizeCode(extractDiagnosticFromError(error))
  }
  const after = await readLibreOfficeState(page)
  return {
    diagnosticCode: diagnosticCode ?? 'office_pdf_runtime_missing',
    noDownload: !hasActiveLibreOfficeOperation(after.operation),
  }
}

async function installOfficialLibreOfficeOnce(page, pluginVersion) {
  const started = await page.evaluate(async (version) => {
    return await window.dbBridge.invoke('enginePluginLifecycle.installOfficialPlugin', {
      pluginId: 'libreoffice',
      pluginVersion: version,
      enabled: false,
    })
  }, pluginVersion ?? '0.1.0')
  if (!started?.ok) {
    return {
      ok: false,
      stateHistory: [],
      failureReason: sanitizeCode(started?.reason ?? 'install_failed'),
      diagnosticCode: sanitizeCode(started?.reason ?? 'install_failed'),
    }
  }
  const operationId = started.value.operationId
  const deadline = Date.now() + installTimeoutMs
  let latest = started.value
  let pollDiagnostic = null
  let lastProgressKey = ''
  let lastProgressAt = Date.now()
  emitInstallProgress(latest)
  while (Date.now() < deadline) {
    try {
      latest = await page.evaluate(async (id) => {
        const result = await window.dbBridge.invoke('enginePluginLifecycle.getInstallOperationStatus', { operationId: id })
        return result?.ok ? result.value : null
      }, operationId)
    } catch {
      pollDiagnostic = 'install_operation_status_timeout'
      break
    }
    const progressKey = latest ? `${latest.state}:${latest.diagnosticCode ?? latest.failureReason ?? ''}:${latest.progressSummary ?? ''}` : 'null'
    if (progressKey !== lastProgressKey) {
      emitInstallProgress(latest)
      lastProgressKey = progressKey
      lastProgressAt = Date.now()
    }
    if (latest && ['installed', 'failed', 'cancelled', 'stale', 'paused_retryable'].includes(latest.state)) break
    if (Date.now() - lastProgressAt > installIdleTimeoutMs) {
      pollDiagnostic = latest?.state === 'staging'
        ? 'install_staging_timeout'
        : latest?.state === 'registering' || latest?.state === 'health_checking'
          ? 'install_activation_timeout'
          : 'install_operation_timeout'
      break
    }
    await delay(1000)
  }
  if (!pollDiagnostic && latest?.state && !['installed', 'failed', 'cancelled', 'stale', 'paused_retryable'].includes(latest.state)) {
    pollDiagnostic = latest.state === 'staging'
      ? 'install_staging_timeout'
      : latest.state === 'registering' || latest.state === 'health_checking'
        ? 'install_activation_timeout'
        : 'install_operation_timeout'
  }
  const history = Array.isArray(latest?.stateHistory) ? latest.stateHistory.filter((state) => typeof state === 'string') : []
  return {
    ok: !pollDiagnostic && latest?.state === 'installed',
    stateHistory: history,
    failureReason: sanitizeCode(latest?.failureReason ?? null),
    diagnosticCode: sanitizeCode(pollDiagnostic ?? latest?.diagnosticCode ?? latest?.failureReason ?? null),
  }
}

function emitInstallProgress(operation) {
  if (!operation) return
  const history = Array.isArray(operation.stateHistory) ? operation.stateHistory.filter((state) => typeof state === 'string') : []
  process.stdout.write(`${JSON.stringify({
    type: 'dfc-m47-live-smoke-install-progress',
    state: sanitizeCode(operation.state ?? 'unknown'),
    stateHistory: history.map((state) => sanitizeCode(state)),
    diagnosticCode: sanitizeCode(operation.diagnosticCode ?? operation.failureReason ?? null),
    progressSummary: sanitizeText(operation.progressSummary ?? '').slice(0, 120),
  })}\n`)
}

async function runDocxWorkflow(page) {
  const result = await page.evaluate(async (filePath) => {
    const seed = window.__starverseElectronSmokeSeedDocxPdfAttachment
    if (typeof seed !== 'function') throw new Error('DOCX smoke seeder is missing')
    return await seed(filePath)
  }, docxFixturePath)
  const ui = await page.evaluate((assetId) => {
    const card = document.querySelector(`[data-testid="draft-attachment-card-${assetId}"]`)
    const preview = document.querySelector('[data-testid="draft-attachment-dfc-preview"]')?.textContent ?? ''
    return {
      cardVisible: Boolean(card),
      previewSensitive: /storageRef|contentToken|file:\/\/|[A-Za-z]:\\|%PDF-|soffice\.exe/iu.test(preview),
    }
  }, result.assetId)
  if (!ui.cardVisible) fail('M47 DOCX attachment card was not visible.')
  if (ui.previewSensitive) fail('M47 DOCX preview leaked sensitive evidence.')
  const selectedRefKind = Array.isArray(result.selectedAssetRefs)
    ? result.selectedAssetRefs.find((ref) => ref?.kind === 'derived_asset')?.kind ?? null
    : null
  return {
    attempted: true,
    result: 'ready_pdf_attachment',
    targetKind: result.targetKind ?? null,
    derivedKind: selectedRefKind === 'derived_asset' ? 'converted_pdf' : null,
    sendStrategy: result.sendStrategy ?? null,
    assetRefKind: selectedRefKind,
    preview: `${result.previewKind ?? 'unknown'}:${result.previewStatus ?? 'unknown'}`,
    availableTargets: Array.isArray(result.availableTargets) ? result.availableTargets.filter((item) => typeof item === 'string') : [],
    pdfValidation: result.targetKind === 'pdf_attachment' && selectedRefKind === 'derived_asset' ? 'valid_pdf' : null,
    diagnosticCode: null,
  }
}

function hasActiveLibreOfficeOperation(operation) {
  return Boolean(operation && ['accepted', 'pending', 'downloading', 'verifying', 'staging', 'registering', 'health_checking'].includes(operation.state))
}

async function pageBodyHasSensitiveEvidence(page) {
  return await page.evaluate(() => {
    const text = document.body.innerText
    return /file:\/\/|[A-Za-z]:\\|storageRef|contentToken|%PDF-|soffice\.exe|-----BEGIN PRIVATE KEY-----/iu.test(text)
  })
}

async function closeVite(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    if (process.platform === 'win32') {
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      }).once('exit', resolve)
    } else {
      child.kill()
    }
    setTimeout(resolve, 3000).unref()
  })
}

async function closeElectronApp(electronApp) {
  const electronProcess = electronApp.process()
  const electronPid = electronProcess?.pid
  await Promise.race([
    electronApp.close().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (!electronPid || electronProcess.exitCode !== null) return
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      spawn('taskkill.exe', ['/PID', String(electronPid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      }).once('exit', resolve)
      setTimeout(resolve, 3000).unref()
    })
  } else {
    electronProcess.kill('SIGKILL')
  }
}

function createMinimalDocxBuffer() {
  return createZipBuffer([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      name: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Starverse M47 live installed runtime verification.</w:t></w:r></w:p>
    <w:p><w:r><w:t>LibreOffice DOCX to PDF selected-ref smoke.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`,
    },
  ])
}

function createZipBuffer(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8')
    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8')
    const crc = crc32(content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, content)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + content.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

async function pathExists(filePath) {
  return stat(filePath).then(() => true).catch(() => false)
}

function quoteForShell(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pipeSanitized(stream, output) {
  if (!stream) return
  let buffered = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffered += chunk
    const lines = buffered.split(/\r?\n/u)
    buffered = lines.pop() ?? ''
    for (const line of lines) output.write(`${sanitizeText(line)}\n`)
  })
  stream.on('end', () => {
    if (buffered) output.write(sanitizeText(buffered))
  })
}

function sanitizeText(value) {
  return String(value)
    .replace(/file:\/\/\/?[^\s"'<>)]*/giu, '<file-url-redacted>')
    .replace(/(^|[^A-Za-z])([A-Za-z]:[\\/][^\s"'<>)]*)/gu, '$1<absolute-path-redacted>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu, '<uuid-redacted>')
    .replace(/[a-f0-9]{64}/giu, '<sha256-redacted>')
    .replace(/storageRef\s*[:=]\s*[^\s"'<>)}]+/giu, 'storageRef=<redacted>')
    .replace(/contentToken\s*[:=]\s*[^\s"'<>)}]+/giu, 'contentToken=<redacted>')
    .replace(/%PDF-/giu, '<pdf-body-redacted>')
    .replace(/-----BEGIN PRIVATE KEY-----/giu, '<private-key-redacted>')
    .replace(/soffice\.exe/giu, '<managed-executable-redacted>')
}

function sanitizeCode(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.replace(/[^a-zA-Z0-9_.:-]+/g, '_').slice(0, 120) : null
}

function extractDiagnosticFromError(error) {
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/"code":"([^"]+)"/u) ?? message.match(/(office_pdf_[a-z0-9_]+)/u)
  return match?.[1] ?? 'office_pdf_unavailable'
}

function printEvidence(evidence) {
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
}

function fail(message) {
  throw new Error(message)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(sanitizeText(message))
  process.exit(1)
})
