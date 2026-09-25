# Starverse Privacy and Repository Neutrality Audit

**Status**: active
**Document Role**: audit
**Last updated**: 2026-09-26

Audit date: 2026-09-26
Initial audit mode: read-only repository review; at report creation, this was the only worktree file created. No secret, personal path, or private email value is reproduced below.

Findings and recommendations in sections 1–9 describe the repository at the initial audit baseline. Section 10 records the later Phase A current-tree remediation.

## 1. Executive summary

- Original local branch: `models-dev-capability-resolution`
- Checkpoint SHA: `9ab531014cb3a23d8183183a3a47fb43ec07f276`
- Authoritative local development baseline: `models-dev-capability-resolution` at that SHA
- Audit branch: `audit/privacy-neutralization-20260926`, created at the same SHA
- Tracked work was clean before the audit. No checkpoint commit was needed.
- `pelican-bicycle.html` was untracked and unrelated to Starverse; it was excluded from the checkpoint and preserved.
- Findings are grouped by exposure surface, not by individual matching line. Counts: P0 1, P1 5, P2 4, P3 2 (12 groups total).

The two highest-risk results were credential-shaped OpenRouter values in ignored local authorization logs, and personal identity plus local machine data in reachable Git history. The credential values were not found in reachable Git objects. The personal email domain appears in all 958 reachable commits, and the disk-audit commit is reachable from 32 refs. At initial audit time, no cleanup or history rewrite had been performed.

## 2. Checkpoint and local branch topology

The original checkout was `models-dev-capability-resolution` at `9ab5310`. The tracked tree had no staged or unstaged changes. The only untracked file was the preserved HTML demo noted above.

`models-dev-capability-resolution` is 59 commits ahead of local `main` and has no commits unique to local `main`. Its last commit is dated 2026-09-22. The current branch matches the locally cached `origin/models-dev-capability-resolution` ref. Local `main` is 5 commits ahead of cached `origin/main`; the current baseline is 64 commits ahead of cached `origin/main`. No remote fetch was performed, so these remote relations describe this clone's cached refs only.

The table's `main-only/branch-only` and `current-only/branch-only` values come from `git rev-list --left-right --count`. They describe ancestry, not code equivalence.

| Local branch | HEAD | main-only / branch-only | current-only / branch-only | Likely role |
|---|---|---:|---:|---|
| `audit/privacy-neutralization-20260926` | `9ab531014c` | 0 / 59 | 0 / 0 | New audit branch, exact baseline |
| `models-dev-capability-resolution` | `9ab531014c` | 0 / 59 | 0 / 0 | Current active development line; Goal 3 closeout, latest local work |
| `main` | `4391ee666e` | 0 / 0 | 59 / 0 | Ancestor of current line; 5 ahead of cached `origin/main` |
| `codex/generation-compiler-v2` | `57e579c6e8` | 7 / 151 | 66 / 151 | Older parallel generation experiment; divergent and last updated 2026-08-10 |
| `codex/ci-live-smoke-availability` | `8cae7d6a8a` | 6 / 30 | 65 / 30 | Older CI branch; same cached upstream tip |
| `codex/image-reasoning-display` | `07628dfa4c` | 9 / 100 | 68 / 100 | Older image-reasoning branch; same cached upstream tip |
| `codex/rewrite-readme` | `5b873c5384` | 7 / 10 | 66 / 10 | Older documentation branch; 10 commits ahead of cached upstream |
| `codex/p5-f1-strict-verdict-routing` | `72cee48d0e` | 239 / 0 | 298 / 0 | Older ancestor line |
| `debug/white-screen-dev` | `677328ffec` | 145 / 0 | 204 / 0 | Older debug line; 13 commits ahead of cached upstream |
| `docs/dfc-0-format-conversion-foundation` | `501a9d8a72` | 159 / 0 | 218 / 0 | Older DFC line |
| `backup/main-before-generation-compiler-goal1-20260713` | `6fb6ad59a9` | 9 / 54 | 68 / 54 | Historical backup |
| `ui-app` | `a5a644a0eb` | 285 / 0 | 344 / 0 | Older UI line; 17 commits ahead of cached upstream |
| `phase3/ui-app` | `3a576d85ea` | 471 / 0 | 530 / 0 | Historical phase line |
| `refactor/conversation-list-split` | `d73af93902` | 560 / 0 | 619 / 0 | Historical refactor line |

