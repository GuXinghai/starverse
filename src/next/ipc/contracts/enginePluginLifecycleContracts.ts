import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)
const pluginPackageCapabilitySchema = z.enum([
  'file_identification',
  'document_conversion',
  'spreadsheet_conversion',
  'presentation_conversion',
  'text_extraction',
  'metadata_extraction',
  'audio_video_probe',
  'model_inference',
  'utility',
])

const installedPluginSchema = z.object({
  engineId: nonEmpty,
  displayName: nonEmpty,
  pluginVersion: nonEmpty,
  manifestSchemaVersion: nonEmpty,
  runtimeKind: nonEmpty,
  modelVersion: z.string().trim().nullable(),
  installState: z.enum(['installed', 'failed', 'uninstalled', 'update_available']),
  enabled: z.boolean(),
  healthStatus: z.enum(['unknown', 'healthy', 'degraded', 'unhealthy']),
  failureReason: z.string().trim().nullable(),
  installSource: z.enum(['official_catalog', 'local_package']),
  installRootKind: z.enum(['managed_root', 'managed_cache', 'test_root']),
  installedAt: z.number().finite().nullable(),
  updatedAt: z.number().finite(),
  lastVerifiedAt: z.number().finite().nullable(),
  lastHealthCheckAt: z.number().finite().nullable(),
})

const officialPluginSchema = z.object({
  pluginId: nonEmpty,
  displayName: nonEmpty,
  publisher: nonEmpty,
  pluginVersion: nonEmpty,
  runtimeKind: nonEmpty,
  capabilities: z.array(pluginPackageCapabilitySchema),
  modelVersion: z.string().trim().nullable(),
  catalogGeneratedAt: z.string().trim().nullable(),
  installState: z.enum(['installed', 'failed', 'uninstalled', 'update_available', 'not_installed']),
  enabled: z.boolean(),
  recommendedInstallRootKind: z.enum(['managed_root', 'test_root']),
  catalogStatus: nonEmpty,
  verificationMetadataStatus: nonEmpty,
  installabilityStatus: nonEmpty,
  reasons: z.array(nonEmpty),
  warnings: z.array(nonEmpty),
})

const lifecycleFailureSchema = z.object({
  ok: z.literal(false),
  reason: nonEmpty,
  message: nonEmpty,
})

const officialInstallOperationStateSchema = z.enum([
  'accepted',
  'pending',
  'downloading',
  'verifying',
  'staging',
  'registering',
  'health_checking',
  'installed',
  'failed',
  'cancelled',
  'stale',
])

const officialInstallOperationSchema = z.object({
  operationId: nonEmpty,
  pluginId: nonEmpty,
  pluginVersion: nonEmpty,
  operationType: z.literal('official_install'),
  source: z.literal('official_builtin'),
  state: officialInstallOperationStateSchema,
  phase: officialInstallOperationStateSchema,
  phaseLabel: nonEmpty,
  progressSummary: nonEmpty,
  stateHistory: z.array(officialInstallOperationStateSchema),
  startedAt: z.number().finite(),
  updatedAt: z.number().finite(),
  terminalAt: z.number().finite().nullable(),
  failureReason: z.string().trim().nullable(),
  diagnosticCode: z.string().trim().nullable(),
  sanitizedDiagnostics: z.array(z.string().trim()),
  installedEngineId: z.string().trim().nullable(),
  result: z.object({
    engineId: nonEmpty,
    pluginVersion: nonEmpty,
    installState: nonEmpty,
    healthStatus: nonEmpty,
  }).nullable(),
})

const diagnosticsEntrySchema = z.object({
  engineId: nonEmpty,
  displayName: nonEmpty,
  kind: z.enum(['builtin', 'plugin']),
  installed: z.boolean(),
  enabled: z.boolean(),
  healthStatus: nonEmpty,
  verificationStatus: nonEmpty.nullable(),
  pluginVersion: nonEmpty.nullable(),
  modelVersion: nonEmpty.nullable(),
  failureReason: nonEmpty.nullable(),
  installSource: nonEmpty.nullable(),
})

