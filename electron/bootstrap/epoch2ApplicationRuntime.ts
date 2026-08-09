import { app, session } from 'electron'
import path from 'node:path'
import os from 'node:os'
import Store from 'electron-store'
import { bootstrapEpoch2ToCommitted, type Epoch2CommittedRuntime } from '../data-epoch/epoch2CommittedBootstrap'
import { resolveEpoch2WorkspaceLayout, type Epoch2WorkspaceLayout } from '../data-epoch/rootManifest'

export type Epoch2ApplicationRuntime = Readonly<{
  epoch2: Epoch2CommittedRuntime
  configStore: Store
  layout: Epoch2WorkspaceLayout
}>

let installed: Epoch2ApplicationRuntime | null = null

export function installEpoch2ApplicationRuntime(runtime: Epoch2ApplicationRuntime): void {
  if (installed) throw new Error('EPOCH2_APPLICATION_RUNTIME_ALREADY_INSTALLED')
  installed = Object.freeze(runtime)
}
export function requireEpoch2ApplicationRuntime(): Epoch2ApplicationRuntime {
  if (!installed) throw new Error('EPOCH2_APPLICATION_RUNTIME_NOT_INSTALLED')
  installed.epoch2.assertCurrent()
  return installed
}

export function resolveEpoch2BootstrapLayout(): Epoch2WorkspaceLayout {
  return resolveEpoch2WorkspaceLayout({
    appDataRoot: app.getPath('appData'),
    homeRoot: os.homedir(),
    ...(app.isPackaged ? {} : { repositoryRoot: path.resolve(process.cwd()) }),
  })
}

/** Runs only after Electron ready and before importing the normal main module. */
export async function bootstrapEpoch2ApplicationRuntime(): Promise<Epoch2ApplicationRuntime> {
  if (!app.isReady()) throw new Error('EPOCH2_APPLICATION_BOOTSTRAP_BEFORE_READY')
  if (installed) return requireEpoch2ApplicationRuntime()
  const layout = resolveEpoch2BootstrapLayout()
  let configStore: Store | null = null
  const epoch2 = await bootstrapEpoch2ToCommitted({ layout,
    clearDefaultSessionData: async () => {
      await session.defaultSession.clearStorageData()
      await session.defaultSession.clearCache()
    },
    openCredentialStore: () => {
      if (configStore) throw new Error('EPOCH2_CONFIG_STORE_OPENED_MORE_THAN_ONCE')
      configStore = new Store({ name: 'config', cwd: layout.productRoot, clearInvalidConfig: false })
      return configStore
    },
  })
  if (!configStore) { await epoch2.close(); throw new Error('EPOCH2_CONFIG_STORE_NOT_OPENED') }
  return Object.freeze({ epoch2, configStore, layout })
}
