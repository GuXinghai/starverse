# i18n Final Closeout

## Current Status

**Supported languages:** zh-CN (Simplified Chinese), en-US (American English)

**Infrastructure complete.** Core UI migrated. Gates and scans established.

## Completed Scope

### Infrastructure (Task Packs 0-2)
- Locale registry, matcher, formatters
- Message schema with TypeScript types
- Vue-reactive renderer adapter (`src/shared/i18n/index.ts`)
- Main process adapter (`electron/i18n/mainI18n.ts`)
- electron-store persistence (`language` / `languageManual`)
- System/manual locale mode
- Test isolation (`resetI18nForTests`)

### Namespaces (Task Packs 3-7)
| Namespace | Keys | Status |
|---|---|---|
| `common` | 45 | Complete |
| `settings` | 48 | Complete |
| `navigation` | 20 | Complete |
| `composer` | 17 | Complete |
| `sendPlan` | 36 | Complete |
| `errors` | 36 | Complete |
| `diagnostics` | 8 | Complete |
| `filePipeline` | 21 | Complete |
| `dialogs` | 30 | Complete |

### Migrated Components
- SettingsPanel (full)
- SettingsModal (title, close)
- ProjectSidebar (full CRUD)
- ConversationList (full CRUD)
- ChatAppComposer (placeholder, buttons, chips, attach menu)
- ComposerCapabilityChip (labels, titles)
- ChatMessageBubble (generating, sections, preview)
- ChatTranscript (generating, empty state)
- ChatReasoningPanel (encrypted, summary)
- appChatApp.logic.ts (SendPlan gates, attachment feedback, error hints, send mode labels, model catalog notices)
- Electron main.ts (showErrorBox)
- Electron mainWindow.ts (showErrorBox)
- Electron imageIpc.ts (dialog titles, filters, errors)
- Electron shellIpc.ts (error messages)
- Electron dialogIpc.ts (filter names)

### Gates & Scans
- `npm run i18n:check` — locale key coverage gate
- `npm run i18n:scan-hardcoded` — hardcoded UI text scanner
- `npm run i18n:sendplan-map` — SendPlan issue code mapping validation

## Deferred Scope

### Not Migrated (by design)
- **ModelPickerDialog** (~1545 lines) — complex model picker UI
- **PluginManagementPanel** (~784 lines) — plugin lifecycle UI
- **WebSearchSettingsEditor** (~420 lines) — search settings sub-component
- **SamplingParamsSettingsEditor** (~264 lines) — sampling params sub-component
- **appChatApp.logic.ts internal debug strings** — `dbBridge unavailable`, `model catalog sync failed` (not user-visible)
- **Provider raw error messages** — shown as sanitized fallback only
- **IPC error messages in dbBridge.ts / openRouterStreamBridge.ts** — technical errors

### Not Implemented (out of scope)
- ja-JP support
- RTL layout
- Online translation
- AI reply language preference
- Custom Electron menu localization
- Community translation platform
- User-customizable language packs

## Extension Rules

### Adding a New Locale
1. Create `src/shared/i18n/locales/{locale}/` directory
2. Copy all JSON files from `en-US/`
3. Translate values (keep keys identical)
4. Add locale to `SupportedLocale` type in `localeTypes.ts`
5. Add to `SUPPORTED_LOCALES` in `localeRegistry.ts`
6. Register in `messageRegistry` in both `index.ts` and `mainI18n.ts`
7. Run `npm run i18n:check`

### Adding a New Namespace
1. Create `{namespace}.json` in both `zh-CN/` and `en-US/`
2. Add `{Namespace}Messages` interface to `messageSchema.ts`
3. Add to `AllMessages` extends list
4. Register in `messageRegistry` in both `index.ts` and `mainI18n.ts`
5. Add to `EXPECTED_NAMESPACES` in `check-i18n-coverage.mjs`
6. Add to `RESERVED_NS_PREFIXES` if it should be forbidden in `common.json`
7. Run `npm run i18n:check`

### Adding Keys to Existing Namespace
1. Add key to both `zh-CN/{ns}.json` and `en-US/{ns}.json`
2. Add to `{Ns}Messages` interface in `messageSchema.ts`
3. Run `npm run i18n:check`

### Migrating Hardcoded Strings
1. Identify user-visible string in component
2. Add i18n key to relevant namespace JSON (both locales)
3. Replace string with `t('namespace.key')` call
4. If parameterized: use `tf('namespace.key', { param: value })`
5. Update test assertions if they match the old string
6. Run `npm run i18n:check` and `npm run i18n:scan-hardcoded`

## Architecture Notes

### Renderer vs Main Process
- **Renderer** (`src/shared/i18n/index.ts`): Uses Vue `ref`/`reactive` for locale state. `t()` reads `currentLocale.value` by default.
- **Main process** (`electron/i18n/mainI18n.ts`): No Vue dependency. `t()` reads module-level `currentLocale` variable. Initialized via `initMainI18n(store)`.

### Key Lookup Priority
1. Namespace auto-detection from key prefix (`settings.title` → ns=`settings`)
2. Full key in explicit namespace (`ok` → common)
3. Fallback locale
4. Raw key returned

### Common Namespace Constraint
`common.json` must NOT contain nested keys with reserved namespace prefixes (e.g., `settings.title`). Flat keys like `settings` are allowed. Enforced by `npm run i18n:check`.

## Verification Commands

```bash
# Full i18n test suite
npx vitest run src/shared/i18n
npx vitest run electron/i18n/mainI18n.test.ts
npx vitest run src/next/settings/languagePrefs

# Coverage and scan gates
npm run i18n:check
npm run i18n:scan-hardcoded
npm run i18n:sendplan-map

# Full typecheck
npx vue-tsc --noEmit
```
