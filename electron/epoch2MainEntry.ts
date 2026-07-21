import { app, dialog } from 'electron'
import { configureStarverseElectronIdentity, hasExplicitUserDataOverride } from './bootstrap/productIdentityBootstrap'
import { bootstrapEpoch2ApplicationRuntime, installEpoch2ApplicationRuntime } from './bootstrap/epoch2ApplicationRuntime'

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

void app.whenReady().then(async () => {
  const runtime = await bootstrapEpoch2ApplicationRuntime()
  installEpoch2ApplicationRuntime(runtime)
  const { startMainV2 } = await import('./mainV2')
  await startMainV2()
}).catch((error) => {
  const code = startupFailureCode(error)
  // Keep startup diagnostics useful for packaged/automation launchers without
  // emitting raw exception messages, paths, credentials or configuration.
  process.stderr.write(`[epoch2-startup] ${code}\n`)
  dialog.showErrorBox('Starverse startup failed', code)
  app.quit()
})
