# i18n Documentation Index

Starverse supports bilingual localization: **zh-CN** (Simplified Chinese) and **en-US** (American English).

## Quick Reference

| Item | Value |
|---|---|
| Supported locales | `zh-CN`, `en-US` |
| Default locale | `zh-CN` |
| Fallback locale | `en-US` |
| Persistence | `electron-store` keys: `language`, `languageManual` |
| Renderer adapter | `src/shared/i18n/index.ts` (Vue reactive) |
| Main process adapter | `electron/i18n/mainI18n.ts` (Vue/DOM-free) |

## Documents

| File | Description |
|---|---|
| [00-i18n-integration-survey.md](./00-i18n-integration-survey.md) | Initial codebase survey (task pack 0) |
| [01-key-lookup-rules.md](./01-key-lookup-rules.md) | Key lookup priority, namespace constraints, test isolation |
| [02-i18n-coverage-and-hardcoded-scan.md](./02-i18n-coverage-and-hardcoded-scan.md) | Coverage gate, hardcoded scan, SendPlan code mapping |
| [03-i18n-final-closeout.md](./03-i18n-final-closeout.md) | Final status, completed scope, deferred items, extension rules |

## Scripts

```bash
# Check locale key coverage (namespace/key/param consistency)
npm run i18n:check

# Scan for hardcoded UI text
npm run i18n:scan-hardcoded

# Validate SendPlan issue code → i18n mapping
npm run i18n:sendplan-map
```

## Namespaces

| Namespace | Scope | File |
|---|---|---|
| `common` | Shared UI vocabulary (OK, Cancel, Save, etc.) | `common.json` |
| `settings` | Settings panel | `settings.json` |
| `navigation` | Project/conversation management | `navigation.json` |
| `composer` | Chat input area | `composer.json` |
| `sendPlan` | Send plan status, attachment blocking | `sendPlan.json` |
| `errors` | Provider errors, attachment feedback, model catalog | `errors.json` |
| `diagnostics` | Detection engine status | `diagnostics.json` |
| `filePipeline` | File detection states, flags, routes | `filePipeline.json` |
| `dialogs` | Native Electron dialog strings | `dialogs.json` |

## Key Lookup

Keys use dot-separated paths with automatic namespace detection:

```
t('settings.title')     → ns='settings', key='title'
t('common.ok')          → ns='common', key='ok'
t('ok')                 → ns='common' (default), key='ok'
```

See [01-key-lookup-rules.md](./01-key-lookup-rules.md) for full rules.

## Adding New Keys

1. Add key to both `zh-CN/*.json` and `en-US/*.json`
2. Add type to `messageSchema.ts`
3. Run `npm run i18n:check` to verify consistency
4. Use `t('namespace.key')` in code

## Test Isolation

All i18n tests must call `resetI18nForTests()` in `beforeEach` to prevent locale state pollution between test files.
