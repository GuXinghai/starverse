# ADR-001: Persistent hidden New chat template

Status: accepted

## Decision

Starverse owns one hidden system project with `system_key = new` and one hidden template conversation with `system_key = new_template`. The template is the conversation-scoped owner of the draft, attachment bindings, model selection and generation configuration before the first send. It is excluded from ordinary project, conversation, search, count, archive and bulk-operation read models.

New Chat opens the existing template and never creates a second template. Missing template data is recreated transactionally; duplicate or contaminated template data blocks with an integrity error and is never silently repaired.

The first send uses one idempotent SQLite transaction to create the Inbox conversation, Main branch, user message, assistant placeholder, attachment bindings and compatible route provenance when applicable, then resets the template according to the persisted policy. Provider request construction, secret resolution and network egress occur only after that transaction commits. Post-commit provider failure retains the formal user turn and failed assistant.

## Settings

- Startup navigation: `open_new` (default), `restore_last_formal`, or `projects_only`.
- Startup reset: independent model/config and draft/attachment flags, both enabled by default.
- Post-send reset: `reset_all` (default) or `preserve_model_config`; draft and template attachment bindings are always cleared after materialization.

## Provider boundary

Native providers and `openai_chat_compatible` share the same template, session configuration, picker and renderer send coordinator. Compatible request building, wire parsing, credentials and governed dual transport remain protocol-specific below runtime dispatch. No legacy alias, fallback or compatibility bridge is introduced.

## Security boundary

The four proxy routes and dual transports remain unchanged. `compatibility_first` and `strict_ssrf` are independent endpoint policies under D16; neither policy may rewrite or downgrade the selected proxy route or transport.
