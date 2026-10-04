import { getGenerationV2UiPreference, setGenerationV2UiPreference } from '@/next/generation-v2/renderer/uiPreferenceStoreV2'

const KEY = 'projectDefaults'

export type ProjectDefaultsMeta = Readonly<Record<string, unknown>>

function plainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

async function readAll(): Promise<Record<string, unknown>> {
  return plainRecord(await getGenerationV2UiPreference(KEY)) ?? {}
}

/** Per-project web-search / generation-param defaults, keyed by V2 project id. */
export async function listProjectDefaults(): Promise<ReadonlyMap<string, ProjectDefaultsMeta>> {
  const out = new Map<string, ProjectDefaultsMeta>()
  for (const [projectId, meta] of Object.entries(await readAll())) {
    const record = plainRecord(meta)
    if (record) out.set(projectId, record)
  }
  return out
}

/** Resolves false when the preference store rejected or could not persist the write. */
export async function setProjectDefaults(projectId: string, meta: ProjectDefaultsMeta | null): Promise<boolean> {
  const id = String(projectId ?? '').trim()
  if (!id) return false
  const next = { ...(await readAll()) }
  if (meta && Object.keys(meta).length > 0) next[id] = meta
  else delete next[id]
  return setGenerationV2UiPreference(KEY, next)
}