The current development line is the authoritative baseline because it is the actual checkout, is the descendant of local `main`, and carries the newest completed work (2026-09-22). The older divergent feature branches remain separate candidates; this conclusion does not claim that every branch-only change has been merged.

Local upstream comparisons: `models-dev-capability-resolution` matches its cached upstream; local `main` is 5 ahead of `origin/main`; `codex/rewrite-readme`, `debug/white-screen-dev`, and `ui-app` are respectively 10, 13, and 17 commits ahead of their cached upstreams. The remaining configured upstreams match their local tips; `backup/main-before-generation-compiler-goal1-20260713`, `codex/p5-f1-strict-verdict-routing`, `docs/dfc-0-format-conversion-foundation`, and `phase3/ui-app` have no configured upstream.

## 3. Current-tree findings

### P0-1 — OpenRouter credentials in ignored local logs

- Evidence: two distinct 73-character OpenRouter-shaped values appear four times in authorization-header context across `.artifacts/netlog/netlog-20260204-202348-p36380.json:5420`, `.artifacts/netlog/netlog-20260204-202657-p48844.json:5394,13319`, and `artifacts/openrouter/logs/openrouter_stream_20260129_123013.log:1386`.
- Classification: P0. These have the length, entropy, provider prefix, and header context of credentials. Their current validity was not checked; treat both as compromised.
- Exposure: local files only in this checkout; all three are Git-ignored and none is present in reachable Git history.
- Recommended action: revoke/rotate both credentials, then remove or securely retain the raw logs after preserving only sanitized evidence. No such action was taken.

### P1-1 — Tracked disk-audit exports expose machine and user-directory data

- Evidence: 27 tracked CSV/JSON files under `artifacts/disk_audit_20260410_152029/`; nine contain 256 absolute user-directory references. Affected files include `consolidated_candidates.csv`, `directory_candidates_c.csv`, `duplicate_candidates.csv`, `known_hidden_sources.csv`, `large_files_c.csv`, `low_risk_unique_manifest.csv`, `top_directories_c.csv`, and the execution manifest/result CSVs. The reports inventory C:, D:, and E: drives, directory trees, file sizes, timestamps, risk classifications, and cleanup results.
- No `.gitignore` rule matches these tracked disk-audit outputs, so future generated reports are not protected by the current ignore rules.
- Earlier snapshots under `artifacts/disk_audit_20260410_140529/`, `142855/`, and `145528/` each retain volume statistics and drive-capacity details.
- Classification: P1. The main export is a detailed personal machine/storage inventory with absolute paths. All path values are omitted from this report.
- Recommended action: remove these raw reports from the public tree and replace them with a minimal, anonymized summary if the evidence must remain. Preserve `ops/disk-audit.ps1` only if its output destination and ignore rules prevent future raw reports from entering Git.

### P1-2 — Actual local account paths in five tracked documents

- Evidence (path values redacted): `docs/analysis/model-provider-identity/07-frozen-decisions-and-implementation-plan.md:260,275`; `docs/archive/bugfixes/PATH_FIX.md:14,36`; `docs/file-pipeline/file-type-detection-implementation/04-step1-repo-survey-binding-map.md:14`; `docs/file-pipeline/document-format-conversion/dfc-m17-html-to-pdf-browser-runtime-blocker.md:18`; and `docs/file-pipeline/document-format-conversion/important-context.md:1357`.
- Classification: P1. These expose a real local account directory and reveal local development/database/runtime locations.
- Recommended action: replace with neutral placeholders or move detailed local recovery records to private storage. Do not reproduce the path values in commits, issues, or public reports.

### P1-3 — Personal email in Git author/committer metadata

- Evidence: all 958 reachable commits contain the personal `163.com` domain in at least one author or committer email field; 1,912 of 1,916 email fields use that domain. Three distinct display names occur. The local effective/global `git user.email` configuration still uses this domain.
- Classification: P1. This is persistent identity metadata, not a product localization signal. No nationality is inferred from the name, email domain, or timezone.
- Current exposure: present in the reachable local history and the locally cached remote-tracking history.
- History rewrite required: yes, if the goal is to remove this identity from repository history.
- Future prevention: change the global Git identity to a GitHub noreply address and a non-personal display name before making future commits. This was not changed.

### P1-4 — Possible third-party email in a tracked provider response capture

