# Test strategy and partition ownership

Starverse keeps the default test command small and predictable. The partition
gate (`node scripts/check-test-partitions.mjs`) discovers every unignored
`*.test.*`/`*.spec.*` file with one of `ts`, `tsx`, `js`, `jsx`, `mjs`, or `cjs`
extensions and reports the owner counts. An override in
`tests/test-partition-overrides.json` replaces the directory default for one
specific file.

## Owners

- `ui`: files under `src/ui-app/` or `src/ui-kit/`, plus an E2E path containing
  `ui`.
- `integration`: the remaining `tests/e2e/` and `tests/integration/` files,
  `electron/`, and `infra/` tests.
- `unit`: everything else, including `src/next/` and `src/shared/` unless an
  override is justified.

Tests that use a real child process, temporary runtime/filesystem state, or a
native/runtime package are explicitly overridden to `integration`. A slow test
is a filename containing a `slow` segment (for example, `foo.slow.test.ts` or
`foo.test.slow.ts`). Slow tests must be `ui` or `integration` owned. Run one
slow file at a time; do not pass a directory or a broad glob to a slow command.

The deleted `infra/db/worker.filePipeline.test.ts` is intentionally not
restored. It is not a partition entry and must not be recreated as part of
test-strategy work.

## AppChatApp behavior ownership

One behavior has one primary owner. Full `AppChatApp` mounts retain only a
small wiring journey; they do not repeat provider payload or persistence
matrices already exercised below.

| Removed high-level coverage | Primary owner | Retained wiring smoke |
| --- | --- | --- |
| Provider payload, reasoning and generation-parameter matrices | Generation V2 compiler, projection and request-codec unit tests | `AppChatApp.send.test.ts` sends through one selected route. |
| Repeated OpenAI, DeepSeek and Anthropic coordinator request/stream matrices | Provider command decoders, compiler/request-codec units and `generationV2AuthorityTransaction.test.ts` | Provider-specific runtime and failure-boundary tests remain independent; no full App or catalog-fetch matrix is retained. |
| Abort, retry and regenerate transitions | `AppChatApp.regenRetry.test.ts` | That suite mounts the App only for the user-visible controls. |
| Error presentation and lazy error details | `AppChatApp.errorLazyHydrate.ui.test.ts` | Error panels stay UI-owned rather than being repeated in send tests. |
| Attachment send-plan, sanitization and state rules | shared/next file and send-plan unit tests | `AppChatApp.attachments.test.ts` covers only composer-boundary interactions. |
| File authority, DFC persistence and preview conversion | integration file/DFC repositories and services | The attachment App smoke selects one backend-owned DFC option. |
| Attachment card/preview/removal interaction | `AppChatApp.attachments.test.ts` and focused component UI tests | The App smoke covers partial local import, preview and revision-authorized removal. |
| Legacy `dbBridge` conversation and draft App mounts | Generation V2 workspace/composer contracts and `conversationDraftClient.test.ts` | None: the retired bridge APIs are not a production wiring surface. |

## 2026-08-10 closure evidence

The dependency upgrade to Vitest 4.1.10/Vite 6.4.3 preceded the budget
closure; this is a retrospective validation of the current toolchain, not a
claim that the historical Vitest-2-first sequence occurred.

| Layer | Command | Result | Wall time | Hard budget |
| --- | --- | --- | ---: | ---: |
| unit | `npm test` | 312 files / 2,713 tests passed | 18.86 s | 5 min |
| ui | `npm run test:ui` | 59 files / 449 tests passed | 54.87 s | 10 min |
| integration | `npm run test:integration` | 130 files / 1,016 passed, 3 prerequisite skips | 54.49 s | 15 min |

Worker comparison used Node 22.21.1, Vitest 4.1.10, Windows x64, and the
fixed representative set `generationV2AuthorityTransaction.test.ts`,
`win32EpochRootLease.test.ts`, and `libreoffice-svpkg-preflight.test.mjs`.
Each run passed all 18 tests.

| maxWorkers | Three wall-clock samples | Median | Decision |
| ---: | --- | ---: | --- |
| 1 | 4.18 s, 3.83 s, 3.90 s | 3.90 s | stable |
| 2 | 3.07 s, 3.01 s, 3.06 s | 3.06 s | selected |
| 4 | 2.79 s, 2.64 s, 2.83 s | 2.79 s | 8.8% faster than 2; within the 10% tie band, so retain the lower worker count |

Slow-gate rejection was verified for no file, multiple files, and an owner
mismatch; a valid single integration slow file collected only itself. Its
LibreOffice prerequisite was unavailable, so that real external smoke was
reported as skipped rather than passed.

The Electron shell smoke passed after `npm run rebuild:electron`. Each run
creates and verifies separate temporary `user-data`, `app-data`, and fixture
roots; the smoke does not read the normal profile's database or credentials.
The final active native ABI is Electron.

## Commands

Run the preparation step before database-heavy Node/Vitest work. Preparation is
manual in the sense that the developer must invoke it: `npm run test:prepare`
explicitly runs the Node native rebuild (`npm run rebuild:node`). `npm test`
does not perform that rebuild.

| Command | Scope |
| --- | --- |
| `npm run test:prepare` | Explicit manual preparation; rebuild the Node native ABI before DB/native tests. |
| `npm test` | Unit partition only (single-run). |
| `npm run test:unit` | Unit partition explicitly (same scope as `npm test`). |
| `npm run test:watch` | Unit partition in watch mode. |
| `npm run test:ui` | jsdom UI partition, single-run. |
| `npm run test:integration` | Integration partition, single-run. |
| `npm run test:ui:slow -- path/to/one.slow.test.ts` | One slow UI file. |
| `npm run test:integration:slow -- path/to/one.slow.test.ts` | One slow integration file. |
| `npm run test:coverage` | Unit partition coverage run. |
| `npm run test:runner-ui` | Vitest dashboard/runner UI (not the UI-owner partition). |
| `node scripts/check-test-partitions.mjs` | Validate discovery, overrides, owner counts, and slow-owner rules. |

## Model-picker mixed split

`npm run test:model-picker:smoke` is intentionally a curated mixed-layer
command. It runs three explicit phases: model catalog/query services (unit),
preference service plus `src/ui-app` picker/composer/AppChatApp behavior (UI),
and the SQLite model-preferences repository (integration). Keep that smoke command
for the end-to-end model-picker scenario, but use `npm test`,
`npm run test:ui`, or `npm run test:integration` when validating one
partition. Do not move all of the model-picker files into one owner merely to
make the smoke command appear homogeneous.

The current phase split is deliberate: unit covers
`src/next/modelCatalog/catalogQueryService.test.ts`,
`src/next/modelCatalog/modelEndpointDetailService.test.ts`; UI covers
`src/next/modelPrefs/modelPrefsService.test.ts`,
`EndpointDetailPanel.test.ts`, `ModelPickerDialog.test.ts`,
`ChatAppComposer.modelPicker.test.ts`, and `AppChatApp.send.test.ts`; the
integration phase covers `infra/db/repo/modelPreferencesRepo.test.ts`.
