# Cloud-managed Rules Distribution Contract

- **Lifecycle Status**: Owner-frozen
- **Document Role**: controlling Cloud-managed Rules distribution contract
- **Last updated**: 2026-09-22
- **Implementation Status**: documentation-only contract; production migration and Goal 3 were separately authorized and completed under items 14 and 15; this document itself remains non-authorizing

---

## 1. Purpose, authority and boundary

This document freezes the Cloud-managed Rules distribution contract after the Owner Q&A covering:

1. source authority;
2. release version and content revision identity;
3. Release Document format;
4. digest and transport-integrity boundaries;
5. candidate acquisition;
6. Apply semantics;
7. Last-Known-Good behavior;
8. retention, rollback and version pinning.

The Cloud/User Pack and Rule model, activation semantics, unique Capability Rules source, exact-subject materialization and UI lifecycle remain governed by [`12-model-facts-ui-synchronization-plan.md`](12-model-facts-ui-synchronization-plan.md). This document narrows only the distribution lifecycle for Cloud-managed content.

Freezing this contract removes the Owner-decision blocker identified by item 12. It does **not** authorize production code, database/schema changes, IPC work, bundled-rule migration, Cloud fetching, Goal 3 resolution, or consumer migration.

Cloud-managed Rules and User Rules remain two ownership/lifecycle modes inside the one Capability Rules Model Facts source. A remote `contentRevision` identifies one Cloud publication payload; it is not a fourth Model Facts source and is not the final Capability Rules canonical source revision.

## 2. Source and publication authority

### 2.1 Fixed official source

The only official Cloud-managed Rules source is:

```text
https://github.com/GuXinghai/starverse
```

Users cannot replace this source or add Cloud subscription repositories. Third-party rule content may enter only through the separately governed User Rules Import lifecycle.

### 2.2 Formal publication

Only a dedicated, published GitHub Release in that repository can create a Cloud Rules release. The following are not formal publications by themselves:

- a branch or ordinary commit;
- files present in the repository tree;
- a bare Git tag without a published GitHub Release;
- a draft Release;
- a GitHub or SemVer prerelease;
- a Starverse application Release outside the Cloud Rules tag namespace.

The Release tag must have the exact form:

```text
cloud-rules-vX.Y.Z
```

`X.Y.Z` is canonical stable SemVer: exactly three non-negative integer components, with no leading-zero variants, prerelease suffix, build metadata or omitted component.

The Release Document `releaseVersion` must be exactly the same `X.Y.Z` encoded by the tag. Any mismatch invalidates the candidate.

## 3. Version and revision identities

Cloud Rules uses two identities with non-overlapping responsibilities.

### 3.1 `releaseVersion`

`releaseVersion` is the human-readable publication version. It is used for:

- UI and release notes;
- version comparison;
- audit and operator communication;
- GitHub Release/tag identity.

It is not a unique content identity.

### 3.2 `contentRevision`

`contentRevision` is the deterministic identity of the complete normalized Cloud Pack/Rule publication content. Its representation is:

```text
sha256:<64 lowercase hexadecimal characters>
```

The producer and consumer must:

1. decode and strictly validate the Release Document;
2. project the full remote Pack/Rule publication payload;
3. normalize semantically unordered collections using the shared Pack/Rule schema while preserving order-significant arrays;
4. serialize the normalized payload using Starverse stable UTF-8 JSON serialization;
5. compute SHA-256 and prefix the lowercase digest with `sha256:`;
6. require exact equality with the declared `contentRevision`.

The normalized revision payload includes every piece of formal remote Pack/Rule content, including:

- Pack and Rule stable identities;
- display names, optional labels and descriptions;
- Pack and Rule priority;
- Pack mode/target and Rule configured remote activation baselines;
- selectors;
- assertions, canonical paths, typed values and domains;
- evidence and provenance;
- any other field added to the versioned shared Pack/Rule publication schema.

The following publication-envelope metadata does not enter `contentRevision`:

