# File Asset Store v1

## Scope

File Asset Store v1 is the Starverse-owned file asset foundation for chat attachments. It is not a provider multimodal mapping layer. Provider runtime send paths continue to consume send-plan output; this layer only makes attachment content, references, retries, and preflight readiness explicit.

## Data Model

The model is split into four semantic layers:

- Blob: immutable file content, addressed by sha256 and stored once in managed storage.
- Asset: the user-facing file record in `file_assets`. Existing file-pipeline callers continue to reference `assetId`.
- Binding: a reference from an asset to a conversation, message, branch, or project in `file_asset_bindings`.
- Revision and derived output: `file_asset_revisions` records asset content revisions and provenance; existing `file_derivatives` remains the DFC/preview derived-output registry.

`file_assets` remains the compatibility facade for the file pipeline. The content identity lives in `file_blobs`, and the current revision can be resolved from the latest `file_asset_revisions` row for an asset.

## Managed Storage

Managed blob content is stored under:

```text
assets/blobs/<sha256-prefix>/<sha256>.<ext>
```

The storage URI is relative and is only resolved in the main process with `resolveManagedStoragePath`. Renderer code receives sanitized metadata and never receives the managed path or raw local path.

The legacy `assets/original` and `assets/derived` folders are still valid for existing file-pipeline and DFC surfaces. Blob-backed imports use `assets/blobs`.

## Local File Import

Local import:

- stats and hashes the selected file in the main process;
- copies it into the managed blob store;
- dedupes content by sha256 through `file_blobs`;
- records the display filename, MIME/extension profile, `originalPath` in private source metadata, and a first `file_asset_revisions` row with cause `imported`;
- leaves attachments referencing `assetId`, not a local path.

`originalPath`, blob ids, full hashes, and storage paths are stripped from renderer-visible metadata.

## URL Snapshot

URL attachment import stores safe URL metadata and, for `link_and_file`, downloads a local snapshot into the blob store. The chat UI default is `link_and_file`; explicit `link_only` is still supported.

For `link_and_file`:

- a successful snapshot creates a blob, asset, and revision with cause `url_snapshot`;
- probe or materialization failure creates a retryable URL asset record with no local blob;
- send preflight blocks until the asset has a stored local snapshot;
- retry snapshot re-runs URL ingestion and replaces the draft attachment reference with the newest asset.

URLs with embedded credentials are rejected/redacted before returning metadata to the renderer.

## Binding And Multi-Use

`file_asset_bindings` separates content from ownership:

- adding a draft attachment binds the asset to the conversation;
- committing or attaching a draft to a user message binds the asset to that message;
- removing a draft attachment or detaching a message attachment marks the relevant binding deleted;
- deleting a binding never deletes the blob.

Blob cleanup remains an explicit future cleanup job. Shared blobs are safe across multiple assets and bindings.

## Derived Output And Revisions

File Asset Store v1 supports revision causes:

```text
imported, url_snapshot, converted, compressed, preview_generated, ai_edited, user_replaced
```

New revisions can point to a parent revision or `derivedFromAssetId`. DFC and preview output continue to register in `file_derivatives` with `parentAssetId`; conversion failure does not mutate the original asset or original blob.

AI edits must create a new revision or derived asset. They must not overwrite the original blob in place.

## Send Preflight

Send planning blocks attachments when:

- the asset is missing, deleted, or still ingesting;
- a `link_and_file` URL asset has no stored local snapshot;
- DFC selected output is missing, stale, failed, or incompatible;
- file detection or route selection still blocks the asset.

`link_only` URL assets keep the prior URL-reference warning behavior. `link_and_file` snapshot failure is a hard block with retry guidance.

## Main / Renderer Boundary

The main process owns:

- filesystem reads and writes;
- storage URI resolution;
- hashing, copying, URL download, and snapshot retry;
- DFC and preview derivative reads.

The renderer receives:

- safe metadata such as filename, type, size, URL status, and snapshot status;
- no raw storage path;
- no raw original local path;
- no full content hashes or blob ids.

## DFC Relation

DFC conversion output remains in `file_derivatives` and is treated as derived output of the original asset. It should preserve:

- original asset and blob;
- `parentAssetId`;
- source hash / lineage metadata in backend-private fields;
- selected send refs through DFC attachment snapshots.

This goal does not rewrite DFC engines or provider multimodal input mapping.

## Hardening Candidates

Recommended follow-up work:

- explicit cleanup for orphan blobs and deleted bindings;
- first-class derived file assets where a DFC output must become user-visible;
- revision promotion APIs for AI edit workflows;
- quota and max-size policy for URL snapshots;
- richer retry diagnostics that stay sanitized across IPC.
