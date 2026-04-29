# Phase 2 Persistence And Storage

Phase 2 builds the persistence and local storage foundation for the Starverse file pipeline. It depends on the Phase 1 domain model and does not implement import, upload, URL probing, provider sending, model capability checks, conversion, OCR, transcription, embeddings, or UI.

## Scope

Phase 2 adds:

- durable metadata for original file assets;
- durable metadata for derivatives;
- durable message-to-file attachment records;
- local filesystem storage path allocation rules;
- conservative soft-delete and physical cleanup planning semantics;
- worker and bridge method coverage for the new repository operations.

## Data Responsibilities

### `file_assets`

`file_assets` stores one original asset record. It owns file identity, source, classification, local storage location, ingest status, preview status, timestamps, and soft-delete state.

Important fields:

- `sha256`: retained for future integrity checks and possible future dedupe, but it is intentionally not unique in Phase 2.
- `asset_kind`: uses Phase 1 `AssetKind`.
- `source_kind`: uses Phase 1 `SourceKind`.
- `storage_backend`: currently only `local_fs`.
- `storage_uri`: relative local storage URI, not a provider file reference.
- `deleted_at`: soft-delete marker. It does not imply physical deletion.

### `file_derivatives`

`file_derivatives` stores generated artifacts that belong to one original asset. A derivative never replaces the original.

Important fields:

- `parent_asset_id`: links to `file_assets.id`.
- `derived_kind`: uses Phase 1 `DerivedKind`.
- `storage_uri`: relative local storage URI under the derived layout.
- `generator`: records the producer name or stage.
- `status`: records derivative readiness without implementing generation jobs.
- `meta_json`: optional structured metadata for future derivative-specific details.

### `message_attachments`

`message_attachments` stores the relationship between a message and a file asset. It is the stable base for later context trimming and provider send adaptation.

Important fields:

- `message_id`: cascades when a message is deleted.
- `asset_id`: points to `file_assets` and does not delete the asset when the attachment is removed.
- `ai_payload_kind`: uses Phase 1 `AiPayloadKind`.
- `processing_status`: uses Phase 1 `ProcessingStatus`.
- `include_in_next_request`: future send/context eligibility flag.
- `excluded_reason`: future explanation when an attachment is intentionally excluded.

## Local Storage Layout

The Phase 2 local filesystem layout is:

```text
app-data/
  assets/
    original/
      <bucket>/
        <asset-id>.<ext>
    derived/
      <asset-id>/
        <derivative-id>.<ext>
```

Rules:

- original files and derivatives are physically isolated;
- original files are bucketed by the first two safe characters of `asset-id`;
- extensions are preserved when known and fall back to `bin` when unknown;
- generated paths are centralized in `infra/files/fileStoragePaths.ts`;
- storage backend is `local_fs` only in this phase;
- object storage and provider file references are out of scope.

## Delete Semantics

Deletion is intentionally conservative:

- removing or deleting a message attachment does not delete the file asset;
- soft-deleting a file asset only updates database metadata;
- soft deletion does not remove the original file or derivatives from disk;
- physical cleanup is represented by a planning method that lists candidate storage URIs and always reports `physicalDeletePerformed: false`;
- derivative cleanup is reserved for a later dedicated garbage collection step.

The guiding rule is to keep extra files rather than risk deleting user data before reference semantics are complete.

## Dedupe Policy

Phase 2 does not implement cross-session dedupe, shared file references, or reference-counted garbage collection.

Reason:

- cross-session dedupe requires shared ownership semantics;
- safe deletion would require complete reference queries and recovery behavior;
- adding it before the full import and lifecycle design would create file-loss risk.

`sha256` is stored as a non-unique field so later phases can evaluate integrity and dedupe strategies without changing the asset table shape.

## Follow-On Usage

Phase 3 can use these tables and storage path helpers to register local uploads and URL imports. Phase 4 can mount assets onto messages using `message_attachments`. Phase 5 can use `ai_payload_kind` and `processing_status` as inputs to provider adaptation and model capability checks.