- Evidence: one non-placeholder email address appears twice in `artifacts/openrouter/web-plugin-boundary/20260219_015819/D_plugins_enabled_true/response.json:56` and `response.txt:11`, inside response URL-citation content. It does not appear in the paired request file. The address source and whether it identifies a real person were not verified.
- Classification: P1, uncertain. Treat the response as potentially containing third-party contact data.
- Recommended action: redact the response capture or replace it with synthetic content before public distribution. If removed from the repository, history rewriting is required to purge it from reachable history.

### P1-5 — Ignored local logs and runtime dumps

- Evidence: ignored `.artifacts`, `.tmp`, and `artifacts` logs contain 54 additional references to the local account directory across 25 files. Nine `.dmp` files remain under the ignored `.external-runtime-work` LibreOffice runtime tree. One `.cpuprofile` and numerous diagnostic logs are also present. The dump files were not decoded, so their contents are unknown.
- Classification: P1 for the path-bearing logs; the `.dmp` contents are an unresolved P1 candidate because memory dumps may include process data.
- Exposure: the logs/dumps are not in reachable Git history. `.external-runtime-work` is ignored by Git and Vite. `.artifacts/netlog` is ignored by both. `.artifacts/white-screen` is Git-ignored but is not explicitly listed in `vite.config.ts`'s watcher exclusions; `artifacts/openrouter/logs` is Git-ignored but also is not explicitly excluded from Vite watching.
- Recommended action: revoke the credentials first, then review and remove/securely retain raw logs and dumps. Add the needed generated-log exclusions or move them outside the Vite watch scope. No files were deleted or reconfigured.

### Other current-tree checks

- No actual `.env` file was found in the current tracked/untracked source set or reachable history; `.env.example` is the only matching environment filename.
- No phone-number candidate was found in disk-audit path fields or phone-labeled content.
- High-entropy credentials were not found in tracked response/request captures. Common key-shaped strings in tests/docs are inert fixtures/examples. A private-key marker match in a smoke script is part of sanitizer logic; no private-key payload was confirmed.
- A local pattern scan covered 2,467 current text files; three binary files were skipped. It also covered 290 generated text artifacts (about 42 MB) and 9,415 runtime-manifest text files. Nine `.dmp` files and other large packaged/runtime binaries were inventoried by filename and type, not decoded. No external scanner was used.

## 4. Reachable Git history findings

- Reachability scope: 958 commits across local branches, locally cached remote-tracking refs, tags, and `refs/stash`; 9,342 unique text blobs were scanned out of 9,344 reachable blobs. Two binary blobs were not text-scanned.
- The personal-email metadata is present in all 958 commits.
- The full disk-audit export was introduced by `e92594512547dfc8cb3981b8f448e98543dd51b9` (`chore(ops): add disk audit scripts and ignore reports artifacts`). It is reachable from 32 refs, including local `main`, `models-dev-capability-resolution`, current/cached `origin/main`, and the audit branch.
- The five current documents containing local account paths are tracked and reachable. Removing their content from history requires a rewrite.
- The two P0 credential values found in ignored logs did not occur in scanned reachable text blobs. History rewriting does not replace credential rotation.
- The 10 high-entropy short candidates remaining in the text scan were confined to a debug guide and tests; their forms and contexts identify them as examples/fixtures, not usable credentials.

## 5. Repository localization and developer-background findings

### P2-1 — Chinese-first public README and Windows/PowerShell setup assumptions

- Evidence: `README.md` introduction and project description at lines 3 and 66; development setup at lines 199-207. The README defaults to Chinese and presents a Windows/PowerShell-centered development setup.
- Classification: P2 developer-background signal.
- Recommended action: make English the default public README language and generalize setup instructions to the supported platforms; retain a Chinese README/translation link.

### P2-2 — Explicit regional rationale in provider policy

- Evidence: `README.md:39-47` discusses provider removal in terms of mainland-China availability/user impact.
- Classification: P2 strong regional policy signal. This describes a product decision, not the maintainer's nationality.
- Recommended action: generalize the public rationale to provider availability, policy, or reliability constraints; keep product support behavior unchanged unless separately decided.

### P2-3 — Repeated UTC+8/Asia/Shanghai progress records

