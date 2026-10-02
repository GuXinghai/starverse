# Second repair wave

Date: 2026-10-03 (Asia/Tokyo). Baseline: `7896ddfbe0c3ca678340baa79475bb78fe00e96d`, branch `models-dev-capability-resolution`.

The user authorized this wave after delivery of the first wave. The first-wave commit contains exactly 41 reviewed paths and no native artifacts. Its closeout/validation files describe the pre-commit acceptance snapshot. Existing `.codex/config.toml`, `pelican-bicycle.html`, and other audit drafts remain outside delivery.

## Order and ownership

1. SV-PGA-006: native web-search contract closure.
2. SV-PGA-007: DOCX PDF selection.
3. SV-PGA-011: workspace startup recovery.
4. SV-PGA-009: Rules/Inspector semantic refresh.
5. SV-PGA-010: historical search navigation.

The accepted boundaries in `../product-gap-repair-20261003/NEXT-PLANS.md` remain authoritative. Each implementation begins only after its current execution path and concrete contract have been reviewed. Mapping of 006, 007 and 011 runs concurrently. Mapping of 009 and 010 prepares later independent changes. No child agent may spawn another agent.

The renderer worker is the only writer of `src/ui-app/app/appChatApp.logic.ts` and `src/ui-app/AppChatApp.vue`. Other workers deliver independently owned services/helpers/components and explicit integration contracts. Shared renderer integration is sequential. The coordinator owns architecture, security boundaries, acceptance strategy and final closure decisions.

## Preserved invariants

- Persisted template ownership defines Inbox; no recency/name fallback.
- Atomic workspace transactions and foreign-key integrity remain enforced.
- Draft/edit mutation identity, CAS, attachment continuation and navigation publication guards from the first wave remain enforced.
- Capability/provider operation registries remain the authority; strict request compilers are not weakened.
- Derived attachment selection uses persisted producer/output provenance.
- Retry uses immutable generation snapshots; new sends require current semantic authority.
- Recovery never resets a database, reconstructs deleted state or silently converts failure into empty state.
- Search navigation only exposes eligible visible branch-route content.

## Validation and delivery

Use isolated synthetic databases/bridges/assets and transport stubs. No real profile, credentials, provider requests, Cloud Apply or runtime installation. Database-heavy tests retain the Node ABI; the coordinator runs the required Node rebuild before this wave's DB acceptance. Runtime DOCX smoke is conditional on already available managed runtime/build prerequisites, with unavailable prerequisites reported explicitly.

Each goal receives production-shaped regressions, scoped tests, read-only risk review and relevant type/authority/privacy validation. Shared renderer changes also run first-wave scope/attachment/send/retry regressions. No second-wave commit is included in this authorization; the final diff remains reviewable.

## Temporary cleanup

The user authorized exact file cleanup. Automatic approval review rejected a nonrecursive `Remove-Item -LiteralPath` attempt for the two source-only first-wave scratch scripts before execution (`blocked by policy`). They and the predecessor scratch directory remain retained; no alternate executor or broader deletion was attempted. Cleanup is outside functional closure.

## Concrete contract reviews

### 006 — capability-bound native web semantics

Current mapping confirms the UI builder universally emits legacy max-results/context while native contracts differ: Anthropic accepts max-results 1..20 and excludes context/engine; Gemini GenerateContent accepts mode/types without those extras; Responses exposes resolved context; OpenRouter retains its encoded fields.

One helper projects controls and builds newly authored UI semantics from the exact selected capability binding and registered protocol/operation domains. Unsupported inherited legacy defaults are omitted; explicit unsupported settings or nonempty persisted semantic rows remain rejected visibly by strict authority/compiler checks. Send does not rewrite existing explicit semantic rows through the lossy depth projection. No provider-ID-only field authority, compiler weakening or automatic retry is added.

Optional selected-contract limits are passed through native conversation normalization/resolution/editor serialization to preserve Anthropic 1..20. Legacy/global defaults retain their existing limits. Disabled web semantics and Gemini Interactions image search retain their current contracts. Retry compiles frozen persisted execution semantics.

