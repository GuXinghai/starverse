# Visible Product Gap Investigation — Summary

**Status**: historical
**Document Role**: evidence-report, candidate-action-list
**Last updated**: 2026-10-13

HEAD `c076df0f` (branch `models-dev-capability-resolution`), 2026-10-06. Static, read-only. Investigation only; no production code changed.

## Method
Six read-only Haiku 4.5 scans (settings; models/providers; conversations/search; attachments/DFC; errors/recovery; i18n/a11y) produced ~55 candidates. The main thread re-read the evidence for each retained item against HEAD, dropped duplicates, stale/speculative/internal items, and downgraded weakly-supported claims. Dropped items and reasons are listed in `findings.json` → `rejected`.

## Overall feel
The core product (chat, branching, model/provider selection, attachments, settings, recovery) feels **functionally complete**; no common flow was found broken, so **0 HIGH**. What remains is a **polish/closure layer**: unlocalized or developer-facing surfaces, a few silent-state moments, and a handful of edge surfaces that look interactive or finished but aren't. The dominant theme is i18n drift — most findings share one root cause: literals bypass `t()` and CI only checks key parity.

## Retained counts
| Severity | Count | IDs |
|---|---|---|
| HIGH | 0 | — |
| MEDIUM | 7 | VPG-01 … VPG-07 |
| LOW | 8 | VPG-08 … VPG-15 |
| **Total** | **15** | |

By category: I18N_OR_ACCESSIBILITY 8 · MISLEADING_UI 2 · BACKEND_WITHOUT_UI 2 · STATE_OR_PERSISTENCE_MISMATCH 1 · DEVELOPMENT_RESIDUE 1 · ERROR_RECOVERY_GAP 1.

## Top priorities
1. **VPG-01/02 Search modal** — most-used surface with fully unlocalized text, no dialog semantics/Esc, and a silent 50-result cap (backend already accepts offset).
2. **VPG-03 "Raw Data" on every assistant message** — debug surface shown as a normal action, English-only. Needs an owner call on audience.
3. **VPG-04/05 Startup native dialogs** — unlocalized/bare-code failure box and Chinese-only config-corruption prompt that decides whether settings/credentials are discarded.
4. **VPG-06 Split save in Settings** — silent save; main Save doesn't cover it.
5. **VPG-07 Inert sent-attachment cards** — look clickable, do nothing, show raw type/confidence.

## Easy closures (existing backend/support suffices)
VPG-01, 02 (offset), 03 (gate/localize), 06, 08, 09, 10 (label), 11, 12, 13, 14 — all UI-only, mostly i18n keys and small template changes. VPG-05/04 are main-process only and can reuse `electron/i18n/mainI18n.ts`.

## Needs product/architecture decisions → defer
- **VPG-07 open/save for sent attachments** — no open-file/save-as handler exists; requires a new main-process capability and security review (file grants). Do only the cosmetic part now.
- **VPG-15 diagnostics export / app menu** — product decision; possibly intentional.
- **VPG-09 localStorage persistence of local endpoint URL** — confirm intent only.
- Runtime-only questions: modal focus trap/restore, startup-failure trigger frequency (VPG-04), DFC error content (VPG-10).

## Close before a new major Goal?
Reasonable to close: VPG-01/02, 03, 05, 06 plus the i18n sweep (VPG-08–13) — small, low-risk, and would make the zh-CN/en-US claim honest. Adding a lint/grep guard for hard-coded `title/placeholder/aria-label` literals and CJK in `.vue` would stop recurrence. Defer VPG-07 backend work and VPG-15.

## Proposed repair order (for discussion)
1. i18n sweep + guard (VPG-01 text, 05, 08, 09, 10, 11, 12) — one PR, mechanical.
2. Search modal behavior (VPG-01 ARIA/Esc, 02 pagination/hint).
3. Raw Data gating decision + implementation (VPG-03, with 15 decision).
4. Settings split-save feedback (VPG-06).
5. Modal semantics & disabled-state explanations (VPG-13, 14).
6. Startup dialogs (VPG-04, 05) — needs one runtime check for 04.
7. Sent-attachment cards: cosmetic cleanup now; open/save as a later Goal (VPG-07).

## Caveats
Static review only; no runtime reproduction. Items marked `runtimeReproNeeded: true` in `findings.json` are VPG-04, 07, 10, 13. Some evidence lines (VPG-12 minor items, VPG-13 attachment dialog, VPG-14 LM Studio/Ollama) are agent-reported and not re-read individually; they are marked as such. ABI/rebuild policy not triggered (no tests run).
