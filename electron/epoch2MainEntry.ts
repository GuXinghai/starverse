import { app, dialog } from 'electron'
import { applyIsolatedEpoch2SmokeAppDataRoot, configureStarverseElectronIdentity, hasExplicitUserDataOverride } from './bootstrap/productIdentityBootstrap'
import {
  bootstrapEpoch2ApplicationRuntime,
  installEpoch2ApplicationRuntime,
  resolveEpoch2BootstrapLayout,
} from './bootstrap/epoch2ApplicationRuntime'
import { recoverEpoch2DatabaseSchemaMismatch } from './data-epoch/schemaMismatchRecovery'
import { acquireWin32EpochRootLease } from './data-epoch/win32EpochRootLease'

applyIsolatedEpoch2SmokeAppDataRoot({ app, env: process.env })
configureStarverseElectronIdentity({ app, isPackaged: app.isPackaged,
  isE2e: process.env.SV_ELECTRON_COMPATIBLE_E2E === '1', platform: process.platform,
  userDataOverrideRequested: hasExplicitUserDataOverride(process.argv) })

function startupFailureCode(error: unknown): string {
  const candidate = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : error instanceof Error ? error.message : null
  return typeof candidate === 'string' && /^EPOCH2_[A-Z0-9_]+$/u.test(candidate)
    ? candidate
    : 'EPOCH2_STARTUP_UNCLASSIFIED'
}

const SCHEMA_MISMATCH_GUIDANCE = [
  '数据库 schema 与本版本不匹配（检测到 schema 变更）。',
  '旧数据无法自动迁移。',
  '如需自动备份旧数据库并重建，请设置环境变量',
  'SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH=1 后重新启动。',
].join('\n')

const SCHEMA_RECOVERY_AUTHORITY = 'SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH'

async function startup(): Promise<void> {
  const runtime = await bootstrapEpoch2ApplicationRuntime()
  installEpoch2ApplicationRuntime(runtime)
  const { startMainV2 } = await import('./mainV2')
  await startMainV2()
}

async function startWithSchemaMismatchRecovery(): Promise<void> {
  process.stderr.write(`[epoch2-startup] EPOCH2_DATABASE_SCHEMA_MISMATCH: installed database schema differs ` +
    `from this build; recovery authority: ${SCHEMA_RECOVERY_AUTHORITY}=1\n`)
  if (process.env[SCHEMA_RECOVERY_AUTHORITY] !== '1') {
    dialog.showErrorBox('Starverse startup failed', SCHEMA_MISMATCH_GUIDANCE)
    app.quit()
    return
  }
  try {
    const layout = resolveEpoch2BootstrapLayout()
    const lease = acquireWin32EpochRootLease(layout)
    try {
      const recovered = recoverEpoch2DatabaseSchemaMismatch({ layout, lease })
      process.stderr.write(`[epoch2-startup] EPOCH2_DATABASE_SCHEMA_MISMATCH_RECOVERED ` +
        `backup=${recovered.backupDirectory} files=${recovered.backedUpFiles.length}\n`)
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

void app.whenReady().then(async () => {
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
