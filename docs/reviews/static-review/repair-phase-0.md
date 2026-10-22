# Repair Phase 0: review corrections and owner-policy reclassification

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This phase corrects the static review and applies the six owner decisions to it, before any repair. The plan it publishes is in [repair-plan.md](repair-plan.md).

- No application code was modified. No tests, builds, rebuilds or app launches were run, and no provider or network requests were made.
- Historical phase reports keep their original text. Corrections are recorded here, in a marked addendum to [phase-9.md](phase-9.md) (section 7), and in a marked note at the end of [phase-3b.md](phase-3b.md).
- Every finding remains static evidence. None has been reproduced at runtime.

## 1. Scope and repository state

| Item | Verified value |
|---|---|
| Repository | `D:\Starverse` (`GuXinghai/starverse`) |
| Branch | `codex/basic-operation-exploration-8q02ix`, tracking `origin` |
| HEAD before this phase | `fd5b1896c530fc8715369a216aa7e5514c6666b2`, equal to `origin` after `git fetch` |
| Working tree | Clean except the preserved untracked `world_map_experiment/__pycache__/` |
| Application baseline | `aec217cd`; the review branch adds only `docs/reviews/static-review/` |
| Instructions read | `AGENTS.md` (no `CLAUDE.md` exists), [CLOUD_HANDOFF.md](CLOUD_HANDOFF.md), every phase report, with [phase-9.md](phase-9.md) in full |

**Source re-checked in this phase** (read-only, to correct report claims):
- `infra/db/v2/schemaComposerV2.ts`: digest-mismatch classification (`:419-426`), the pinned predecessor digests (`:22-26`, `:455-465`) and the six additive upgrade functions (`:537-925`).
- `electron/data-epoch/freshEpochDatabaseInitializer.ts:336-347`: the upgrade chain that runs before `installGenerationV2SchemaInActiveTransaction`.
- `electron/data-epoch/schemaMismatchRecovery.ts`, `schemaMismatchRecoveryPrompt.ts` and `electron/epoch2MainEntry.ts:55-74`: consent-gated backup-and-recreate.
- `infra/generation-v2/capabilityRevisionExpectationV2.ts`: the documented fail-open exemption.
- `electron/debug/rawGenerationRequestStore.ts:76-98`: what the request archive stores.
- `electron/preload.ts:291-313`: capability-rule channels.

## 2. Subagents

None were used. This phase is document reconciliation and owner-policy application, which AGENTS.md assigns to the primary agent (owner decisions and phase status are not delegated). The preferred configuration for later phases is unchanged: read-only `Explore` agents with `model: sonnet` and `effort: high`, at most two concurrently, with no nesting. The tool accepts only a model family, so the exact "Sonnet 5.5" version cannot be confirmed.

## 3. Corrections to the review record

### C-01: P4a-06 evidence status restored
Phase 9's Medium register lists P4a-06 as "Confirmed". [phase-4a.md](phase-4a.md) says "Suspected. The real wire format was not checked", with severity "Medium if the wire format is as assumed", and Phase 9 added no new evidence.
- **Corrected:** Suspected. Severity is conditional Medium. The decoder rejection (`providers/anthropic/chatStreamV1.ts:241`) is confirmed; whether Anthropic emits `citations_delta` for web-search answers is not.
- **Before repair:** establish the wire shape from Anthropic's published streaming documentation or a recorded, credential-free fixture. Do not make a live request.

### C-02: P4b-03 and P4b-04 conditions restored
Phase 9 lists both as "Confirmed". [phase-4b.md](phase-4b.md) states:
- **P4b-03:** "The mechanisms are statically confirmed. The specific lost-terminal trigger is suspected." Path 1 (`#persistedPayload` throwing) was not traced to any concrete path. Paths 2 and 3 are code-confirmed.
- **P4b-04:** "Mechanism statically confirmed. Reachability is suspected: the renderer hard-codes `tools: { mode: 'disabled' }` (`appChatApp.logic.ts:7045`)." Severity is "Medium if reachable. Likelihood is low."

Both qualifications are restored. P4b-04 is now a conditional Medium. A repair must first show how an operation reaches `awaiting_tool` with tools disabled (for example, a provider emitting a tool call anyway), or else be treated as a hardening change.

### C-03: other overstated "Confirmed" labels in the Medium register
The same check against the source reports found more qualifications that Phase 9 dropped:

