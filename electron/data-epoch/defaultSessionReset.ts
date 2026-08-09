import type { Session } from 'electron'

export type Epoch2DefaultSessionTarget = Pick<Session, 'clearStorageData' | 'clearCache'>

export async function clearEpoch2DefaultSessionState(
  target: Epoch2DefaultSessionTarget,
): Promise<void> {
  await target.clearStorageData({ storages: ['localstorage'] })
  await target.clearCache()
}

export function createEpoch2DefaultSessionReset(
  target: Epoch2DefaultSessionTarget,
): () => Promise<void> {
  return () => clearEpoch2DefaultSessionState(target)
}
