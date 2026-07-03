# Provider Catalog Post-Merge Smoke

Date: 2026-07-04

## Scope

This smoke record covers the provider-neutral model catalog core after the OpenRouter path was moved into the provider module and the legacy OpenRouter sync path was removed.

Covered paths:

- OpenRouter catalog regression.
- Google AI Studio, Anthropic, OpenAI Responses, and DeepSeek provider catalog query paths.
- Model picker scoped active snapshot reads.
- Manual refresh and startup sync.
- Network failure/cache fallback behavior.
- Settings credential safety, sync settings, and cache cleanup entry points.
- Desktop shell launch boundary.

Out of scope:

- Provider stream routing.
- Provider upload/download routing.
- DFC attachment behavior changes.
- Full Settings UI redesign.

## Findings

- OpenRouter behavior remained covered by characterization and scoped catalog tests.
- Provider picker reads use `modelCatalog.queryScopedCurrent`; no fallback to the old `queryCore` fact path was observed in focused tests.
- Manual refresh, startup sync, stale-only/force behavior, sync failure with old cache, and scoped cleanup all pass through the provider-neutral catalog runner.
- Settings tests confirm provider credentials are handled through safe credential bridges rather than generic store credential reads.
- The old package smoke scripts referenced deleted catalog test paths; they were updated to the current provider-neutral file set.

## Desktop Smoke

Command:

```text
npm run test:electron-smoke
```

Result:

- `npm run rebuild:electron`: passed.
- `npm run build:worker`: passed.
- Vite renderer/main/preload development builds: passed.
- Electron shell/preload boundary assertion: passed.
  - `appMounted: true`
  - `composerDraftVisible: true`
  - `rawIpcRendererExposed: false`
  - `electronAPIExposed: true`
  - `electronStoreExposed: true`
  - `dbBridgeExposed: true`
- DFC attachment smoke seam: failed with `Local file ingestion requires a valid file selection grant`.

Assessment:

The Electron shell smoke confirmed the desktop app starts and the preload boundary is intact. The failing DFC seam is unrelated to provider catalog persistence and was not changed in this round.

## Automated Validation

Passed:

```text
npm run rebuild:node
npm run test:model-catalog:smoke
npm run test:model-picker:smoke
npx vitest --run src/ui-app/components/ChatSessionConsole.openAIResponses.test.ts src/ui-app/components/ChatSessionConsole.anthropic.test.ts src/ui-app/components/ChatSessionConsole.deepSeek.test.ts src/ui-app/components/ChatSessionConsole.googleAIStudio.test.ts src/ui-app/components/ChatSessionConsole.lmStudio.test.ts src/ui-app/components/ChatSessionConsole.ollama.test.ts src/ui-app/components/ComposerCapabilityChip.test.ts src/ui-app/components/ChatWorkspaceShell.test.ts src/ui-app/components/ChatAppComposer.modelPicker.test.ts
npx vitest --run electron/ipc/modelCatalogSyncIpc.test.ts electron/jobs/catalogSyncStartup.test.ts electron/jobs/startupBackgroundJobs.test.ts electron/modelCatalog/providerCatalogSyncJob.test.ts electron/modelCatalog/providerCatalogCacheCleanup.test.ts src/ui-app/components/ModelPickerDialog.catalogSyncCharacterization.test.ts src/ui-app/components/SettingsPanel.test.ts
npx tsc --noEmit --pretty false
npx vue-tsc --noEmit
npm run i18n:check
npm run gate:network-egress
git diff --check
```

Notes:

- `test:model-catalog:smoke`: 9 files, 109 tests passed.
- `test:model-picker:smoke`: 9 files, 100 tests passed.
- Provider/Settings targeted suite: 7 files, 82 tests passed.
- UI dirty-file focused suite: 9 files, 70 tests passed.
- `ChatAppComposer.modelPicker.test.ts` still emits non-fatal Vue warnings about extraneous test props. This is existing test harness noise and was not expanded in this cleanup.

## Dirty File Classification

Ready to commit as UI/script cleanup:

- `package.json`
- `src/shared/i18n/locales/en-US/chat.json`
- `src/shared/i18n/locales/zh-CN/chat.json`
- `src/ui-app/components/ChatAppComposer.modelPicker.test.ts`
- `src/ui-app/components/ChatAppComposer.vue`
- `src/ui-app/components/ChatSessionConsole.anthropic.test.ts`
- `src/ui-app/components/ChatSessionConsole.deepSeek.test.ts`
- `src/ui-app/components/ChatSessionConsole.googleAIStudio.test.ts`
- `src/ui-app/components/ChatSessionConsole.lmStudio.test.ts`
- `src/ui-app/components/ChatSessionConsole.ollama.test.ts`
- `src/ui-app/components/ChatSessionConsole.openAIResponses.test.ts`
- `src/ui-app/components/ChatSessionConsole.vue`
- `src/ui-app/components/ChatWorkspaceShell.test.ts`
- `src/ui-app/components/ChatWorkspaceShell.vue`
- `src/ui-app/components/ComposerCapabilityChip.test.ts`
- `src/ui-app/components/ComposerCapabilityChip.vue`
- `docs/architecture/provider-architecture/provider-catalog-post-merge-smoke.md`

No dirty files were classified as unknown-source or discard candidates in this pass.
