export function formatEpoch2SchemaRecoverySuccess(fileCount: number): string {
  if (!Number.isSafeInteger(fileCount) || fileCount < 0) return '[epoch2-startup] EPOCH2_DATABASE_SCHEMA_MISMATCH_RECOVERED files=unknown\n'
  return `[epoch2-startup] EPOCH2_DATABASE_SCHEMA_MISMATCH_RECOVERED files=${fileCount}\n`
}
