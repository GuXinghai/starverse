import path from 'node:path'
import { app, dialog } from 'electron'
import { matchSystemLocale } from '../src/shared/i18n/localeMatcher'
import { applyIsolatedEpoch2SmokeAppDataRoot, configureStarverseElectronIdentity, hasExplicitUserDataOverride } from './bootstrap/productIdentityBootstrap'
import {
  bootstrapEpoch2ApplicationRuntime,
  installEpoch2ApplicationRuntime,
  resolveEpoch2BootstrapLayout,
} from './bootstrap/epoch2ApplicationRuntime'
import { EPOCH2_RECOVERY_BACKUP_ROOT, recoverEpoch2DatabaseSchemaMismatch } from './data-epoch/schemaMismatchRecovery'
import { createFreshEpoch2Config, repairCorruptEpoch2Config } from './data-epoch/corruptConfigRecovery'
import {
  confirmFreshConfigCreation,
  CONFIG_CORRUPT_RECOVERY_AUTHORITY,
  notifyConfigRepaired,
  notifyFreshConfigCreated,
} from './data-epoch/corruptConfigRecoveryPrompt'
import { formatEpoch2ConfigRecoverySuccess, formatEpoch2SchemaRecoverySuccess } from './data-epoch/epoch2StartupDiagnostics'
import {
  confirmSchemaMismatchRecovery,
  notifySchemaMismatchRecovered,
  SCHEMA_MISMATCH_RECOVERY_AUTHORITY,
  shouldAttemptSchemaMismatchRecovery,
} from './data-epoch/schemaMismatchRecoveryPrompt'
import { acquireEpochRootLease } from './data-epoch/win32EpochRootLease'
import { requestMainWindowActivation } from './windows/mainWindowActivation'
import { getAgentAutomationOptions, initializeAgentAutomation } from './bootstrap/agentAutomationRuntime'
import { startWithEpoch2RuntimeCleanup } from './bootstrap/epoch2StartupCleanup'

initializeAgentAutomation({ app, env: process.env, repositoryRoot: process.cwd() })
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

// Record uncaught main-process failures without changing Electron's default
// handling (P4a-18). Only the error name is logged, never its message.
process.on('uncaughtExceptionMonitor', (error, origin) => {
  process.stderr.write(`[main-process] ${origin} ${error instanceof Error ? error.name : typeof error}\n`)
})

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
  await startWithEpoch2RuntimeCleanup(runtime, async () => {
    installEpoch2ApplicationRuntime(runtime)
    const { startMainV2 } = await import('./mainV2')
    await startMainV2()
  })
}

async function startWithSchemaMismatchRecovery(): Promise<void> {
  process.stderr.write(`[epoch2-startup] EPOCH2_DATABASE_SCHEMA_MISMATCH: installed database schema differs ` +
    `from this build; recovery authority: ${SCHEMA_MISMATCH_RECOVERY_AUTHORITY}=1\n`)
  // The config store is not open yet, so the dialogs follow the system language.
  const locale = matchSystemLocale(app.getPreferredSystemLanguages())
  let backupDirectory: string
  try {
    const layout = resolveEpoch2BootstrapLayout()
    if (!await confirmSchemaMismatchRecovery(path.join(layout.productRoot, EPOCH2_RECOVERY_BACKUP_ROOT), locale)) {
      app.quit()
      return
    }
    const lease = acquireEpochRootLease(layout)
    try {
      const recovered = recoverEpoch2DatabaseSchemaMismatch({ layout, lease })
      process.stderr.write(formatEpoch2SchemaRecoverySuccess(recovered.backedUpFiles.length))
      backupDirectory = recovered.backupDirectory
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
    notifySchemaMismatchRecovered(backupDirectory, locale)
  } catch (error) {
    const retryCode = startupFailureCode(error)
    process.stderr.write(`[epoch2-startup] ${retryCode}\n`)
    dialog.showErrorBox('Starverse startup failed', retryCode)
    app.quit()
  }
}

async function startWithConfigRecovery(): Promise<void> {
  process.stderr.write(`[epoch2-startup] EPOCH2_CONFIG_CORRUPT: config.json is not a valid JSON object; ` +
    `attempting non-destructive repair; fresh-config authority: ${CONFIG_CORRUPT_RECOVERY_AUTHORITY}=1
`)
  let notice: (() => void) | null = null
  try {
    const layout = resolveEpoch2BootstrapLayout()
    let repaired
    const repairLease = acquireEpochRootLease(layout)
    try {
      repaired = repairCorruptEpoch2Config({ layout, lease: repairLease })
    } finally {
      repairLease.release()
    }
    if (repaired.outcome === 'repaired') {
      process.stderr.write(formatEpoch2ConfigRecoverySuccess('repaired'))
      notice = () => notifyConfigRepaired(repaired.backupDirectory)
    } else {
      // Unrecoverable: the corrupt file is untouched until the user consents to a fresh config.
      if (!await confirmFreshConfigCreation()) {
        app.quit()
        return
      }
      const freshLease = acquireEpochRootLease(layout)
      try {
        const fresh = createFreshEpoch2Config({ layout, lease: freshLease })
        process.stderr.write(formatEpoch2ConfigRecoverySuccess('fresh'))
        notice = () => notifyFreshConfigCreated(fresh.backupDirectory)
      } finally {
        freshLease.release()
      }
    }
  } catch (recoveryError) {
    const recoveryCode = startupFailureCode(recoveryError)
    process.stderr.write(`[epoch2-startup] ${recoveryCode}
`)
    dialog.showErrorBox('Starverse startup failed', recoveryCode)
    app.quit()
    return
  }
  try {
    await startup()
    notice?.()
  } catch (error) {
    const retryCode = startupFailureCode(error)
    process.stderr.write(`[epoch2-startup] ${retryCode}
`)
    dialog.showErrorBox('Starverse startup failed', retryCode)
    app.quit()
  }
}

if (isPrimaryInstance) void app.whenReady().then(async () => {
  try {
    await startup()
  } catch (error) {
    const code = startupFailureCode(error)
    const agentAutomation = Boolean(getAgentAutomationOptions())
    if (shouldAttemptSchemaMismatchRecovery(code, agentAutomation)) {
      await startWithSchemaMismatchRecovery()
      return
    }
    if (agentAutomation) {
      process.stderr.write(`[agent-startup] ${code}\n`)
      app.exit(1)
      return
    }
    if (code === 'EPOCH2_CONFIG_CORRUPT') {
      await startWithConfigRecovery()
      return
    }
    // Keep startup diagnostics useful for packaged/automation launchers without
    // emitting raw exception messages, paths, credentials or configuration.
    process.stderr.write(`[epoch2-startup] ${code}\n`)
    dialog.showErrorBox('Starverse startup failed', code)
    app.quit()
  }
})
