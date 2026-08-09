import type Store from 'electron-store'
import path from 'node:path'
import { EnginePluginLifecycleService } from '../../infra/files/enginePluginLifecycleService'
import { createElectronSystemAwareOfficialPackageTransport } from '../../infra/files/electronOfficialPackageTransport'
import { getDfcLibreOfficeManagedRuntimeRoot } from '../../infra/files/dfcManagedLibreOfficeRuntime'
import { EnginePluginRegistryRepo } from '../../infra/db/repo/enginePluginRegistryRepo'
import type { Epoch2WorkspaceLayout } from '../data-epoch/rootManifest'
import { getActiveTrustedRoots } from '../../src/next/file-type/officialPluginTrustedRoots'
import type BetterSqlite3 from 'better-sqlite3'
import { createMainProcessElectronConversionService } from './electronConversionService'
import type { ProviderFetch } from '../net/providerHttpTransport'
import type { ElectronConversionBridge } from '../../infra/files/electronConversionBridge'
import { NETWORK_PROXY_SETTINGS_V2_STORE_KEY } from '../net/productNetworkProxyV2'

/**
 * One epoch-2 owned lifecycle authority.  Its mutable install-operation maps
 * must survive every IPC call, so mainV2 creates exactly one instance.
 */
export function createEpoch2EnginePluginLifecycleService(input: Readonly<{
  db: BetterSqlite3.Database
  layout: Epoch2WorkspaceLayout
  configStore: Store
  isProduction: boolean
  electronConversionBridge?: ElectronConversionBridge
  providerFetch: ProviderFetch
  beforeGovernedRequest?: () => void
}>): EnginePluginLifecycleService {
  const trustedRoots = getActiveTrustedRoots(undefined, {
    isProduction: input.isProduction,
    includeEmbeddedOfficialRoot: true,
  })
  const runtimeAppRoot = input.layout.runtimesRoot
  const electronConversionBridge = input.electronConversionBridge ?? createMainProcessElectronConversionService({
    providerFetch: input.providerFetch,
    beforeGovernedRequest: input.beforeGovernedRequest,
  })
  return new EnginePluginLifecycleService({
    registryRepo: new EnginePluginRegistryRepo(input.db),
    trustedRoots: trustedRoots.ok ? trustedRoots.trustedRoots : {},
    trustedRootSource: trustedRoots.ok ? trustedRoots.source : null,
    resolveInstallPluginDir: ({ installRootKind, installRef }) => {
      const safeRef = installRef.replace(/[^a-zA-Z0-9._-]+/g, '_')
      return path.join(input.layout.pluginsRoot, installRootKind, safeRef)
    },
    // Keep the legacy runtime's expected internal managed-runtimes layout,
    // but make it a child of the one epoch-owned runtimes root.
    dfcLibreOfficeAppManagedRootDir: runtimeAppRoot,
    dfcLibreOfficeManagedRuntimeRootDir: getDfcLibreOfficeManagedRuntimeRoot(runtimeAppRoot),
    officialPackageTransport: createElectronSystemAwareOfficialPackageTransport(electronConversionBridge),
    networkProxySettingsProvider: () => input.configStore.get(NETWORK_PROXY_SETTINGS_V2_STORE_KEY),
    officialDownloadProbeFetch: input.providerFetch,
  })
}
