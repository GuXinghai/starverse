import type BetterSqlite3 from 'better-sqlite3'
import { ModelPreferencesRepo } from '../../infra/db/repo/modelPreferencesRepo'
import {
  ModelPrefsAddFavoriteSchema,
  ModelPrefsListFavoritesSchema,
  ModelPrefsListRecentsSchema,
  ModelPrefsRemoveFavoriteSchema,
  ModelPrefsReorderFavoritesSchema,
} from '../../infra/db/validation'
import type { RegisterInvoke } from './types'

export const GENERATION_V2_MODEL_PREFERENCES_IPC_CHANNELS = Object.freeze([
  'generation-v2:model-preferences:list-favorites',
  'generation-v2:model-preferences:add-favorite',
  'generation-v2:model-preferences:remove-favorite',
  'generation-v2:model-preferences:reorder-favorites',
  'generation-v2:model-preferences:list-recents',
] as const)

export function registerGenerationV2ModelPreferencesIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  db: BetterSqlite3.Database
}>): readonly string[] {
  const repo = new ModelPreferencesRepo(input.db)
  const register = <T>(channel: string, parse: (payload: unknown) => T, run: (payload: T) => unknown) => {
    input.registerInvoke(channel, (_event, payload) => run(parse(payload)))
  }
  register(GENERATION_V2_MODEL_PREFERENCES_IPC_CHANNELS[0], (value) => ModelPrefsListFavoritesSchema.parse(value ?? {}),
    (value) => repo.listFavorites(value))
  register(GENERATION_V2_MODEL_PREFERENCES_IPC_CHANNELS[1], (value) => ModelPrefsAddFavoriteSchema.parse(value),
    (value) => repo.addFavorite(value))
  register(GENERATION_V2_MODEL_PREFERENCES_IPC_CHANNELS[2], (value) => ModelPrefsRemoveFavoriteSchema.parse(value),
    (value) => repo.removeFavorite(value))
  register(GENERATION_V2_MODEL_PREFERENCES_IPC_CHANNELS[3], (value) => ModelPrefsReorderFavoritesSchema.parse(value),
    (value) => repo.reorderFavorites(value))
  register(GENERATION_V2_MODEL_PREFERENCES_IPC_CHANNELS[4], (value) => ModelPrefsListRecentsSchema.parse(value ?? {}),
    (value) => repo.listRecents(value))
  return GENERATION_V2_MODEL_PREFERENCES_IPC_CHANNELS
}
