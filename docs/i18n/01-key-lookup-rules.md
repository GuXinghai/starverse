# i18n Key Lookup Rules

> Canonical reference for `t()` key resolution, namespace constraints, and test isolation.

---

## 1. Lookup Priority

`t(key, locale, fallback, namespace)` resolves keys in this order:

### Phase 1: Namespace auto-detection (primary)

If `key` contains a dot and the first segment matches a registered namespace name, the prefix is extracted as the namespace and the remainder is looked up in that namespace.

```
t('settings.title', 'zh-CN')
  → candidateNs = 'settings' (registered)
  → innerKey = 'title'
  → lookup(getMessages('zh-CN', 'settings'), 'title')
  → '设置'
```

### Phase 2: Full key in explicit namespace (fallback)

If Phase 1 does not match (no dot, or prefix is not a registered namespace), the full key is looked up in the explicitly provided namespace (default: `'common'`).

```
t('ok', 'zh-CN')
  → no dot → skip Phase 1
  → lookup(getMessages('zh-CN', 'common'), 'ok')
  → '确定'
```

### Phase 3: Return raw key

If both phases miss for both locale and fallback, the raw key string is returned.

```
t('nonexistent.key', 'zh-CN', 'en-US')
  → 'nonexistent.key'
```

---

## 2. Key Format Examples

| Key | Resolution | Result |
|---|---|---|
| `'ok'` | Phase 2: common.ok | `'确定'` |
| `'common.ok'` | Phase 1: ns=common, key=ok | `'确定'` |
| `'settings.title'` | Phase 1: ns=settings, key=title | `'设置'` |
| `'navigation.project.title'` | Phase 1: ns=navigation, key=project.title | `'项目'` |
| `'settings'` | Phase 2: common.settings (flat key) | `'设置'` |
| `'nonexistent'` | Phase 3: raw key | `'nonexistent'` |

---

## 3. Namespace Constraints

### Registered namespaces

- `common` — shared UI vocabulary
- `settings` — settings panel
- `navigation` — project/conversation management
- `composer` — chat input area

### Reserved prefixes for common namespace

`common.json` must NOT contain nested key paths starting with these prefixes:

- `settings.*`
- `navigation.*`
- `composer.*`
- `filePipeline.*`
- `errors.*`
- `diagnostics.*`

**Reason:** With namespace-detection-first lookup, a common key like `settings.title` would be intercepted as `ns=settings, key=title`, silently shadowing the intended common lookup.

**Allowed:** Flat keys like `"settings": "设置"` in common.json are acceptable — they have no dot, so Phase 1 does not trigger.

**Enforced by:** `localeKeyConsistency.test.ts` → `'common namespace has no nested keys with reserved namespace prefixes'`

---

## 4. Test Isolation

### Problem

`currentLocale` and `currentPrefs` are module-level singleton refs in `index.ts`. Without explicit reset, tests in different files can pollute each other's locale state, causing `t()` to return raw keys when the locale is set to a state where messages aren't loaded.

### Solution

Use `resetI18nForTests()` in `beforeEach`:

```ts
import { resetI18nForTests } from '@/shared/i18n'

beforeEach(() => {
  resetI18nForTests()
})
```

This resets:
- `currentLocale` → `DEFAULT_LOCALE` ('zh-CN')
- `currentPrefs` → `{ mode: 'manual', uiLocale: 'zh-CN', fallbackLocale: 'en-US' }`

### Required in

- All `src/shared/i18n/**/*.test.ts` files
- Any test file that calls `t()`, `tf()`, `setLocale()`, `applyLanguagePrefs()`, or renders components that use i18n
- `ChatMessageBubble.test.ts`, `SettingsPanel.test.ts`, `ComposerCapabilityChip.test.ts`

---

## 5. getMessages() Behavior

`getMessages(locale, namespace)` returns the inner content of a namespace bundle, stripping the outer wrapper.

```
JSON file: { "common": { "ok": "确定", ... } }
Registry:  messageRegistry['zh-CN']['common'] = { "common": { "ok": "确定", ... } }
getMessages('zh-CN', 'common') → { "ok": "确定", ... }  // wrapper stripped
```

The stripping logic: `bundle[namespace]` if it exists and is an object, otherwise `bundle` itself.
