# Phase 4 Message Attachment Semantics

Phase 4 moves file assets into the message system. It defines input draft recovery, draft attachment ownership, formal user-message attachment migration, edit cloning, detach semantics, lifecycle marks, and semantic attachment snapshots.

This phase still does not serialize provider payloads, choose send modes, check model capabilities, build UI, refresh URL copies, or delete files from disk.

## Scope

Phase 4 adds:

- current-conversation input draft persistence;
- draft attachment persistence;
- atomic migration from draft attachments to a newly created user message;
- edit-mode draft cloning from an existing user message;
- detach and abandoned lifecycle markers;
- asset ownership queries;
- candidate attachment snapshot calculation for later context trimming and provider adaptation.

## Persistence Model

`conversation_drafts` stores one input-box draft per conversation:

- `conversation_id`
- `draft_text`
- `draft_mode`: `compose` or `edit`
- `editing_source_message_id`
- `updated_at`

`draft_attachments` stores attachment references that belong to the current input draft:

- `conversation_id`
- `asset_id`
- `attachment_order`
- `ai_payload_kind`
- `processing_status`
- `include_in_next_request`
- `excluded_reason`

`message_attachments` remains the formal user-message attachment table.

`file_attachment_lifecycle` stores non-destructive lifecycle marks for assets that are detached or explicitly abandoned. It does not delete files.

## Ownership Invariants

Attachment reference ownership is explicit:

- draft references live in `draft_attachments`;
- formal message references live in `message_attachments`;
- draft references are a transition layer, not final ownership;
- user-uploaded attachments formally belong to user messages;
- assistant messages do not receive automatic user attachment copies.

An attachment reference must not be both a draft row and a formal message row. Sending migrates draft rows into new message attachment rows and clears the draft rows in the same transaction.

The underlying `file_assets` record is a shared asset object. Edit cloning may create a new draft reference to the same asset while the original message reference remains frozen. The clone is a new reference, not mutation of the old reference.

The no-double-ownership invariant applies to attachment relation rows, not to the asset record itself:

- the same `file_assets.id` may be referenced by multiple relation rows;
- edit cloning is allowed to create a new draft relation that points to an asset already referenced by the frozen source message;
- changing the edit draft relation must not change the source message relation;
- future cleanup must reason from relation references and lifecycle marks, not from a rule that an asset may appear only once.

## Draft Recovery

Draft recovery is intentionally narrow:

- only the current conversation input draft is restored;
- draft text and draft attachments are restored as one snapshot;
- no multi-version draft history is created;
- no per-history-message draft cache is created;
- no cross-branch smart draft migration is attempted;
- draft recovery failure must not affect formal message attachments.

## Send-Time Migration

The send boundary is user-message creation:

1. Before sending, attachments belong to the draft.
2. The service creates a user message.
3. Draft attachments are copied into `message_attachments` for that user message.
4. Draft attachments and draft text are cleared.
5. If message creation fails, the transaction rolls back and the draft remains intact.
6. If later assistant generation fails, ownership still remains with the created user message.

This phase treats migration as a transaction around message creation and attachment transfer. It is not delayed until provider success.

## Edit Clone Semantics

Editing is clone-based:

- the source user message is treated as frozen history;
- entering edit mode creates an edit draft from the source message text and attachments;
- later draft changes do not mutate the source message or its formal attachments;
- sending the edit draft follows the normal new user-message migration path, including draft attachment migration to the new edited message relation set (`conversationDraft.attachToMessage`);
- historical user message attachment rows are not modified in place.

## Resend, Regenerate, And Branches

Default semantic rules:

- resending a user message inherits that user message attachment set as the default reference set;
- assistant regeneration does not mutate the preceding user message attachments;
- branch switching naturally changes the visible attachment candidates because candidates are derived from user messages present on that branch path.

## Candidate Attachment Snapshot

The snapshot interface returns semantic attachment rows, not provider content parts.

Each item includes:

- `messageId`
- `assetId`
- `aiPayloadKind`
- `processingStatus`
- inclusion flag;
- exclusion reason;
- asset source and storage backend.

Current exclusion reasons are semantic only, such as manual exclusion, unsupported processing status, or soft-deleted asset. Model capability pruning is reserved for Phase 5.

## URL Asset Semantics

Messages always attach the unified `file_assets` record.

- `link_only` URL imports attach a URL-source asset.
- `link_and_file` URL imports attach the same unified asset even when it has both URL metadata and a local copy.
- URL source metadata remains on the asset, not the message attachment row.
- remote URL changes do not trigger automatic local copy refresh.
- local URL-copy refresh is manual by default and is not implemented in this phase.

## Delete, Detach, And Lifecycle

Deletion remains conservative:

- removing from draft deletes only the draft reference;
- detaching from a message deletes only that message attachment row;
- deleting a message does not delete asset files;
- detached and abandoned states are lifecycle marks for future cleanup decisions;
- physical cleanup and global garbage collection are out of scope.

The guiding rule remains: retain extra assets rather than risk deleting user data.

## Phase Boundary

Phase 4 does not:

- implement UI panels or visual interactions;
- serialize OpenRouter or provider content parts;
- choose URL, base64, or provider file reference send mode;
- check model capabilities;
- trim context into provider payloads;
- run OCR, transcription, embeddings, conversion, or compression;
- refresh URL local copies automatically;
- delete local files or run global GC.