const diagnosticsSummarySchema = z.object({
  engines: z.array(diagnosticsEntrySchema),
  counts: z.object({
    total: z.number().int().nonnegative(),
    installed: z.number().int().nonnegative(),
    enabled: z.number().int().nonnegative(),
    healthy: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    unverified: z.number().int().nonnegative(),
  }),
})

const lifecycleSuccessSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    ok: z.literal(true),
    value: valueSchema,
  })

const listInstalledResultSchema = z.array(installedPluginSchema)
const listOfficialResultSchema = z.union([
  lifecycleSuccessSchema(z.array(officialPluginSchema)),
  lifecycleFailureSchema,
])
const lifecycleInstalledResultSchema = z.union([
  lifecycleSuccessSchema(installedPluginSchema),
  lifecycleFailureSchema,
])
const installOfficialPluginResultSchema = z.union([
  lifecycleSuccessSchema(officialInstallOperationSchema),
  lifecycleFailureSchema,
])
const installOperationStatusResultSchema = z.union([
  lifecycleSuccessSchema(officialInstallOperationSchema.nullable()),
  lifecycleFailureSchema,
])

export type DecodedInstalledPlugin = z.infer<typeof installedPluginSchema>
export type DecodedOfficialPlugin = z.infer<typeof officialPluginSchema>
export type DecodedOfficialInstallOperation = z.infer<typeof officialInstallOperationSchema>
export type DecodedLifecycleInstalledResult = z.infer<typeof lifecycleInstalledResultSchema>
export type DecodedInstallOfficialPluginResult = z.infer<typeof installOfficialPluginResultSchema>
export type DecodedInstallOperationStatusResult = z.infer<typeof installOperationStatusResultSchema>
export type DecodedLifecycleListOfficialResult = z.infer<typeof listOfficialResultSchema>
export type DecodedDiagnosticsSummary = z.infer<typeof diagnosticsSummarySchema>

export type ListOfficialPluginsRequest = Readonly<{ catalogPath?: string }>
export type RegisterLocalOfficialPluginRequest = Readonly<{
  catalogPath?: string
  pluginId: string
  pluginVersion: string
  installRootKind: 'managed_root' | 'managed_cache' | 'test_root'
  installRef: string
  enabled?: boolean
}>
export type RegisterLocalPackageRequest = Readonly<{
  packageDir: string
  installRootKind: 'managed_root' | 'managed_cache' | 'test_root'
  installRef: string
  enabled?: boolean
}>
export type InstallOfficialPluginRequest = Readonly<{
  pluginId: string
  pluginVersion?: string
  enabled?: boolean
}>
export type GetInstallOperationStatusRequest = Readonly<{
  operationId?: string
  pluginId?: string
  pluginVersion?: string
}>
export type LifecycleEngineRequest = Readonly<{ engineId: string }>

export function decodeInstalledPluginsResponse(raw: unknown): DecodedInstalledPlugin[] {
  return listInstalledResultSchema.parse(raw)
}

export function decodeListOfficialPluginsResponse(raw: unknown): DecodedLifecycleListOfficialResult {
  return listOfficialResultSchema.parse(raw)
}

export function decodeLifecycleInstalledResult(raw: unknown): DecodedLifecycleInstalledResult {
  return lifecycleInstalledResultSchema.parse(raw)
}

export function decodeInstallOfficialPluginResult(raw: unknown): DecodedInstallOfficialPluginResult {
  return installOfficialPluginResultSchema.parse(raw)
}

export function decodeInstallOperationStatusResult(raw: unknown): DecodedInstallOperationStatusResult {
  return installOperationStatusResultSchema.parse(raw)
}

export function decodeDiagnosticsSummary(raw: unknown): DecodedDiagnosticsSummary {
  return diagnosticsSummarySchema.parse(raw)
}
