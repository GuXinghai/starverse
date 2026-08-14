import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Store from 'electron-store'
import { app, session } from 'electron'
import { bootstrapEpoch2ToCommitted } from '../../electron/data-epoch/epoch2CommittedBootstrap'
import { resolveEpoch2WorkspaceLayout } from '../../electron/data-epoch/rootManifest'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { ConversationRoutePreferenceV2Repo } from '../../infra/db/repo/conversationRoutePreferenceV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { ModelPreferencesRepo } from '../../infra/db/repo/modelPreferencesRepo'
import { createProviderModelRouteSelection } from '../../src/next/provider/conversationRouteSelection'
import { createCompatibleRouteIntent } from '../../src/next/provider/openai-chat-compatible/ui/compatibleRouteIntent'
import { runtimeProviderIdForCatalogProvider } from '../../src/shared/provider/catalogRuntimeProviderAuthority'
import { runtimeProviderIdForGenerationExecutionProvider } from '../../src/shared/provider/generationExecutionRuntimeProviderAuthority'
import { requireLocalProviderRouteDescriptorForRuntimeProvider } from '../../src/shared/provider/localProviderRouteDescriptor'

const appDataRoot = process.env.SV_IDENTITY_FRESH_PROFILE_ROOT
const phase = process.env.SV_IDENTITY_FRESH_PROFILE_PHASE

async function main(): Promise<void> {
  if (process.platform !== 'win32' || !appDataRoot || !path.isAbsolute(appDataRoot) ||
      (phase !== 'write' && phase !== 'verify')) {
    throw new Error('MODEL_PROVIDER_IDENTITY_FRESH_PROFILE_INPUT_INVALID')
  }
  app.setPath('userData', path.join(appDataRoot, 'user-data'))
  await app.whenReady()
  const repositoryRoot = path.resolve(process.cwd())
  const layout = resolveEpoch2WorkspaceLayout({ appDataRoot, homeRoot: os.homedir(), repositoryRoot })
  fs.mkdirSync(layout.productRoot, { recursive: true })
  const runtime = await bootstrapEpoch2ToCommitted({
    layout,
    clearDefaultSessionData: async () => {
      await session.defaultSession.clearStorageData()
      await session.defaultSession.clearCache()
    },
    openCredentialStore: () => new Store({ name: 'config', cwd: layout.productRoot, clearInvalidConfig: false }),
  })
  try {
    const db = runtime.database
    const routes = new ConversationRoutePreferenceV2Repo(db, () => 100)
    const preferences = new ModelPreferencesRepo(db)
    if (phase === 'write') {
      const graph = new ConversationGraphV2Repo(db)
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(db, (context) => {
        graph.createProject(context, { projectId: 'project:identity-smoke', name: 'Identity smoke', createdAtMs: 1 })
        graph.createConversationAndDefaultBranch(context, {
          projectId: 'project:identity-smoke', conversationId: 'conversation:ordinary', branchId: 'branch:ordinary',
          title: 'Ordinary', branchName: null, createdAtMs: 2,
        })
        graph.createConversationAndDefaultBranch(context, {
          projectId: 'project:identity-smoke', conversationId: 'conversation:compatible', branchId: 'branch:compatible',
          title: 'Compatible', branchName: null, createdAtMs: 3,
        })
        routes.upsert(context, { conversationId: 'conversation:ordinary', expectedRevision: 0,
          selection: createProviderModelRouteSelection({ providerId: 'anthropic_messages', modelId: 'claude-smoke' }) })
        routes.upsert(context, { conversationId: 'conversation:compatible', expectedRevision: 0,
          selection: createCompatibleRouteIntent({ providerInstanceId: 'ocp_provider_12345678', modelId: 'compatible-smoke' }) })
      })
      preferences.addFavorite({ providerKey: 'anthropic_messages', modelId: 'claude-smoke' })
      preferences.recordRecentForGenerationOperation({ operationId: 'operation:identity:1',
        providerKey: 'anthropic_messages', modelId: 'claude-smoke', usedAtMs: 10 })
      preferences.recordRecentForGenerationOperation({ operationId: 'operation:identity:1',
        providerKey: 'anthropic_messages', modelId: 'claude-smoke', usedAtMs: 10 })
      preferences.recordRecentForGenerationOperation({ operationId: 'operation:identity:2',
        providerKey: 'anthropic_messages', modelId: 'claude-smoke', usedAtMs: 11 })
    } else {
      if (routes.get('conversation:ordinary')?.selection.kind !== 'provider_model' ||
          routes.get('conversation:ordinary')?.selection.providerId !== 'anthropic_messages' ||
          routes.get('conversation:compatible')?.selection.kind !== 'openai_chat_compatible' ||
          routes.get('conversation:compatible')?.selection.providerInstanceId !== 'ocp_provider_12345678') {
        throw new Error('MODEL_PROVIDER_IDENTITY_FRESH_PROFILE_ROUTE_INVALID')
      }
      const favorite = preferences.listFavorites()
      const recent = preferences.listRecents()
      const ledger = db.prepare('SELECT COUNT(*) AS count FROM model_recent_operation_v2').get() as { count: number }
      if (favorite.length !== 1 || favorite[0]?.modelKey !== 'anthropic_messages::claude-smoke' ||
          recent.length !== 1 || recent[0]?.useCount !== 2 || ledger.count !== 2) {
        throw new Error('MODEL_PROVIDER_IDENTITY_FRESH_PROFILE_PREFERENCES_INVALID')
      }
      const local = requireLocalProviderRouteDescriptorForRuntimeProvider('lm_studio')
      if (local.executionProviderId !== 'lmstudio' || local.protocolContractId !== 'lmstudio-openresponses' ||
          runtimeProviderIdForCatalogProvider('anthropic_messages') !== 'anthropic_messages' ||
          runtimeProviderIdForGenerationExecutionProvider('anthropic') !== 'anthropic_messages' ||
          runtimeProviderIdForGenerationExecutionProvider('openai_compatible') !== null) {
        throw new Error('MODEL_PROVIDER_IDENTITY_FRESH_PROFILE_AUTHORITY_INVALID')
      }
    }
    process.stdout.write(`[model-provider-identity-fresh-profile] ${phase} PASS\n`)
  } finally {
    await runtime.close()
  }
}

void main().then(() => app.quit(), (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[model-provider-identity-fresh-profile] ${phase ?? 'unknown'} FAIL ${message}\n`)
  app.exit(1)
})