Renderer worker owns the helper, console/editor, optional normalization parameters, shared app integration and focused tests. Acceptance uses mounted UI semantics through actual prepared coordinators with isolated SQLite authorities and stub transport, covering provider matrix, explicit unsupported rows, max 20, image exception and frozen retry. Coordinator reviewed these boundaries before authorizing production edits.

Actual-service acceptance exposed an authority seam absent from domain-rich fixtures: Goal 3 support facts intentionally have no runtime parameter domain, and optional web parameters remain unknown. Add a pure registered protocol-parameter module (exact provider/contract/operation) for types and the UI's max-results/engine/context fields. These are wire bounds, not model claims. Renderer intersects explicit model domains when present, preserves unknown states and the existing encoder-covered unknown-attempt policy, and rejects unsupported/conflict/missing fields. Native authority literals reuse the reviewed wire domains; actual prepared compilers enforce the same parameter bounds without weakening existing validation. Encoding coverage and frozen encoder revisions remain unchanged.

The operation-aware `web.types` ontology projection must follow `search.web.support` for text, preserving the existing image-operation mapping to `search.image.support`. Presentation source paths use the same operation context. This fixes ordinary web search when image search is unsupported. Stored runtime fields and frozen snapshots are never reprojected or rewritten; add round-trip proof. The coordinator owns the pure contract/projection/backend boundary; renderer worker consumes it after review. Responses context remains its existing bounded open string, with familiar UI presets as choices rather than a fabricated complete model enum.

Actual prepared-request acceptance also exposed a Responses assembly mismatch: the prepared compiler passed wire-shaped `search_context_size`/`filters` into a strict codec that accepts semantic `searchContextSize`/`allowedDomains` and performs wire encoding itself. The coordinator verified both sides and approved a narrow internal DTO correction. It retains the existing codec validation, intended wire output, consumption ledger and encoder revisions. Native fixtures must satisfy existing non-web prerequisites rather than weakening those contracts.

The strict Responses codec also accidentally rejected an absent optional `allowedDomains` because its duplicate check compared zero with undefined. The approved correction guards that duplicate check by presence; supplied malformed or duplicate domains remain rejected. Add actual prepared-request proof with the optional field absent as well as present.

### 007 — observed derived-output selection

Current-path mapping confirms `GenerationV2DfcService.select` uses the HTML producer for every PDF, although DOCX conversion persists `starverse-dfc-docx-pdf-v1`. Existing `dfc_conversion_output_v2` and immutable asset revisions already provide the required authority; no schema change is needed.

A ready V2 option will expose `DfcReadyOptionBindingV2`: source asset ID/revision/hash, target kind, effective asset ID/revision/hash, and recorded producer contract/revision/settings digest (null for original source). Blocked options expose no binding. The existing legacy option DTO may leave this field absent; the V2 path always publishes it explicitly. The displayed binding is captured before asynchronous selection and carried unchanged in the select request.

Selection validates the strict packet, current included draft source, provider/operation compatibility, persisted output provenance and live source/effective revisions, then invokes the existing composer CAS. It cannot substitute another output by guessing a producer from PDF/MIME or recomputing a newer option. Stale or tampered bindings fail without mutation. Original and text routes retain their current behavior with the same observed binding rule.

Backend worker owns DFC service/shared DTO and DFC-specific IPC/client/preload/environment declarations and focused tests. Renderer worker owns the exact UI binding forwarding seam. Acceptance covers real asset/output persistence through option selection, preview and prepared attachment revision/hash, plus stale/retired/tampered output, provider mismatch, runtime unavailable and CAS conflict. Managed DOCX smoke prerequisites are checked without installation.

Read-only review accepted the architecture and added exact producer-settings equality, individual binding-field tampering, excluded/removed source rejection, and output-A/output-B tests proving selection does not substitute a newer output. The coordinator verified existing composer provenance checks and authorized implementation after this review.

Implementation mapping corrected one earlier assertion: current composer reads decode selection shape but do not invoke the existing provenance verifier. Coordinator extended bounded ownership to `ComposerDraftV2Repo.read` to reuse that verifier for current selected attachments, and to preview option/target consistency. Corrupt or retired persisted selections fail closed; no draft reconstruction or schema change is permitted.