| ID | Phase 9 label | Original qualification |
|---|---|---|
| P2a-01 | Confirmed | Statically confirmed; crash timing requires runtime verification |
| P4a-04 | Confirmed | Logic confirmed; the trigger depends on the server sending the trailing usage chunk |
| P4a-05 | Confirmed | Logic confirmed; depends on servers emitting CRLF that straddles a read boundary |
| P4b-01 | Confirmed | Confirmed; the window depends on main-process latency |
| P4b-02 | Confirmed | Mechanism confirmed; triggers suspected |
| P5b-02 | Confirmed | Control flow confirmed; the `data:` URL length limit is suspected |
| P6a-02 | Confirmed | Confirmed; needs `getProxyConfiguration()` to reject, frequency unknown |
| P8-04 | Confirmed from config | Unchanged; still needs `vitest list` |

Phase 9 section 7.2 carries the corrected labels.

### C-04: schema-change boundary (I2a-02 and the RC-01 wording)
I2a-02 says "any future `DB_SCHEMA_VERSION` change forces every upgrading user through backup-and-recreate". Phase 9 repeats this in section 4.3. The current source is narrower:

- **Reviewed predecessors upgrade in place.** `freshEpochDatabaseInitializer.ts:336-347` runs six additive upgrades in one transaction before installing the schema:
  - Gemini thinking semantics;
  - composer edit session (three pinned predecessor digests: LF, CRLF and mixed);
  - interrupted replay;
  - request contract, including the pre-capacity contract (three pinned digests);
  - request rules;
  - OpenAI image output.
- **Only an unrecognised digest is a mismatch.** `schemaComposerV2.ts:419-426` then raises `GENERATION_V2_SCHEMA_DIGEST_MISMATCH`.
- **The mismatch path asks first and backs up.** `epoch2MainEntry.ts:55-74` shows a two-button dialog whose default is "退出" (quit). On consent, `schemaMismatchRecovery.ts` renames the database family into a timestamped backup and regresses the journal so the next start recreates the database. Nothing is deleted silently, in development or packaged builds.
- **One exception skips the dialog.** `SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH=1` approves recovery with no prompt, and nothing restricts it to non-packaged builds (`schemaMismatchRecoveryPrompt.ts:20-38`). This is now repair item R2-03 under owner decision 2.

**Corrected statement:** only a schema that is neither current nor one of the reviewed predecessors leads to the consent-gated backup-and-recreate. There is no general migration framework, and decision 2 defers one. RC-01 still matters: a line-ending-dependent digest turns an identical schema into an "unrecognised" one, which is a false mismatch (P2b-01).

### C-05: counting rules
The arithmetic 214 → 206 is correct: eight merged P-IDs (P7-01, P7-02, P7-10, P8-01, P4a-02, P3a-03, P1-10, P6b-13). I7-06 was also merged but is Info and was never counted. The total mixes evidence classes, however, and includes one resolved item. From now on:

- **Counted:** `P*` IDs only. `I*` (Info and owner decisions) and `U5a-01` are listed but not counted.
- **Reported:** 214 IDs, as written in Phases 0–8.
- **Unique:** 206, after the eight merges.
- **Active register:** 205. P0-03 is historical, resolved by P7-11, and stays in the record without counting as open.
- **Evidence classes** for the 206 unique IDs. These are coordinator classifications from each report's status text, so the boundaries are judgment calls, but each ID is listed so the split can be audited.

| Class | Meaning | Count | IDs |
|---|---|---|---|
| A | Statically confirmed defect, with no stated runtime precondition | 132 | All IDs not listed below |
| B | Mechanism confirmed; trigger, reachability or magnitude unverified | 27 | P1-04, P1-11, P1-12, P2a-01, P2b-01, P2b-02, P2b-03, P2b-06, P2b-10, P2b-12, P3b-19, P4a-04, P4a-05, P4a-13, P4b-01, P4b-02, P4b-03, P4b-04, P4b-05, P4b-07, P5b-02, P6a-02, P6b-01, P6b-05, P6b-10, P6b-11, P8-04 |
| S | Suspected; needs reproduction or external evidence before repair | 32 | P1-05, P1-13, P2a-08, P2a-11, P2a-12, P2a-13, P2a-14, P2b-05, P2b-11, P3a-05, P3a-06, P3a-08, P3a-12, P3a-14, P3a-16, P3a-24, P3a-26, P3b-07, P3b-09, P3b-10, P3b-11, P3b-13, P3b-17, P4a-06, P4a-10, P4a-11, P4a-18, P4b-10, P4b-11, P4b-12, P4b-16, P6a-11 |
| L | Latent: the code is confirmed, but there is no current producer or caller, or the feature is disabled | 7 | P1-02, P2a-04, P3a-21, P3b-06, P3b-14, P7-05, P8-05 |
| M | Maintainability, dead code or build hygiene | 7 | P0-01, P0-02, P2b-13, P3b-18, P3b-20, P8-15, P8-16 |
| H | Historical, resolved | 1 | P0-03 |