- Evidence: 855 of 958 commits use `+08:00` timestamps and 103 use `+09:00`; fixed `+08:00`/`Asia/Shanghai` appears in progress/evidence documents, including `docs/architecture/generation-compiler-v2/goal1-progress.md:10,15`, `goal2-progress.md:12`, DFC progress/closure documents, and `docs/architecture/provider-architecture/PROVIDER_LIVE_API_SMOKE_DEEPSEEK_GEMINI.md:13`.
- Classification: P2 regional/timezone fingerprint. No location or nationality is inferred.
- Recommended action: use UTC for public progress records or move detailed local timelines to private notes. Commit timestamps require history rewrite if they must be removed.

### P2-4 — Maintainer model/backend preferences in repository instructions

- Evidence: `AGENTS.md:5-8` names concrete default models/backends; `.github/copilot-instructions.md:1-3,32-47,145-152` is an extensive Chinese developer guide; `scripts/archive-completed-docs.ps1:1-4` contains a hardcoded repository-drive assumption.
- Classification: P2 workflow and local-environment fingerprint.
- Recommended action: generalize model/provider names where they are not project requirements, move personal agent defaults to private configuration, and derive script paths from the script/repository root.

### P3-1 — Chinese developer-facing internal documentation and prompts

- Evidence: `docs/i18n/00-i18n-integration-survey.md`, `docs/tailwind/TAILWIND_V4_AI_PROMPT.md`, and archival scripts contain Chinese developer-facing prose/comments.
- Classification: P3 stylistic signal. This is distinct from user-facing localization.
- Recommended action: translate public engineering guides over time; keep private prompts/local notes private where that is their intended audience.

### P3-2 — Isolated regional software example in a code comment

- Evidence: `electron/preload.ts:412` references WeChat/QQ-style external-link popups; no local data path or account identifier is present there.
- Classification: P3 weak example-level signal.
- Recommended action: replace with a neutral “messaging app” example if the comment is retained.

### Product localization to preserve

`zh-CN` and `en-US` are product locales, with shared renderer/main-process resources and system/manual language selection. Preserve `src/shared/i18n/locales/zh-CN/`, the locale registry/matcher, language preferences, bilingual README access, CJK fixtures, and i18n parity checks. These are product functionality, not privacy findings.

## 6. Files that should likely leave the public/current repository surface

- Raw tracked storage inventory: `artifacts/disk_audit_20260410_140529/`, `142855/`, `145528/`, and `152029/`.
- Tracked provider response capture with possible third-party contact data: `artifacts/openrouter/web-plugin-boundary/20260219_015819/D_plugins_enabled_true/response.json` and `response.txt`.
- The five tracked documents listed under P1-2 should have local paths generalized or moved to private records.
- Local-only raw credential logs: the two `.artifacts/netlog` files and the OpenRouter stream log listed under P0-1. Revoke/rotate before handling them.
- The nine ignored `.dmp` files should be reviewed and removed or secured after confirming they are no longer needed.

No files were deleted or modified other than creation of this report.

## 7. Findings requiring Git history rewrite

Yes, if removing personal identity and machine data from reachable repository history. The personal email affects 36 of 50 refs; the disk-audit addition commit is reachable from 32 refs. The locally cached refs affected by the personal-email history are:

- Local heads: `audit/privacy-neutralization-20260926`, `backup/main-before-generation-compiler-goal1-20260713`, `codex/ci-live-smoke-availability`, `codex/generation-compiler-v2`, `codex/image-reasoning-display`, `codex/p5-f1-strict-verdict-routing`, `codex/rewrite-readme`, `debug/white-screen-dev`, `docs/dfc-0-format-conversion-foundation`, `main`, `models-dev-capability-resolution`, `phase3/ui-app`, `refactor/conversation-list-split`, `ui-app`.
- Remote-tracking refs: `origin/HEAD`, `origin/backup/local-starverse-20260513-ui-app`, `origin/backup/main-20260611-0120`, `origin/backup/main-20260713-034247`, `origin/backup/main-20260713-034842`, `origin/codex/ci-live-smoke-availability`, `origin/codex/generation-compiler-v2`, `origin/codex/image-reasoning-display`, `origin/codex/rewrite-readme`, `origin/debug/white-screen-dev`, `origin/docs/dfc-v12-implementation-matrix`, `origin/feat/provider-catalog-core`, `origin/legacy/main-before-ui-app-promotion-20260513`, `origin/main`, `origin/models-dev-capability-resolution`, `origin/refactor/conversation-list-split`, `origin/ui-app`.
- Tags: `starverse-plugin-magika-v0.1.0`, `starverse-plugin-magika-v0.1.1`, `starverse-plugin-magika-v0.2.0`, `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64`.
- Local stash: `refs/stash`.

