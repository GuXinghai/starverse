import {
  isOfficialInstallOperationActive,
  isOfficialInstallOperationTerminal,
  labelOfficialInstallOperationPhase,
  type PdpOfficialInstallOperationState,
} from './installOperationState'
import {
  buildPdpManagementActions,
  type PdpManagementAction,
  type PdpManagementActionOptions,
  type PdpManagementActionSet,
} from './managementActions'
import { sanitizePdpManagementText } from './managementLabels'
import {
  buildPdpManagementViewModel,
  type PdpManagementCatalogInput,
  type PdpManagementLifecycleState,
  type PdpManagementPluginViewModel,
  type PdpManagementRegistryInput,
} from './managementViewModel'

const DEFAULT_RECONCILE_GRACE_MS = 30_000

const TRUST_BLOCKING_OPERATION_FAILURES = new Set([
  'revoked',
  'signature_invalid',
  'hash_mismatch',
  'integrity_missing',
  'expired_metadata',
  'rollback_detected',
])

export type PdpManagementInstallOperationInput = Readonly<{
  operationId: string
  pluginId: string
  pluginVersion: string
  state: PdpOfficialInstallOperationState
  progressSummary?: string | null
  failureReason?: string | null
  diagnosticCode?: string | null
  startedAt: number
  updatedAt: number
  terminalAt: number | null
}>

export type PdpManagementInstallOperationProjection = Readonly<{
  visible: boolean
  active: boolean
  terminal: boolean
  superseded: boolean
  shouldPoll: boolean
  bannerMessage: string | null
  errorMessage: string | null
  rowSummary: string | null
  failureDisplay: string | null
  installBlockReason: string | null
}>

export type PdpManagementSummaryContribution = Readonly<{
  registered: number
  enabled: number
  healthy: number
  failed: number
}>

export type PdpPluginManagementStateFromSources = Readonly<{
  plugin: PdpManagementPluginViewModel
  lifecycle: PdpManagementLifecycleState
  actions: PdpManagementActionSet
  installOperation: PdpManagementInstallOperationProjection
  summaryContribution: PdpManagementSummaryContribution
}>

export type BuildPluginManagementStateFromSourcesInput = Readonly<{
  catalogEntry?: PdpManagementCatalogInput | null
  registryRecord?: PdpManagementRegistryInput | null
  plugin?: PdpManagementPluginViewModel | null
  installOperation?: PdpManagementInstallOperationInput | null
  actionOptions?: PdpManagementActionOptions
  now?: number
  reconcileGraceMs?: number
}>

export function buildPluginManagementStateFromSources(
  input: BuildPluginManagementStateFromSourcesInput
): PdpPluginManagementStateFromSources {
  const plugin = input.plugin ?? firstPluginFromSources(input.catalogEntry ?? null, input.registryRecord ?? null)
  const installOperation = projectInstallOperation({
    plugin,
    registryRecord: input.registryRecord ?? null,
    installOperation: input.installOperation ?? null,
    now: input.now,
    reconcileGraceMs: input.reconcileGraceMs ?? DEFAULT_RECONCILE_GRACE_MS,
  })

  return {
    plugin,
    lifecycle: plugin.status.lifecycle,
    actions: applyInstallOperationActionOverlay(
      buildPdpManagementActions(plugin, input.actionOptions),
      installOperation
    ),
    installOperation,
    summaryContribution: summarizeRegistryContribution(input.registryRecord ?? null),
  }
}

function firstPluginFromSources(
  catalogEntry: PdpManagementCatalogInput | null,
  registryRecord: PdpManagementRegistryInput | null
): PdpManagementPluginViewModel {
  const viewModel = buildPdpManagementViewModel({
    catalogEntries: catalogEntry ? [catalogEntry] : [],
    registryRecords: registryRecord ? [registryRecord] : [],
  })
  const plugin = viewModel.plugins[0]
  if (!plugin) throw new Error('plugin management state requires a catalog or registry source')
  return plugin
}

