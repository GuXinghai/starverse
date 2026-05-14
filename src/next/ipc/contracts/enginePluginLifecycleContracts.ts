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
  installSource: z.literal('official_catalog'),
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

export type DecodedInstalledPlugin = z.infer<typeof installedPluginSchema>
export type DecodedOfficialPlugin = z.infer<typeof officialPluginSchema>
export type DecodedLifecycleInstalledResult = z.infer<typeof lifecycleInstalledResultSchema>
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

export function decodeDiagnosticsSummary(raw: unknown): DecodedDiagnosticsSummary {
  return diagnosticsSummarySchema.parse(raw)
}
