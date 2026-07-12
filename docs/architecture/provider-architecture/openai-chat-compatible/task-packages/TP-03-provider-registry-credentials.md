# TP-03 — Provider Registry, Authentication, Headers and Query Configuration

Status: `complete`

## Goal

Implement the main-process provider-instance registry and secure credential lifecycle for multiple compatible provider instances, including immutable endpoint revisions, auth descriptors, ordinary/sensitive headers and non-secret static query parameters. No remote request is sent.

## Dependencies and prerequisite state

- TP-02 complete.
- Secure-store backend and existing redaction primitives characterized.
- New domain/repository contracts available.

## Current evidence

- Current credential service is a fixed native-provider union: `electron/credentials/providerCredentialService.ts`.
- Reusable redaction primitives exist in `electron/credentials/providerCredentialRedaction.ts` and `src/next/provider/credentials/`.
- Current OpenRouter credential IPC can reveal raw keys to renderer and must not be copied into the compatible path.

## Production files and deletion scope

Create compatible-specific main modules under:

- `electron/credentials/compatibleCredentialService.ts`
- `electron/ipc/compatibleProviderRegistryIpc.ts`
- `src/shared/provider/openai-chat-compatible/registry/`
- typed preload/environment contracts.

Reuse only verified provider-neutral redaction and safe metadata helpers. Do not widen the fixed native `ProviderCredentialService` union to create ambiguous shared identity; the compatible service owns versioned instance credentials.

Delete no native credential code. Remove any surviving compatible custom endpoint behavior from generic store IPC if TP-01 left physical cleanup hooks.

## Schema, config and data impact

- Write provider instances, endpoint revisions and credential descriptors through TP-02 repositories.
- Store bearer/basic/sensitive header payloads only in secure store under immutable version refs.
- Ordinary headers and static query values live in endpoint revisions.
- Rotation creates a new credential ref and endpoint revision.
- Delete removes secure payload and invalidates dependent routes; descriptors remain tombstoned for diagnostics.

## Core invariants

- Renderer never receives raw compatible credentials, including Basic username/password and sensitive custom header values.
- Exactly one auth mode is active: `none|bearer|basic|custom_headers`.
- Header names are case-insensitive and duplicate-normalized.
- Transport-owned/hop-by-hop headers are rejected at save time.
- Secret-like custom headers are forced into secure storage.
- Query configuration is non-secret only; API keys and secret-like values are rejected.
- Base URL contains no userinfo/query/fragment and canonicalizes to one API root.
- Editing routable configuration creates a new immutable endpoint revision.

## Implementation steps

1. Implement ID/version generation and registry transactions.
2. Implement canonical Base URL and static query validators without network access.
3. Implement header normalization, deny policy and sensitive-name classifier.
4. Implement secure payload create/read-for-main/rotate/delete; expose safe metadata only.
5. Implement typed IPC for list/get/create/edit/delete/rotate with strict decoding.
6. Make endpoint revision creation atomic with secure payload write compensation on failure.
7. Add dangling-ref and secure-store-unavailable error handling.
8. Add source/log/privacy tests proving no raw secret crosses preload/IPC/log/error boundaries.

## Tests and gates

- Registry repository and IPC contract tests.
- Bearer, Basic, no-auth, ordinary and sensitive custom header tests.
- Case-insensitive deny set including Host, length, hop-by-hop, Proxy-*, Sec-*, Authorization, Accept and Content-Type.
- Query secret rejection and URL canonicalization matrix.
- Rotation/delete/dangling-ref/rollback tests.
- Credential exposure source guards focused on the new path.
- `npx tsc --noEmit --pretty false`
- `npm run gate:network-egress`
- `node scripts/gates/privacy-scan.mjs`
- `git diff --check`

## Acceptance criteria

- Multiple instances can be created and safely listed through typed IPC.
- All auth/header/query combinations either persist safely or fail with a provider-neutral configuration error.
- Rotation/versioning behavior is deterministic and old routes can still reference old versions until explicit deletion.
- No outbound fetch exists.

## Prohibitions

- No raw credential reveal API.
- No secret in SQLite, localStorage, query, error, logs or renderer state.
- No dynamic scripts/templates/auth code.
- No cloud-signature plugin in this generic mechanism.
- No production send or connection test yet.

## Suggested commit

`feat(provider): add compatible registry and secure credentials`

## Stable contract for the next package

TP-04 and TP-05 receive immutable, validated endpoint revisions and a main-only credential resolver that returns secrets only after route/network policy authorizes injection.