function projectInstallOperation(input: Readonly<{
  plugin: PdpManagementPluginViewModel
  registryRecord: PdpManagementRegistryInput | null
  installOperation: PdpManagementInstallOperationInput | null
  now?: number
  reconcileGraceMs: number
}>): PdpManagementInstallOperationProjection {
  const operation = input.installOperation
  if (!operation) return hiddenInstallOperation(false)

  const registryState = input.registryRecord?.installState ?? input.plugin.status.installState
  if (registrySupersedesOperation(input.registryRecord, operation)) {
    return hiddenInstallOperation(true)
  }

  const summary = installOperationSummary(operation)
  const failure = installOperationFailureReason(operation)
  if (isOfficialInstallOperationActive(operation.state)) {
    return projectActiveInstallOperation(input.registryRecord, operation, summary)
  }

  if (registryCompletesOperation(input.registryRecord, operation)) {
    return hiddenInstallOperation(true)
  }

  if (!isOfficialInstallOperationTerminal(operation.state)) return hiddenInstallOperation(false)

  if (operation.state === 'installed') {
    return projectTerminalInstalledOperation({
      operation,
      registryRecord: input.registryRecord,
      registryState,
      summary,
      now: input.now,
      reconcileGraceMs: input.reconcileGraceMs,
    })
  }

  if (shouldHideHealthFailedOperation(operation, failure, input.registryRecord)) {
    return hiddenInstallOperation(true)
  }

  return projectTerminalFailureOperation(operation, summary, failure)
}

function projectActiveInstallOperation(
  registryRecord: PdpManagementRegistryInput | null,
  operation: PdpManagementInstallOperationInput,
  summary: string
): PdpManagementInstallOperationProjection {
  if (registryCompletesActiveStaleOperation(registryRecord, operation)) {
    return hiddenInstallOperation(true)
  }
  return {
    visible: true,
    active: true,
    terminal: false,
    superseded: false,
    shouldPoll: true,
    bannerMessage: `Install official plugin: ${summary}`,
    errorMessage: null,
    rowSummary: summary,
    failureDisplay: null,
    installBlockReason: 'install_in_progress',
  }
}

function projectTerminalInstalledOperation(input: Readonly<{
  operation: PdpManagementInstallOperationInput
  registryRecord: PdpManagementRegistryInput | null
  registryState: string
  summary: string
  now?: number
  reconcileGraceMs: number
}>): PdpManagementInstallOperationProjection {
  if (isRegistryInactiveOrSettled(input.registryState, input.registryRecord, input.operation)) {
    return hiddenInstallOperation(true)
  }
  if (isTerminalOperationTooOld(input.operation, input.now, input.reconcileGraceMs)) {
    return hiddenInstallOperation(true)
  }
  return {
    visible: true,
    active: false,
    terminal: true,
    superseded: false,
    shouldPoll: true,
    bannerMessage: 'Install official plugin: Reconciling installed registry state',
    errorMessage: null,
    rowSummary: input.summary,
    failureDisplay: null,
    installBlockReason: 'install_reconciling',
  }
}

function projectTerminalFailureOperation(
  operation: PdpManagementInstallOperationInput,
  summary: string,
  failure: string | null
): PdpManagementInstallOperationProjection {
  const errorMessage = failure && !summary.includes(failure)
    ? `${summary}: ${failure}`
    : summary
  return {
    visible: true,
    active: false,
    terminal: true,
    superseded: false,
    shouldPoll: false,
    bannerMessage: null,
    errorMessage,
    rowSummary: summary,
    failureDisplay: failure,
    installBlockReason: operation.state === 'failed' && failure && TRUST_BLOCKING_OPERATION_FAILURES.has(failure)
      ? failure
      : null,
  }
}

function isRegistryInactiveOrSettled(
  registryState: string,
  registryRecord: PdpManagementRegistryInput | null,
  operation: PdpManagementInstallOperationInput
): boolean {
  if (!isRegistryStateSettled(registryState)) return false
  if (typeof registryRecord?.updatedAt !== 'number') return false
  return registryRecord.updatedAt >= (operation.terminalAt ?? operation.updatedAt)
}

function isRegistryStateSettled(registryState: string): boolean {
  return registryState === 'installed' ||
    registryState === 'disabled' ||
    registryState === 'failed' ||
    registryState === 'uninstalled'
}

function shouldHideHealthFailedOperation(
  operation: PdpManagementInstallOperationInput,
  failure: string | null,
  registryRecord: PdpManagementRegistryInput | null
): boolean {
  const registryState = registryRecord?.installState
  if (typeof registryRecord?.updatedAt !== 'number') return false
  return operation.state === 'failed' &&
    failure === 'health_failed' &&
    (registryState === 'installed' || registryState === 'disabled') &&
    registryRecord.updatedAt >= (operation.terminalAt ?? operation.updatedAt)
}