- `schemaVersion`;
- `releaseVersion`;
- the `contentRevision` field itself;
- GitHub Release, tag and asset identities;
- publication, fetch and check timestamps;
- Release notes;
- GitHub-provided artifact digest metadata;
- other metadata describing the publication event rather than Pack/Rule content.

Reformatting JSON, changing object-key order, republishing the same content under a later `releaseVersion`, or changing publication metadata must not change `contentRevision`. Any change to formal Pack/Rule content must change it.

### 3.3 Permanent version binding

One `releaseVersion` is permanently bound to one `contentRevision`. If a previously observed `releaseVersion` later resolves to a different content revision, Starverse must reject it as a publication-integrity error, preserve the current state and report the mismatch.

The implementation therefore retains a lightweight permanent `releaseVersion -> contentRevision` observation ledger. The ledger retains identities only; it must not become permanent Cloud Rules content history.

## 4. Release Document V1

### 4.1 Asset identity

Every formal Cloud Rules Release must contain exactly one uploaded asset named:

```text
starverse-cloud-rules.json
```

Missing assets, multiple assets with that exact name, or an asset whose GitHub state is not `uploaded` invalidate the Release.

### 4.2 Closed envelope

The top-level shape is closed:

```ts
type CloudRulesReleaseDocumentV1 = {
  schemaVersion: 1
  releaseVersion: string
  contentRevision: `sha256:${string}`
  packs: readonly CloudRulePackPublicationV1[]
}
```

`packs` uses the one shared, versioned Pack/Rule domain model frozen in item 12. It is not arbitrary JSON and must not introduce a Cloud-specific capability schema.

The current decoder accepts only `schemaVersion = 1`. Unknown fields, a schema-version mismatch, duplicate stable identities, invalid Pack/Rule content, invalid references, or any other closed-schema violation reject the entire candidate. Starverse must not partially accept valid members, retain invalid members as disabled, or infer omitted values.

During development there is no forward/backward compatibility promise. An incompatible schema change increments `schemaVersion` and changes the current development decoder directly. No fallback decoder, dual read, or tolerant legacy path is retained. A release-to-release compatibility policy must be designed separately after Starverse has its first formal release.

### 4.3 Remote activation baseline and local overrides

The Release Document must explicitly provide:

- Pack `mode` and `target` baselines;
- Rule `configured` baselines.

These fields cannot be omitted and cannot be synthesized by decoder defaults. They are part of formal remote content and therefore part of `contentRevision`.

Cloud activation uses a remote-baseline/local-override model:

- a newly introduced stable identity begins with its remote baseline;
- a user's local activation adjustment is a separate per-field override;
- an existing local override survives normal Apply and rollback when the stable identity remains;
- a field without a local override follows the newly applied remote baseline;
- the Cloud Rules default activation policy remains local ownership policy and is not distributed in the Release Document.

This overlay produces the one shared Pack/Rule activation model; it must not create a second Cloud-only activation implementation.

## 5. Integrity and transport boundary

### 5.1 V1 trust model

V1 trusts:

- the fixed GitHub repository authority;
- HTTPS transport constrained by the host policy below;
- strict Release/tag/asset identity checks;
- strict closed-schema validation;
- deterministic recomputation of `contentRevision`.

V1 does not require a detached checksum authority, signing key, signature, certificate pinning or independent supply chain. GitHub-provided asset digest metadata may be retained for audit but is not an additional acceptance authority.

### 5.2 Redirect host policy

Every request and every redirect hop must use HTTPS. Allowed hosts are:

- `api.github.com`;
- `github.com`;
- a proper DNS subdomain of `githubusercontent.com`.

The wildcard rule must be implemented as a DNS-label suffix check. A hostname such as `evilgithubusercontent.com` is not allowed.

Redirect handling must:

- revalidate scheme and host at every hop;
- reject HTTP downgrade;
- reject user-info URLs;
- never forward credentials across hosts;
- detect redirect loops;
- treat illegal hosts, loops, timeouts and transport failures as acquisition failure.

The Cloud Rules protocol does not define a fixed 3/5/10 redirect-hop limit. It uses the selected HTTP client's normal redirect safety and request timeout in addition to explicit loop detection and per-hop validation.