Prepared-request acceptance uses the actual OpenAI Responses compiler/history/attachment authorities, plus real immutable blob bytes. Mapping discovered a separate pre-existing OpenRouter attachment-discriminant coverage omission. Adding that registry path changes text/tool encoder revisions and invalidates persisted frozen snapshots, including snapshots without attachments. This goal preserves retry compatibility and does not widen into encoder migration. OpenRouter option/selection provenance is tested; successful OpenRouter prepared attachment submission is not claimed. Record the separate encoder compatibility dependency in closeout and a future bounded plan.

### 011 — bounded startup recovery

Current mount handling marks the app ready after every failure and hides the existing error/settings entry when no conversation is bound. Project/list refresh is not a bootstrap retry. Template reset is a committed side effect before later reads, while draft hydration currently catches failures.

Use one startup controller with loading/ready/error, an attempt lease, disposal fence and coalesced run/retry. Each retry runs the same initialization pipeline and reads workspace/template/list authorities anew. Publish only through the current lease. Track acknowledged template resets for this startup episode by template identity and requested reset flags, recording the acknowledged revision only after successful reset. A later read failure must not repeat that accepted reset. No guessed workspace/default or new database recovery path is added.

Readiness requires successful strict transcript and draft hydration of the current captured scope; helper failures cannot be swallowed into success. Existing explicit `restore_last_formal` missing-branch handling remains bounded to its reviewed error. Root loading/error/retry/settings is independent of conversation IDs. Recovery UI uses localized status and bounded diagnostic codes.

Startup worker owns the new controller, recovery component, dedicated tests and recovery locale keys. Renderer worker integrates the pipeline and root state sequentially after 006/007 integration. Acceptance includes missing bridge, ensure/template/projects/transcript/draft failures, successful same-pipeline retry, coalesced clicks, stale/disposed results, projects-only readiness, reset acknowledgement/CAS failure, and navigation/deletion ownership during hydration.

### 009 — committed semantic invalidation

Current User Rules/source-priority/Cloud mutations have no active-projection invalidation. Inspector reads a previously resolved pointer without first resolving current authorities. Revisions are opaque semantic hashes, not ordered numbers.

Use a typed main-process notification after successful committed User Rules, priority, Cloud apply/rollback/activation and Cloud bootstrap mutations. Events carry the existing canonical source or priority revision, never a new semantic clock. Main broadcasts through the existing BrowserWindow/preload subscription pattern. Failed mutations emit no event. Initial resolution covers a bootstrap event preceding renderer subscription.

Root invalidation clears active capability readiness immediately, then resolves the currently selected subject through the existing authoritative resolver with selection/attempt fencing. Inspector uses the same server-derived scope construction as Goal 3, resolves and reads within a consistent synchronous repository boundary, and fences asynchronous UI responses by subject/request identity. No first-source-row, renderer-supplied scope or credential fallback is permitted. Local endpoint proof must match the exact profile revision. Unordered event hashes trigger current resolution, not string comparison. Frozen retries retain their original snapshots.

Non-core ownership covers typed event/decoder, mutation IPC notifications, main/preload declarations, existing Goal 3 scope helper, Inspector service/panel and focused tests. Root integration remains with the renderer worker. Acceptance covers unchanged selection saves, failed mutation silence, out-of-order events/selections and current winner/provenance/revision agreement before a new send.

Read-only review accepted this boundary. Subscribe before initial resolve (or perform a catch-up after subscription) so a bootstrap commit between first read and subscription is not missed. Notification delivery failures must not change a committed mutation's successful result. Pending or failed current resolution blocks new sends; an older success/finally cannot revive readiness. Inspector field/raw responses are fenced alongside subject inspection. Broader provider acquisition/scheduler invalidation is outside this goal.