Impact analysis:

- `main`: yes, both local `main` and cached `origin/main` are affected.
- Local experimental branches: yes; all 14 local heads listed above contain affected identity metadata.
- Tags: yes; all four listed tags are affected.
- Force push: required to replace published branch/tag history if these refs are rewritten. No force push was performed.
- Existing clones/forks: they retain old objects until separately repaired or recloned; forks may continue to expose the old commits.
- Git hosting caches/support: cache or support-assisted purging may be needed after rewriting; current hosted state was not fetched or verified.
- Credential revocation: rotate the two local-log credentials even though they are absent from scanned history.

## 8. Recommended remediation order

1. Revoke/rotate the two P0 credentials and handle the raw authorization logs securely.
2. Remove or sanitize the tracked disk-audit inventory and the response capture with a possible third-party email.
3. Generalize/move the five local-path documents; update future Git identity configuration.
4. Plan a coordinated history rewrite covering affected local/remote branches, tags, and stash; then coordinate clone/fork repair. Do not rewrite history until owners agree on the ref plan.
5. Translate/generalize public developer-facing docs and normalize public timestamps; preserve all zh-CN product functionality.
6. Review the ignored `.dmp` files and align `.artifacts`/raw-log paths with Vite watcher exclusions.

## 9. Initial audit actions not performed at report creation

- Git history rewrite: no
- Push or force push: no
- Files deleted: no
- Branch reset/rebase/merge: no
- Third-party scanner upload: no
- Tests or runtime smoke: none; this was a static audit

## 10. Phase A current-tree remediation (2026-09-26)

Phase A applied current-tree privacy and repository-neutrality changes without rewriting history or mutating remote refs. The initial findings in sections 1-8 remain a record of the pre-remediation audit; current-state follow-up is below.

Completed changes:

- Replaced the public README with an English-first entry page and preserved the original Chinese README as `README.zh-CN.md`, with reciprocal links. Chinese product localization remains intact.
- Generalized maintainer-specific model, identity, path, machine, region, messaging-app, and timezone assumptions across active guidance and selected archived documentation. Removed model pinning from project agent configs while retaining their roles and guardrails.
- Replaced the captured contact address with a reserved placeholder and redacted two opaque bearer values in the archived request log. The bearer values' validity is unknown; review and rotate them if they were ever active.
- Removed 33 tracked raw disk-audit CSV/JSON exports. Preserved six local-only audit/log files under the ignored `.artifacts/disk-audit/local-previous/20260926/` directory. Existing ignored authorization logs were left in place for owner handling.
- Made the disk-audit script use logical volume discovery and an ignored output location, added Git and Vite exclusions for local captures, and expanded the privacy gate to scan tracked and non-ignored untracked files while redacting findings from output.
- The initial audit identified two OpenRouter-shaped credential values in ignored local logs. They were not tested online or rotated; the owner should revoke/rotate them and then securely handle those logs. No credential values are reproduced here.

Validation completed:

- `npm run gate:privacy -- --self-test`: passed.
- `npm run gate:privacy`: passed; scanned 2,363 files with no unclassified findings.
- `npm run gate:docs`: passed (8 entry documents).
- `npm run i18n:check`: passed; namespace, key, and parameter parity held.
- `npm run i18n:scan-hardcoded`: completed with 46 potential findings, within the accepted range.
- README/active-entry Markdown link check: passed (82 checked).
- PowerShell parser check for `ops/disk-audit.ps1`: passed.
- Targeted ESLint for `scripts/gates/privacy-scan.mjs` and `electron/preload.ts`: passed.
- `git diff --check`: passed with only expected LF-to-CRLF warnings.
- Repository-wide `npm run lint`: failed with 414 errors and 814 warnings across the repository; targeted lint on the changed code files passed. The failures were not established as baseline by a separate clean-tree run.
- `npm run rebuild:node` and `npm run verify:ssot`: pending at the time this report was written.

One additional opaque bearer value, duplicated twice in the archived debug request log, was discovered during the expanded current-tree scan and redacted. Its validity is unknown. Two OpenRouter-shaped values remain in ignored local logs pending owner rotation. No online credential checks were performed.

History findings remain unresolved by design: no history rewrite, reset, rebase, push, force push, or tag mutation was performed. History remediation requires a separate owner-approved ref and clone coordination plan.

