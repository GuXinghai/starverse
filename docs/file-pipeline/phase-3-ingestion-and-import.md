# Phase 3 Ingestion And Import

Phase 3 turns external file inputs into internal Starverse file assets. It builds on the Phase 1 rule layer and the Phase 2 persistence and storage foundation.

This phase does not send files to models, attach files to messages, perform capability checks, build UI, or run derivative jobs.

## Scope

Phase 3 adds:

- local file ingestion into `file_assets`;
- URL probing and URL source registration;
- URL retention modes for link-only and link-plus-local-copy workflows;
- explicit import, probe, and materialization statuses;
- structured URL source metadata persisted with the asset record;
- conservative classification when MIME and extension disagree.

## Local File Ingestion

Local ingestion is treated as a materialization-first flow:

1. Read local file metadata.
2. Normalize extension and MIME.
3. Run the Phase 1 file profile rules.
4. Compute `sha256`.
5. Allocate a Phase 2 original-asset storage path.
6. Copy the file into storage using an atomic temp-file replacement step.
7. Create a `file_assets` record with `storage_backend = local_fs`.
8. Return a structured ingestion result.

Unsupported or future-convertible formats are still allowed to become assets. Their `processingStatus`, `isNativeSupportedForMvp`, and `isConvertibleCandidate` values describe later handling eligibility.

## URL Import

URL import is not equivalent to downloading a file. The URL itself may remain useful even when the current device cannot probe or save a local copy.

Allowed schemes are `http` and `https`. Other schemes are rejected before asset creation.

URL probing attempts:

1. `HEAD` with redirects enabled.
2. Controlled fallback `GET` with `Range: bytes=0-0` when `HEAD` is unavailable or fails as a request.
3. Collection of `Content-Type`, `Content-Length`, status code, resolved URL, and warning details.
4. Classification using probed MIME and URL suffix through the Phase 1 rule layer.

When MIME and suffix conflict, classification is conservative and records a warning. Examples include a `.jpg` URL returning `application/pdf`, or a `.png` URL returning `text/html`.

## URL Retention Modes

`link_only`:

- preserves `originalUrl`, `resolvedUrl`, and probe metadata;
- does not attempt to store a local file copy;
- creates a `file_assets` record with `storage_backend = remote_url`;
- keeps URL reference eligibility available for later send adaptation.

`link_and_file`:

- preserves URL metadata;
- attempts to download and store a local copy after a successful probe;
- uses `storage_backend = local_fs` when materialization succeeds;
- falls back to a `remote_url` asset when materialization fails;
- keeps URL reference eligibility even when the local file copy is unavailable.

## Status Model

The import result exposes:

- `importStatus`: `pending`, `probing`, `materializing`, `ready`, `failed`, `probe_failed`, or `materialization_failed`.
- `probeStatus`: `accessible`, `probe_failed`, or `rejected`.
- `materializationStatus`: `not_requested`, `materializing`, `stored`, or `materialization_failed`.

The persisted `file_assets.ingest_status` is extended for URL failure states. URL-specific detail is persisted in `source_meta_json` so later phases do not need to infer state from logs or UI text.

## URL Source Metadata

URL imports persist structured source metadata:

- `originalUrl`
- `resolvedUrl`
- `retentionMode`
- `importStatus`
- `probeStatus`
- `materializationStatus`
- `lastProbeAt`
- `probeWarning`
- `contentTypeFromProbe`
- `contentLengthFromProbe`

This metadata is intended for Phase 4 attachment decisions and Phase 5 send-mode selection. It is not a provider request payload.

## Failure Semantics

The following decisions are frozen for this phase:

- local file read or storage failure prevents creating a local asset record;
- invalid URL syntax or a rejected scheme prevents creating a URL asset record;
- device-side URL probe failure creates a URL asset record when the URL syntax and scheme are allowed;
- device-side materialization failure creates a URL asset record and records that no local copy is available;
- probe or materialization failure does not automatically remove URL reference eligibility;
- warnings explain local-device limitations without deciding provider send capability.

The required user-facing meaning is: the current device could not complete access or storage, so a local file copy may be unavailable; the URL remains retained for later send adaptation.

## Phase Boundaries

Phase 3 does not:

- create message attachments as part of ingestion;
- serialize provider content parts;
- check model capabilities;
- trim chat context;
- generate OCR, transcript, embedding, preview, conversion, or compression derivatives;
- implement cross-session dedupe or shared-reference garbage collection;
- add UI.

Phase 4 may use ingestion results and `file_assets` records when deciding how to mount assets to messages. Phase 5 may use URL metadata, `AiPayloadKind`, and `ProcessingStatus` to choose send modes.