**Policy overlay:** owner policy can change what a finding requires regardless of its class. Section 4 lists the affected IDs.

**Severity totals** remain those of Phase 9 (38 Medium, 64 Low-Medium, 104 Low), except for the policy regrades in section 4: P2b-07 goes from Medium to Low-Medium and P3a-09 from Low-Medium to Medium, so the totals are unchanged. The conditional Mediums (P4a-06, P4b-04) are counted as Medium and marked as conditional.

### C-06: coverage reconciled by path
Phase 9 section 4.5 merged every report's "Not covered" list without checking whether a later phase reviewed the path. Checked path by path:

| Path | Listed open by | Actually reviewed by | Corrected status |
|---|---|---|---|
| `electron/net/electronManualRedirectFetch.ts` | 4a | 5b (Full; `:25-26` cited in P5b-03) | Reviewed |
| `operationSenders` cleanup in `textGenerationV2IpcCore.ts` | 4a | 4b (P4b-06, resolves I4a-09) | Reviewed |
| OpenRouter chat compiler, `openrouter/chatRequestV1.ts` | 3b | 4a (Full) | Reviewed |
| `openRouterCategoryCache.ts` | 3a | 7 (I7-01: dead code; constants only) | Reviewed |
| `infra/files/electronOfficialPackageTransport.ts` | 5a | 7 (Targeted; P7-06) | Reviewed (targeted) |
| Packaging scripts and CI | 5a | 8 (Full) | Reviewed |
| Electron fuses, ASAR integrity, builder hardening | 7 | 8 (P8-02) | Reviewed |
| CSP `img-src` for `data:` URLs | 5b | 7 (CSP Full; P7-04) | Reviewed |
| `inappBrowser.ts` and agent windows | 6b | 7 (window creation and handlers Full; P7-05) | Reviewed (handlers) |
| `productNetworkProxyV2.ts` / `electronSessionProxyController.ts` | 6a (main-side proxy handlers) | 7 (Targeted) | Partly reviewed. Credential handling beyond the redaction points stays open |
| `scripts/gates/privacy-scan.mjs` | 8 | 7 (extensions and encoding gaps; P7-11) | Partly reviewed. Internals beyond P7-11 stay open |
| `native/epoch-win32/src/addon.cc` blob I/O | 5b | 2a (size limits, `.svtmp` temp files, reparse rejection) | Partly reviewed. Write atomicity and symlink race stay open |
| `ModelPickerDialog.vue` | 3a | 6a (up to template line 2420) | Partly reviewed. The template after line 2420 stays open |

The corrected open-coverage list is in phase-9.md section 7.4. No other path in section 4.5 was found to be reviewed later.

### C-07: misreferenced IDs in Phase 3b's verification summary
[phase-3b.md](phase-3b.md) section 2 lists coordinator checks for "P3b-09" and "P3b-08". Their evidence belongs to other findings:
- "P3b-09 (`apiRequestBodySchemaV2.ts:137` … own-property check)" is **P3b-14**. P3b-09 is the DeepSeek `reasoning_content` replay, which stays Suspected.
- "P3b-08 (`generationV2ComposerIpc.ts:144, 162`)" is **P3b-05** (`readFile` at `:144`) and **P3b-06** (`rm(path.dirname(...))` at `:162`). P3b-08 is the portable-history flattening.

The finding bodies are correct; only the summary labels are wrong. A marked note is appended to phase-3b.md. No severities change. P3b-08 and P3b-09 have no coordinator verification beyond their own rows.

## 4. Owner decisions applied (reclassification)

The decisions are numbered D-1 to D-6 in [repair-plan.md](repair-plan.md) section 1. Effects on the register:

| ID | Previous | Reclassified as | Decision | Still required |
|---|---|---|---|---|
| I2a-01 (legacy purge on first epoch-2 start) | Owner question | Accepted for development data | D-1, D-2 | Must not run unattended in a formal release (R2-03). See OQ-2 |
| I2a-02 (no migration path) | Design risk | Corrected per C-04; a general migration framework is deferred | D-2 | Keep the reviewed predecessor upgrades working (R2-01 regression) |
| P2a-02 (recovery consent text) | Medium | Unchanged: a defect regardless of policy | D-2 | The text must state exactly what moves to the backup, and where |
| P2a-03, P3a-16, P2a-11 (legacy upgrade paths) | Medium / Low | Policy-dependent: relevant only if a formal release shipped the legacy layout | D-1 | Deferred until OQ-2 is answered; no repair this round |
| I4a-01 (no generation timeouts) | Owner question | Deferred by owner | D-3 | Nothing. Download and probe bounds (P5b-03, P1-12, P3a-10, P3a-11, P5a-10, P5b-12) are not waived |
| I4a-07 (orphan recovery blocks startup) | Intentional | Superseded: isolate failures; restricted mode only when integrity is unknown | D-4 | R2-06 |
| P2b-05 | Low-Medium, Suspected | Repair target under D-4 | D-4 | Reproduce with a corrupt-artifact fixture first |
| P3a-07, P5b-13, P3a-04 (one bad row or field disables a whole feature) | Low-Medium / Low | Repair targets under D-4 | D-4 | Phases 4 and 5 |
| P2b-07 (raw store grows without limit) | Medium | **Low-Medium.** Retention is intended. Residual: storage cost, explicit user deletion, and the deletion-scope question OQ-1 | D-5 | Phase 7 (R7-01–R7-04). No expiry, truncation or default-off |
| P7-03 (capture always on; IPC readable) | Low-Medium | Always-on capture is intended. Residual: synchronous main-thread cost and the IPC access boundary (sender and frame check, not a debug gate) | D-5 | Phase 7 |
| P2a-09, P7-07 (redaction unwired; raw errors in logs) | Low | Unchanged: transport credentials must stay out of logs and archives | D-5 | Phase 6 (R6-09). User-authored request content is not redacted |
| Phase 9 Wave 4 item 1 ("gate raw capture behind a debug setting with retention and conversation-delete purge") | Repair direction | **Withdrawn** | D-5 | Replaced by Phase 7 |
| I3a-05, I3b-05 (revision check fails open without context) | Info | Intended, documented exemption retained | D-6 | Add an inventory test that every user-facing command entry installs the context (R4-07) |
| P3a-09 (provider facts published before commit and for unaccepted snapshots) | Low-Medium | **Medium:** staged data becomes effective before activation | D-6 | Phase 4 |
| P3a-22 (cloud activation drops a user "off" override) | Low | Repair target: preserve valid user choices | D-6 | Phase 4 |
| P3a-01 (no authenticity check; bootstrap auto-applies) | Medium | Unchanged security finding. Bootstrap auto-activation is recorded as OQ-4, not a blocker | D-6 | Phase 6 |
| Silent clamping (P3b-02's `anthropicReasoningV2` budget clamp, P6a-11) | Medium / Low | Repair direction changed: report a conflict, never clamp silently | D-6 | Phase 4 |

**New requirement with no existing finding:** D-6's proactive refresh after a rule set becomes effective. The review found no push event for capability-rule activation. `electron/preload.ts:291-313` exposes only invoke channels for capability rules, so whether projections and pending sends refresh today is unknown. Phase 4 begins with a mapping step (R4-01) before any change.

## 5. Uncertainties

- The class boundaries in C-05 are judgment calls, not re-derived from source.
- C-06 checked only the paths named in Phase 9 section 4.5 against later scope tables. A path a later phase read incidentally but did not list could still be marked open.
- OQ-1 to OQ-4 (repair-plan.md section 6) are recorded, not answered. None blocks the next phase.
- Whether any formal release of Starverse exists determines how much of the release guard (R2-03) is live risk rather than prevention (OQ-2).

## 6. Next phase

**Repair Phase 1: verification foundations** (repair-plan.md section 3, Phase 1):
- Confirm what each Vitest configuration actually runs (`vitest list`) and fix partition ownership (P8-04, P8-05).
- Make pushes to `main` run every partition, and widen PR scope for shared-core paths (P8-03).
- Add expected-failure regression tests (`it.fails`, tagged with the finding ID) for the deterministic Phase 2 and Phase 3 defects.

It requires `npm run rebuild:node` under the AGENTS.md ABI policy and runs only scoped tests. Implementation would go on a new branch, proposed as `codex/static-review-repairs`, cut from this branch's tip.

This phase is complete. I have stopped and am waiting for your instruction to continue.