GitHub documents that Release asset download can return either a direct `200` or a `302` redirect, so redirects cannot be prohibited entirely: [GitHub Release Assets API](https://docs.github.com/en/rest/releases/assets).

### 5.3 Resource limits

The contract does not impose an additional product-level byte limit on `starverse-cloud-rules.json`. GitHub metadata, transport behavior, JSON parsing, schema validation and ordinary platform resource failures still apply. Any acquisition or parsing failure leaves the current candidate, applied LKG and successful-freshness timestamp unchanged.

## 6. Candidate discovery and acquisition

### 6.1 Discovery

Starverse must use the GitHub Releases listing API, paginate the result, and consider only Releases that are:

- published and not draft;
- not marked prerelease;
- tagged with the exact `cloud-rules-vX.Y.Z` stable-version form.

It selects the highest valid SemVer. It must not use the repository-wide `latest release` endpoint because the repository also contains Starverse application Releases. GitHub's listing behavior and distinction between Releases and ordinary tags are documented by the [GitHub Releases API](https://docs.github.com/en/rest/releases/releases).

Malformed, unrelated and non-Cloud tags are not candidates. They may produce diagnostics but do not extend the source authority.

### 6.2 Highest-release failure

After selecting the highest stable Cloud Rules Release, Starverse validates that Release and its one expected asset. If download, transport, identity, schema, revision or content validation fails:

- the whole check fails;
- Starverse does not scan downward for an older valid Release;
- the active candidate, LKG and last-successful-check timestamp remain unchanged;
- a missing LKG remains missing rather than being fabricated from another source.

### 6.3 Same content under a higher version

If a higher valid `releaseVersion` has the same `contentRevision` as the applied LKG:

- update latest-observed Release metadata and freshness;
- do not create a content candidate;
- do not display an update badge;
- do not require Apply;
- do not republish the Capability Rules canonical source.

The same rule applies to candidate identity: `contentRevision` is the content identity, while Release metadata remains attached for audit.

### 6.4 Candidate persistence and withdrawal

A validated content-changing candidate is persisted independently from the applied LKG. Failed or incomplete checks do not clear it.

If a later successful, complete check proves that an unapplied Release is no longer a valid official publication, Starverse atomically withdraws the candidate and clears its update state. A UI attempting to Apply an already-open withdrawn candidate fails its expected-candidate check; it must not silently apply or switch to another candidate.

## 7. Apply and LKG

### 7.1 Apply input and concurrency

Apply uses the exact persisted, validated candidate that was presented to the user. It does not fetch again from the network.

The command must bind:

- the expected persisted candidate record revision;
- the expected currently applied snapshot/revision.

If either is stale, Apply fails and refreshes the projection without retrying or substituting a newer candidate.

### 7.2 Atomic publication

One database transaction must:

1. revalidate candidate identity and persisted integrity;
2. install the remote Pack/Rule content;
3. reconcile local activation overrides by stable Pack/Rule identity;
4. atomically switch the applied Cloud snapshot;
5. materialize/publish the resulting single Capability Rules canonical source revision;
6. record the Apply event and retention state.

Any failure rolls back the whole transaction and leaves the candidate available for retry. A Cloud snapshot must never become applied without the corresponding Capability Rules canonical source publication.

With no LKG, the first successfully acquired and validated snapshot may be automatically applied under the already-frozen bootstrap policy. Subsequent updates default to `notify_only` and use the explicit Apply path.

### 7.3 LKG definition and staleness

The Cloud Last-Known-Good is only the last snapshot that completed the full Apply transaction and Capability Rules source publication. A downloaded or validated-but-unapplied candidate is not LKG.

LKG never expires solely because of age. Refresh failure changes freshness/stale diagnostics but never automatically disables or removes applied Cloud claims.

If local integrity verification of the current LKG fails:

- do not silently promote a history item;
- do not silently clear Cloud Rules;
- mark the Cloud source unavailable and show a severe warning;
- permit recovery only through explicit rollback to a retained, independently verified snapshot or explicit Apply of a new validated candidate.

## 8. Retention, rollback and version pin

### 8.1 Bounded applied history

The current LKG is always retained and is not counted as history. The number of historical successfully applied snapshots is user-configurable:

```text
default: 4
minimum: 0
maximum: 20
```

When the setting is reduced and committed, Starverse immediately prunes the oldest snapshots outside the new window.

Existing Runtime/Resolved provenance and raw-evidence retention pins continue to prevent physical deletion of referenced evidence. Such pinning does not return an otherwise pruned snapshot to the user-visible rollback list and does not create permanent Cloud content history.

### 8.2 Rollback transaction

Rollback selects a retained, independently validated historical snapshot and executes as a new local Apply event:

- the target remote content becomes the new LKG;
- the pre-rollback LKG enters the bounded history, allowing rollback to be undone;
- the historical local activation state is not restored;
- current local activation overrides are reconciled by stable identity exactly as in normal Apply;
- Capability Rules canonical source publication and history changes are atomic.

Rollback does not mint a new remote `releaseVersion` or `contentRevision`.

### 8.3 Optional version pin

Rollback confirmation offers an unchecked option:

```text
Pin this version and ignore future updates
```

Rollback itself does not imply pinning. If selected, the current rollback target becomes a persistent, visible and reversible local policy:

- automatic and manual checks may still update freshness and availability diagnostics;
- higher Release versions do not create update candidates or ordinary update badges;
- no higher version is automatically applied;
- the pinned snapshot remains applied LKG;
- UI exposes `Resume updates`.

After `Resume updates`, the next normal check discovers the highest current stable Cloud Rules Release. If its content differs, it creates a candidate under the normal rules. Intermediate versions are not replayed.

## 9. Deterministic failure summary

The following never mutate applied Cloud facts or silently select a fallback:

- GitHub API or transport failure;
- illegal redirect scheme or host;
- redirect loop or timeout;
- invalid tag/version binding;
- missing, duplicate or non-uploaded target asset;
- unsupported schema version or unknown field;
- invalid Pack/Rule member or duplicate identity;
- declared/recomputed revision mismatch;
- one release version resolving to multiple content revisions;
- highest stable Release being invalid;
- stale Apply or rollback input;
- failed Capability Rules canonical publication.

When no LKG exists, these failures leave Cloud-managed Rules empty. When an LKG exists, it remains applied unless its own local integrity is invalid, in which case the source becomes unavailable pending explicit recovery.

## 10. Implementation and Goal 3 boundary

The next separately authorized production Goal may implement this contract together with the item 12 Cloud/User Pack/Rule migration. It must not:

- create another Model Facts source;
- add repository override or multi-subscription support;
- introduce signature/key infrastructure not authorized here;
- add legacy Manifest decoders or partial-candidate fallback;
- merge different Model Facts sources or begin Goal 3;
- interpret remote content outside the shared Pack/Rule schema;
- treat a Cloud `contentRevision` as the final Capability Rules source revision.

Until that production Goal is authorized and completed, the current Goal 2C-era production paths remain implementation state, not evidence that this contract has already been implemented.

## 11. Future implementation acceptance matrix

The production Goal implementing this contract must add focused tests for:

- strict tag/Manifest SemVer equality and stable-only discovery;
- independent `releaseVersion`/`contentRevision` identities;
- deterministic canonicalization and revision stability;
- rejection of same-version content drift;
- closed schema, duplicate identity and atomic whole-document rejection;
- required remote activation baselines and local-override preservation;
- secure DNS-label host matching, HTTPS-only redirect validation and loop handling;
- highest-version failure without downward fallback;
- same-content higher Release freshness without candidate publication;
- successful candidate withdrawal and stale Apply rejection;
- persisted-candidate Apply without network access;
- atomic Cloud snapshot plus Capability Rules source publication;
- bootstrap, notify-only, non-expiring LKG and corrupt-LKG explicit recovery;
- retention bounds, immediate pruning and provenance pinning;
- rollback-as-Apply, activation preservation and rollback undo;
- optional persistent pin and `Resume updates` behavior;
- static enforcement that Cloud/User remain one Capability Rules source.

These are future production acceptance requirements. This documentation freeze does not run or claim those tests.
