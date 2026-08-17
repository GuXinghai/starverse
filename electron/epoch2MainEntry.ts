import { app, dialog } from 'electron'
import { applyIsolatedEpoch2SmokeAppDataRoot, configureStarverseElectronIdentity, hasExplicitUserDataOverride } from './bootstrap/productIdentityBootstrap'
import {
  bootstrapEpoch2ApplicationRuntime,
  installEpoch2ApplicationRuntime,
  resolveEpoch2BootstrapLayout,
} from './bootstrap/epoch2ApplicationRuntime'
import { recoverEpoch2DatabaseSchemaMismatch } from './data-epoch/schemaMismatchRecovery'
import { formatEpoch2SchemaRecoverySuccess } from './data-epoch/epoch2StartupDiagnostics'
import {
  confirmSchemaMismatchRecovery,
  SCHEMA_MISMATCH_RECOVERY_AUTHORITY,
} from './data-epoch/schemaMismatchRecoveryPrompt'
import { acquireEpochRootLease } from './data-epoch/win32EpochRootLease'
import { requestMainWindowActivation } from './windows/mainWindowActivation'

applyIsolatedEpoch2SmokeAppDataRoot({ app, env: process.env })
configureStarverseElectronIdentity({ app, isPackaged: app.isPackaged,
  isE2e: process.env.SV_ELECTRON_COMPATIBLE_E2E === '1', platform: process.platform,
  userDataOverrideRequested: hasExplicitUserDataOverride(process.argv) })

const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) {
  app.quit()
} else {
  app.on('second-instance', () => requestMainWindowActivation())
}

function startupFailureCode(error: unknown): string {
  const candidate = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : error instanceof Error ? error.message : null
  return typeof candidate === 'string' && /^(?:EPOCH2_|LINUX_CREDENTIAL_STORAGE_)[A-Z0-9_]+$/u.test(candidate)
    ? candidate
    : 'EPOCH2_STARTUP_UNCLASSIFIED'
}

async function startup(): Promise<void> {
  const runtime = await bootstrapEpoch2ApplicationRuntime()
  installEpoch2ApplicationRuntime(runtime)
  const { startMainV2 } = await import('./mainV2')
  await startMainV2()
}

async function startWithSchemaMismatchRecovery(): Promise<void> {
  process.stderr.write(`[epoch2-startup] EPOCH2_DATABASE_SCHEMA_MISMATCH: installed database schema differs ` +
    `from this build; recovery authority: ${SCHEMA_MISMATCH_RECOVERY_AUTHORITY}=1\n`)
  if (!await confirmSchemaMismatchRecovery()) {
    app.quit()
    return
  }
  try {
    const layout = resolveEpoch2BootstrapLayout()
    const lease = acquireEpochRootLease(layout)
    try {
      const recovered = recoverEpoch2DatabaseSchemaMismatch({ layout, lease })
      process.stderr.write(formatEpoch2SchemaRecoverySuccess(recovered.backedUpFiles.length))
    } finally {
      lease.release()
    }
  } catch (recoveryError) {
    const recoveryCode = startupFailureCode(recoveryError)
    process.stderr.write(`[epoch2-startup] ${recoveryCode}\n`)
    dialog.showErrorBox('Starverse startup failed', recoveryCode)
    app.quit()
    return
  }
  try {
    await startup()
  } catch (error) {
    const retryCode = startupFailureCode(error)
    process.stderr.write(`[epoch2-startup] ${retryCode}\n`)
    dialog.showErrorBox('Starverse startup failed', retryCode)
    app.quit()
  }
}

if (isPrimaryInstance) void app.whenReady().then(async () => {
  try {
    await startup()
  } catch (error) {
    const code = startupFailureCode(error)
    if (code === 'EPOCH2_DATABASE_SCHEMA_MISMATCH') {
      await startWithSchemaMismatchRecovery()
      return
    }
    // Keep startup diagnostics useful for packaged/automation launchers without
    // emitting raw exception messages, paths, credentials or configuration.
    process.stderr.write(`[epoch2-startup] ${code}\n`)
    dialog.showErrorBox('Starverse startup failed', code)
    app.quit()
  }
})
