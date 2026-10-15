# Coverage Map — Visible Product Areas (HEAD c076df0f, 2026-10-06)

**Status**: historical
**Document Role**: evidence-report
**Last updated**: 2026-10-13

Status legend: **complete** · **partial** · **visibly incomplete** · **out of scope** · **unknown** (not statically assessable; needs runtime).
Basis: static review only. "Complete" means no current, user-visible gap was found, not that it was exercised at runtime.

| Area | Status | Notes / finding refs |
|---|---|---|
| Chat send / stream / stop / regenerate / branch | complete | Covered by prior closure milestone; no new gaps found. Branch/delete-confirm UX nits rejected as speculative. |
| Conversation list (create/rename/delete/move/bulk/projects/load-more) | complete | Emits full action set. Archive/restore have a client but no handler or UI → treated as not-a-feature. |
| Search | partial | VPG-01 (no i18n/ARIA/Esc), VPG-02 (50-result cap, no hint). Scope/navigation logic itself works. |
| Message actions (copy, retry, citations) | partial | VPG-03 (Raw Data debug button on all assistant messages). |
| Model picker / catalog / provider keys | complete (core) | VPG-14 minor: disabled-state explanations. |
| Local providers (LM Studio / Ollama / local endpoint) | partial | VPG-09 (Chinese-only save, localStorage URL), VPG-14 (title-only disabled reasons). |
| Capability rules / model-facts inspector / source priority | complete (UI exists) | VPG-12 minor a11y strings. Advanced surface; usability for ordinary users not assessed. |
| Settings panels | partial | VPG-06 (split save, no feedback). |
| Draft attachments / DFC | partial | VPG-10 (label, raw errors/codes). Core attach/convert flow present. |
| Sent-message attachments | visibly incomplete | VPG-07 (inert cards, raw type/confidence, no open/save). |
| Engine plugins / plugin management | partial | VPG-08 (English confirms). Lifecycle UI exists. |
| Error display / provider failure details | partial | VPG-11 (raw code in summary bar). Retry paths exist. |
| Startup recovery (workspace) | complete (in-app screen) | WorkspaceStartupRecovery.vue exists with retry. |
| Startup / config-corruption native dialogs | visibly incomplete | VPG-04, VPG-05 (unlocalized, bare codes). |
| Diagnostics / log export | unknown / likely out of scope | VPG-15 product decision. |
| i18n (zh-CN / en-US) overall | partial | Key parity enforced by test; hard-coded literals not enforced — root cause of VPG-01/05/08/09/10/12. |
| Modal/keyboard/focus | partial | VPG-01, VPG-13. Focus trap/restore not statically verifiable → runtime. |
| Native app menu / tray / auto-update UI | unknown | No app menu found in electron/; whether intended not determined. |
| Derivative-job cancel, conversation archive | out of scope (no live path) | Client code without handlers/consumers; not user-facing at HEAD. |
| Image generation settings, project defaults, DFC defaults | unknown | Not deeply assessed; only confirmed to be consumed by app logic. |
| Responsive/narrow-window layout, theming/dark mode | unknown | Not assessed (requires runtime). |
