# Generation Compiler V2 — Baseline Traceability Matrix

Baseline source: `C:\Users\m1389\OneDrive\Desktop\新建 文本文档.txt` (1,932 lines, read 2026-07-13).

This matrix partitions every normative baseline line from the first architecture decision through the final ADR statement. A row is complete only when its target task package contains current-code evidence, current official evidence where applicable, a normative disposition, files/deletions, data flow or exact request examples, tests, acceptance criteria, risks, and blockers.

## Contiguous coverage partition

| ID | Baseline lines | Baseline subject | Task package / final artifact | Status | Disposition notes |
|---|---:|---|---|---|---|
| BL-01 | 14–40 | Sixteen frozen architecture decisions and provider-neutral architecture basis | TP1–TP8; final plan | Complete | Confirmed core direction; corrected stale vendor/version assumptions and made blockers explicit. |
| BL-02 | 41–113 | Current problem model: overloaded capability, split sources, duplicate owners, missing test seam | TP1, TP3, TP4, TP5, TP7 | Complete | Mapped against main and HEAD transition code with line evidence. |
| BL-03 | 114–161 | Target end-to-end data-flow diagram | TP1, TP5; final plan | Complete | Concrete command/transaction/compiler/prepared-bytes/transport/finalizer chain defined. |
| BL-04 | 162–176 | Unique owner by fact category | TP1, TP3, TP4, TP5 | Complete | Semantic config, capability, codec, bytes, branch projection, and artifact owners frozen. |
| BL-05 | 177–358 | Unified semantic config, inheritance, extensions, reasoning/web/image intent | TP3 | Complete | Closed semantic schema, sparse inheritance, snapshot exclusions, and extension boundary defined. |
| BL-06 | 359–449 | Runtime capability model, evidence precedence, revision, UI/compiler consistency | TP4 | Complete | OpenRouter Images binding is user-owned by credential/model/operation; sole eligible may auto-bind, multiple eligible block, and stale/mismatch revisions never switch endpoint. |
| BL-07 | 450–608 | Compiler entry, ledger, prepared request, serialization, retry/regenerate | TP5 | Complete | Exhaustive disposition, exact bytes, request/attempt ledger, and committed retry semantics defined. |
| BL-08 | 609–647 | Provider Contract Package structure and ownership boundary | TP5, TP6, TP7 | Complete | One closed package per protocol; no generic wire codec. |
| BL-09 | 648–826 | OpenRouter Chat/Images and OpenAI Responses contracts | TP6 | Complete | OpenAI converges existing `effort/summary` only. OpenRouter Images freezes user-owned persistent binding, sole-eligible auto-bind, explicit multiple-candidate selection, stable display-only ordering, exact pinning, stale/mismatch codes, option cleanup and no fallback/switch. Gate 0 blocker closed. |
| BL-10 | 827–910 | Anthropic thinking, sampling, web, continuation, image capability | TP7 | Complete | Official model-rule requirement and native continuation frozen; matrix is Goal 2 prerequisite. |
| BL-11 | 911–1048 | Gemini Interactions/GenerateContent, search, images, protocol binding, continuation | TP7 | Complete | Owner-frozen provider contract owns `v1beta`; separate codecs have no version table or fallback. |
| BL-12 | 1049–1112 | DeepSeek official and Generic/OpenAI-compatible/local contracts | TP7 | Complete | DeepSeek stable is fixed to `https://api.deepseek.com` + `/chat/completions` and `/models`, never `/v1`; stable rejects Beta-only tool `strict` without switching contracts, while thinking tools preserve ordered native reasoning/tool history and reject every explicit thinking `tool_choice` until exact-body smoke proves a value. LM Studio 0.4.19+ Responses-first qualification fixes `lmstudio-openresponses` after complete item/branch/restart/tool/SSE proof; transient/inconclusive failure leaves the endpoint unbound, while only a repeatable contract failure can lead to a separate explicit Chat qualification. Runtime fallback and ordinary `/api/v1/chat` are forbidden. |
| BL-13 | 1113–1242 | Destructive workspace epoch reset, scope, credential preservation, journal, safety | TP2 | Complete | Full store/root/credential/temp/partition boundary and safe coordinator defined. |
| BL-14 | 1243–1309 | V2 config, generation snapshot, provider continuation persistence | TP3 | Complete | Fresh table ownership, hashes, blob references, transaction timing, and exclusions defined. |
| BL-15 | 1310–1345 | UI architecture and capability projection | TP4 | Complete | Same capability revision, stale rejection and incompatible-value display; OpenRouter Images shows current binding first and code-point sorts remaining candidates for display only. |
| BL-16 | 1346–1457 | Target directory/package layout | TP1–TP8; final plan | Complete | Concrete target paths supplied per package and sequenced in final plan. |
| BL-17 | 1458–1493 | Mandatory legacy deletion list | TP1, TP8 | Complete | Expanded to symbol/path/key/table/fixture zero-residual audit. |
| BL-18 | 1494–1695 | Eleven test/acceptance layers and required quality gates | TP8 | Complete | Twelve executable layers, ABI order, live/package smoke ownership defined. |
| BL-19 | 1698–1753 | Forty-two final acceptance conditions | TP8; final plan | Complete | AC-01…AC-42 expanded; AC-18/19 official-evidence corrections and AC-24 observed-routing correction retain the original numbering. |
| BL-20 | 1756–1780 | Fourteen-step atomic production cutover | TP8 | Complete | One-release cutover, epoch-before-startup, and rollback isolation defined. |
| BL-21 | 1781–1887 | Goal 1/2/3 handoff, deliverables, implementation dependencies, risk review | Final plan; Goal 3 input | Complete | Eight package artifacts and Goal 3 review inputs produced. |
| BL-22 | 1888–1906 | Twelve named risks and controls | TP2, TP4, TP5, TP6, TP7, TP8 | Complete | Severity, trigger/control, prerequisites, and release blocking consolidated. |
| BL-23 | 1907–1917 | Final ADR statement | Final plan | Complete | Corrected final ADR supplied in final plan. |

Coverage rule: the union of `BL-01` through `BL-23` is the continuous normative interval 14–1917. Lines 1–13 are title/context; lines 1919–1932 are the baseline author's status note and source-link definitions and are captured as evidence metadata, not normative requirements.

## Explicit acceptance IDs

`AC-01` through `AC-42` are expanded individually in [TP8](./tp8-cutover-tests-goal3.md#corrected-acceptance-matrix). AC-18 limits OpenAI reasoning to verified `effort/summary`. AC-19 fixes Gemini at provider-owned `v1beta`. AC-24 freezes OpenRouter Images user selection plus providerTag/providerSlug/revision/digest/selection-origin persistence, stable display ordering, exact pin, descriptor options and failure codes. AC-25/26 freeze DeepSeek stable endpoints, rejection of Beta-only tool `strict` and thinking `tool_choice`, and complete native reasoning/tool history. AC-27 freezes LM Studio Responses-first qualification and no runtime protocol fallback. All remaining IDs retain their baseline intent.

## Coverage status

- Normative line-range inventory: **100% assigned**
- Evidence-complete rows: **23 / 23**
- Final acceptance dispositions verified: **42 / 42**
- Unassigned normative baseline lines: **0**
- Baseline-to-package/artifact coverage: **100%**
- Implementation acceptance executed: **0 / 42** (Goal 2/Goal 3 responsibility; Goal 1 is plan-only)