Post-implementation review identified an in-flight authoring race: an initial Send could resume after draft persistence while resolution was pending, build an empty semantic row using a null capability projection, persist changed defaults, then fail the later submit guard. The approved correction fences capability-dependent semantic authoring after asynchronous reads and before its write, including the shared regenerate/edit writer. Existing explicit rows remain untouched. Acceptance must prove no config mutation or submission from the obsolete operation, then a fresh send with current facts.

The exact authoring guard must also permit an explicit formal-session operation change. Resolve the desired target through the existing authoritative resolver and keep its projection private until the config write succeeds. Thread that private projection through image/reasoning/web construction and validate its exact binding, while retaining the original scope and capability lease across every await. OpenRouter retains its existing full-intent endpoint selection/revalidation before target resolution: preserve persisted explicit fields and captured attachments; a requested transition overlays only the UI's changed image fields, without fake supported facts or a reduced bootstrap marker. Google derives the requested operation through the existing pure route selector. No optimistic config/projection publication is permitted.

Normal refresh captures its preflight inputs privately, clears readiness synchronously, and handles capture failure inside the bounded failure path. Only OpenRouter image preflight needs the draft-scope fence; its existing watcher includes the scope binding so branch rebinding starts a replacement attempt. Other subject-only resolutions retain selection/attempt fences. Public Composer setting callbacks consume scoped failures and show a bounded error; internal persistence callers retain rejection behavior. Mounted operation-transition tests use real workspace/config/draft repositories with explicitly documented deterministic capability boundary stubs; they do not establish live image-provider authority or submission.

### 010 — exact eligible search target

Current search trusts a stale indexed project ID, reads the newest default branch page, and closes the modal before asynchronous navigation finishes. The cursor is updated even when the target is absent.

Add one read-only workspace operation accepting exact message ID and optional preferred branch ID, with a bounded 1..50-turn page. Resolve current conversation/project ownership from persisted message authority. Eligible branches are live branches whose resolved route contains the exact visible question or selected answer root, respecting inherited hidden sets. Prefer the supplied branch only if eligible; otherwise choose eligible branches in ascending branch-ID order. A live descendant may inherit from a deleted ancestor. Nonroot assistant rows are explicitly unavailable; no identity substitution is allowed.

Resolve eligibility and anchored projection synchronously. Reuse `readBranch`'s end-exclusive cursor with the target turn's successor question (null for final turn), then verify the exact target occurs in the returned view. Return a discriminated ready/unavailable result with bounded reason codes. No schema/index/ranking changes or full-history loading.

Renderer navigation uses a search-operation lease across resolution, draft-aware scope transition, anchored transcript publication, DOM next-tick focus and final cursor update. Competing hits, cancellation and late responses cannot publish or close another operation. Modal closes only after verified exact focus; unavailable/cancelled outcomes remain actionable. Backend ownership follows 007 completion; renderer integrates 010 after 009 to avoid shared-core writes. Acceptance connects actual indexed old/alternate/inherited/relocated hits to bounded visible projection, with hidden/deleted/nonroot targets and renderer races/draft-conflict cancellation covered.

Read-only review accepted this boundary and requires final current-authority validation after asynchronous scope transition before publishing the anchor. A removed/hidden route or relocated conversation cannot reuse an earlier result unchecked. Verify limit 1, final turn, hidden successor, deleted ancestor/live child, absent DOM, modal close/reopen, competing hits and conflict cancellation. A stale outcome never writes the focus cursor.

Post-implementation review found that an eligible branch beyond the first 50 cached summaries could be focused while `activeBranch` remained null. Under the final authority and operation guards, pin its summary from the returned authoritative view before publication. Test selected branch identity and operation availability. While a result is opening, prevent query/rebuild actions from invalidating only the modal lease and leaving an obsolete navigation or loading indicator; competing hits and close/reopen retain their cancellation fences.

## Final execution boundary

The user's final instruction stops further delegation and authorizes one coherent second-wave commit after merged regression, minimum final checks, record updates and Git-scope inspection. Existing passing suites are retained unless a relevant patch change or merged failure requires rerun. No third wave, OpenRouter attachment compatibility implementation or repeated blocked cleanup is authorized in this closeout. See CLOSEOUT.md and validation.json for final accepted results and commit scope.