function applyInstallOperationActionOverlay(
  actionSet: PdpManagementActionSet,
  projection: PdpManagementInstallOperationProjection
): PdpManagementActionSet {
  const installBlockReason = projection.installBlockReason
  if (!installBlockReason && projection.failureDisplay !== 'resume_retries_exhausted') return actionSet
  return {
    ...actionSet,
    actions: actionSet.actions.map((action) => {
      if (action.id === 'cancel_official_install' && projection.failureDisplay === 'resume_retries_exhausted') {
        return { ...action, enabled: true, reasonCodes: [] }
      }
      return action.id === 'install_official_plugin' && installBlockReason
        ? disableAction(action, installBlockReason)
        : action
    }),
  }
}

function disableAction(action: PdpManagementAction, reasonCode: string): PdpManagementAction {
  return {
    ...action,
    enabled: false,
    reasonCodes: [reasonCode],
  }
}

function summarizeRegistryContribution(
  registryRecord: PdpManagementRegistryInput | null
): PdpManagementSummaryContribution {
  if (!registryRecord || registryRecord.installState === 'uninstalled') {
    return { registered: 0, enabled: 0, healthy: 0, failed: 0 }
  }
  return {
    registered: 1,
    enabled: registryRecord.enabled ? 1 : 0,
    healthy: registryRecord.healthStatus === 'healthy' ? 1 : 0,
    failed: registryRecord.installState === 'failed' || registryRecord.healthStatus === 'failed' ? 1 : 0,
  }
}

function registrySupersedesOperation(
  registryRecord: PdpManagementRegistryInput | null,
  operation: PdpManagementInstallOperationInput
): boolean {
  if (!registryRecord || registryRecord.installState !== 'uninstalled') return false
  const updatedAt = registryRecord.updatedAt
  if (typeof updatedAt !== 'number') return registryRecord.pluginVersion === operation.pluginVersion
  const operationObservedAt = isOfficialInstallOperationTerminal(operation.state)
    ? operation.terminalAt ?? operation.updatedAt
    : operation.startedAt
  return updatedAt >= operationObservedAt
}

function registryCompletesOperation(
  registryRecord: PdpManagementRegistryInput | null,
  operation: PdpManagementInstallOperationInput
): boolean {
  if (!registryRecord || registryRecord.pluginVersion !== operation.pluginVersion) return false
  if (registryRecord.installState !== 'installed' && registryRecord.installState !== 'disabled') return false
  const updatedAt = registryRecord.updatedAt
  const operationCompletedAt = isOfficialInstallOperationTerminal(operation.state)
    ? operation.terminalAt ?? operation.updatedAt
    : operation.startedAt
  return typeof updatedAt === 'number' ? updatedAt >= operationCompletedAt : operation.state === 'installed'
}

function registryCompletesActiveStaleOperation(
  registryRecord: PdpManagementRegistryInput | null,
  operation: PdpManagementInstallOperationInput
): boolean {
  if (!registryRecord || registryRecord.pluginVersion !== operation.pluginVersion) return false
  if (registryRecord.installState !== 'installed' && registryRecord.installState !== 'disabled') return false
  return typeof registryRecord.updatedAt === 'number' && registryRecord.updatedAt >= operation.updatedAt
}

function isTerminalOperationTooOld(
  operation: PdpManagementInstallOperationInput,
  now: number | undefined,
  graceMs: number
): boolean {
  if (typeof now !== 'number') return false
  const observedAt = operation.terminalAt ?? operation.updatedAt
  return now - observedAt > graceMs
}

function hiddenInstallOperation(superseded: boolean): PdpManagementInstallOperationProjection {
  return {
    visible: false,
    active: false,
    terminal: false,
    superseded,
    shouldPoll: false,
    bannerMessage: null,
    errorMessage: null,
    rowSummary: null,
    failureDisplay: null,
    installBlockReason: null,
  }
}

function installOperationSummary(operation: PdpManagementInstallOperationInput): string {
  return sanitizePdpManagementText(
    operation.progressSummary,
    labelOfficialInstallOperationPhase(operation.state)
  )
}

function installOperationFailureReason(operation: PdpManagementInstallOperationInput): string | null {
  return sanitizePdpManagementText(
    operation.diagnosticCode ?? operation.failureReason ?? '',
    ''
  ) || null
}
