import type { PdpManagementPluginViewModel } from './managementViewModel'

export const PDP_MANAGEMENT_ACTION_IDS = [
  'view_details',
  'install_official_plugin',
  'manual_local_package_registration',
  'enable',
  'disable',
  'uninstall_metadata',
  'verify_package',
  'check_health',
  'manual_update_eligibility',
  'stage_update_contract',
  'rollback_metadata',
  'acknowledge_quarantine',
] as const

export type PdpManagementActionId = (typeof PDP_MANAGEMENT_ACTION_IDS)[number]

export type PdpManagementAction = Readonly<{
  id: PdpManagementActionId
  label: string
  enabled: boolean
  reasonCodes: readonly string[]
}>

export type PdpManagementActionSet = Readonly<{
  pluginId: string
  actions: readonly PdpManagementAction[]
}>

export type PdpManagementActionOptions = Readonly<{
  hasLocalManualRegistrationContract?: boolean
  hasOfficialRemoteInstallContract?: boolean
  hasPackageVerificationContract?: boolean
  hasHealthCheckContract?: boolean
  hasMetadataUninstallContract?: boolean
  hasEnableDisableContract?: boolean
  hasUpdateEligibilityContract?: boolean
  hasStageUpdateContract?: boolean
  hasRollbackMetadataContract?: boolean
  hasQuarantineAcknowledgementContract?: boolean
}>

const DEFAULT_ACTION_OPTIONS: Required<PdpManagementActionOptions> = {
  hasLocalManualRegistrationContract: false,
  hasOfficialRemoteInstallContract: false,
  hasPackageVerificationContract: false,
  hasHealthCheckContract: false,
  hasMetadataUninstallContract: false,
  hasEnableDisableContract: false,
  hasUpdateEligibilityContract: false,
  hasStageUpdateContract: false,
  hasRollbackMetadataContract: false,
  hasQuarantineAcknowledgementContract: false,
}

export function buildPdpManagementActions(
  plugin: PdpManagementPluginViewModel,
  options?: PdpManagementActionOptions
): PdpManagementActionSet {
  const flags = { ...DEFAULT_ACTION_OPTIONS, ...options }
  return {
    pluginId: plugin.id,
    actions: [
      viewDetailsAction(),
      installOfficialPluginAction(plugin, flags),
      manualLocalRegistrationAction(plugin, flags),
      enableAction(plugin, flags),
      disableAction(plugin, flags),
      uninstallMetadataAction(plugin, flags),
      verifyPackageAction(plugin, flags),
      checkHealthAction(plugin, flags),
      manualUpdateEligibilityAction(plugin, flags),
      stageUpdateContractAction(plugin, flags),
      rollbackMetadataAction(plugin, flags),
      acknowledgeQuarantineAction(plugin, flags),
    ],
  }
}

export function findPdpManagementAction(
  actions: PdpManagementActionSet,
  id: PdpManagementActionId
): PdpManagementAction {
  return actions.actions.find((action) => action.id === id) ?? disabledAction(id, id, ['unknown'])
}

function viewDetailsAction(): PdpManagementAction {
  return enabledAction('view_details', 'View details')
}

function installOfficialPluginAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasOfficialRemoteInstallContract) {
    return disabledAction('install_official_plugin', 'Install official plugin', ['unsupported_action_contract_missing'])
  }
  if (hasActiveRegistryRecord(plugin, { allowFailedRetry: true })) {
    return disabledAction('install_official_plugin', 'Install official plugin', ['already_registered'])
  }
  if (!plugin.catalog.present) {
    return disabledAction('install_official_plugin', 'Install official plugin', ['catalog_missing'])
  }
  if (plugin.catalog.installabilityStatus !== 'official_remote_install_available') {
    return disabledAction('install_official_plugin', 'Install official plugin', ['official_remote_install_unavailable'])
  }
  const blockedReinstall = blockedReinstallReason(plugin)
  if (blockedReinstall) {
    return disabledAction('install_official_plugin', 'Install official plugin', [blockedReinstall])
  }
  if (plugin.reasonCodes.includes('signature_missing')) {
    return disabledAction('install_official_plugin', 'Install official plugin', ['signature_missing'])
  }
  if (plugin.reasonCodes.includes('official_trusted_root_unconfigured')) {
    return disabledAction('install_official_plugin', 'Install official plugin', ['official_trusted_root_unconfigured'])
  }
  return enabledAction('install_official_plugin', 'Install official plugin')
}

function manualLocalRegistrationAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasLocalManualRegistrationContract) {
    return disabledAction(
      'manual_local_package_registration',
      'Register local package',
      ['unsupported_action_contract_missing']
    )
  }
  if (hasActiveRegistryRecord(plugin)) {
    return disabledAction(
      'manual_local_package_registration',
      'Register local package',
      ['already_registered']
    )
  }
  const blockedReinstall = blockedReinstallReason(plugin)
  if (blockedReinstall) {
    return disabledAction(
      'manual_local_package_registration',
      'Register local package',
      [blockedReinstall]
    )
  }
  return enabledAction('manual_local_package_registration', 'Register local package')
}

function enableAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasEnableDisableContract) {
    return disabledAction('enable', 'Enable', ['unsupported_action_contract_missing'])
  }
  const blocked = enableBlockers(plugin)
  return blocked.length === 0 ? enabledAction('enable', 'Enable') : disabledAction('enable', 'Enable', blocked)
}

function disableAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasEnableDisableContract) {
    return disabledAction('disable', 'Disable', ['unsupported_action_contract_missing'])
  }
  if (!plugin.registry.present) return disabledAction('disable', 'Disable', ['not_registered'])
  if (!plugin.status.enabled) return disabledAction('disable', 'Disable', ['not_enabled'])
  return enabledAction('disable', 'Disable')
}

function uninstallMetadataAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasMetadataUninstallContract) {
    return disabledAction('uninstall_metadata', 'Uninstall metadata', ['unsupported_action_contract_missing'])
  }
  if (!plugin.registry.present) {
    return disabledAction('uninstall_metadata', 'Uninstall metadata', ['not_registered'])
  }
  if (plugin.status.installState === 'uninstalled') {
    return disabledAction('uninstall_metadata', 'Uninstall metadata', ['already_uninstalled'])
  }
  return enabledAction('uninstall_metadata', 'Uninstall metadata')
}

function verifyPackageAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasPackageVerificationContract) {
    return disabledAction('verify_package', 'Verify package', ['unsupported_action_contract_missing'])
  }
  if (!plugin.registry.present) {
    return disabledAction('verify_package', 'Verify package', ['not_registered'])
  }
  if (plugin.status.installState === 'uninstalled') {
    return disabledAction('verify_package', 'Verify package', ['uninstalled'])
  }
  if (plugin.status.quarantined) {
    return disabledAction('verify_package', 'Verify package', ['quarantined'])
  }
  return enabledAction('verify_package', 'Verify package')
}

function checkHealthAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasHealthCheckContract) {
    return disabledAction('check_health', 'Check health', ['unsupported_action_contract_missing'])
  }
  if (!plugin.registry.present) return disabledAction('check_health', 'Check health', ['not_registered'])
  if (plugin.status.installState === 'uninstalled') {
    return disabledAction('check_health', 'Check health', ['uninstalled'])
  }
  return enabledAction('check_health', 'Check health')
}

function manualUpdateEligibilityAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasUpdateEligibilityContract) {
    return disabledAction(
      'manual_update_eligibility',
      'Check manual update eligibility',
      ['unsupported_action_contract_missing']
    )
  }
  if (!plugin.registry.present) {
    return disabledAction('manual_update_eligibility', 'Check manual update eligibility', ['not_registered'])
  }
  if (plugin.status.quarantined) {
    return disabledAction('manual_update_eligibility', 'Check manual update eligibility', ['quarantined'])
  }
  return enabledAction('manual_update_eligibility', 'Check manual update eligibility')
}

function stageUpdateContractAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasStageUpdateContract) {
    return disabledAction('stage_update_contract', 'Stage update contract', ['unsupported_action_contract_missing'])
  }
  if (plugin.status.updateState !== 'eligible_manual') {
    return disabledAction('stage_update_contract', 'Stage update contract', ['manual_update_not_eligible'])
  }
  if (plugin.status.quarantined) {
    return disabledAction('stage_update_contract', 'Stage update contract', ['quarantined'])
  }
  return enabledAction('stage_update_contract', 'Stage update contract')
}

function rollbackMetadataAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasRollbackMetadataContract) {
    return disabledAction('rollback_metadata', 'Rollback metadata', ['unsupported_action_contract_missing'])
  }
  if (plugin.status.rollbackState !== 'previous_known_good_metadata') {
    return disabledAction('rollback_metadata', 'Rollback metadata', ['previous_known_good_missing'])
  }
  if (plugin.status.quarantined) {
    return disabledAction('rollback_metadata', 'Rollback metadata', ['quarantined'])
  }
  return enabledAction('rollback_metadata', 'Rollback metadata')
}

function acknowledgeQuarantineAction(
  plugin: PdpManagementPluginViewModel,
  flags: Required<PdpManagementActionOptions>
): PdpManagementAction {
  if (!flags.hasQuarantineAcknowledgementContract) {
    return disabledAction(
      'acknowledge_quarantine',
      'Acknowledge quarantine',
      ['unsupported_action_contract_missing']
    )
  }
  if (!plugin.status.quarantined) {
    return disabledAction('acknowledge_quarantine', 'Acknowledge quarantine', ['not_quarantined'])
  }
  return enabledAction('acknowledge_quarantine', 'Acknowledge quarantine')
}

function enableBlockers(plugin: PdpManagementPluginViewModel): readonly string[] {
  const blockers: string[] = []
  if (!plugin.registry.present) blockers.push('not_registered')
  if (plugin.status.installState === 'uninstalled') return ['not_installed']
  if (plugin.status.quarantined) blockers.push('quarantined')
  if (plugin.status.enabled) blockers.push('already_enabled')
  if (plugin.status.verificationStatus !== 'verified') blockers.push('verification_required')
  if (plugin.status.installState !== 'installed' && plugin.status.installState !== 'disabled') {
    blockers.push('not_installed')
  }
  if (plugin.reasonCodes.includes('revoked')) blockers.push('revoked')
  return uniqueCodes(blockers)
}

function hasActiveRegistryRecord(
  plugin: PdpManagementPluginViewModel,
  options: Readonly<{ allowFailedRetry?: boolean }> = {}
): boolean {
  return plugin.registry.present &&
    plugin.status.installState !== 'uninstalled' &&
    (!options.allowFailedRetry || plugin.status.installState !== 'failed')
}

function blockedReinstallReason(plugin: PdpManagementPluginViewModel): string | null {
  const blockedTrust = firstReasonCode(plugin, [
    'revoked',
    'signature_invalid',
    'hash_mismatch',
    'integrity_missing',
    'expired_metadata',
    'rollback_detected',
  ])
  if (plugin.status.quarantined || blockedTrust) return blockedTrust ?? 'revoked'
  return firstReasonCode(plugin, [
    'incompatible_platform',
    'incompatible_arch',
    'incompatible_app_version',
  ])
}

function firstReasonCode(
  plugin: PdpManagementPluginViewModel,
  reasonCodes: readonly string[]
): string | null {
  return reasonCodes.find((reasonCode) => plugin.reasonCodes.includes(reasonCode)) ?? null
}

function enabledAction(id: PdpManagementActionId, label: string): PdpManagementAction {
  return { id, label, enabled: true, reasonCodes: [] }
}

function disabledAction(
  id: PdpManagementActionId,
  label: string,
  reasonCodes: readonly string[]
): PdpManagementAction {
  const codes = uniqueCodes(reasonCodes)
  return { id, label, enabled: false, reasonCodes: codes.length > 0 ? codes : ['unknown'] }
}

function uniqueCodes(values: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const code = value.trim().replace(/[^a-z0-9._:-]/giu, '_').slice(0, 128)
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}
