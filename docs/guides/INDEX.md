# Starverse Documentation Hub

> **Status**: active
> **Document Role**: entry
> **Last updated**: 2026-09-26
>
> This page is a navigation index. Use the status and role in [DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md) to determine which documents are authoritative. Historical process records are not implementation guidance by default.

## First-read order

1. [Project README](../../README.md) — project overview and quick start.
2. [Agent Index](../AGENT_INDEX.md) — task routing and maintenance guardrails.
3. [Documentation Status Index](../DOC_STATUS_INDEX.md) — current SSOT, statuses, and directory inventory.
4. [Maintainer entry](../maintenance/maintainer-entry.md) — code boundaries and high-risk areas.
5. [Current system architecture](../architecture/CURRENT_SYSTEM_ARCHITECTURE.md) — current process, data, and module boundaries.

## Find documentation by task

| Task | Preferred entry | Notes |
|---|---|---|
| System architecture / generation pipeline | [Current system architecture](../architecture/CURRENT_SYSTEM_ARCHITECTURE.md) → [architecture/](../architecture/) | Current process, data, and module boundaries. Evidence in topic folders is not automatically an SSOT. |
| Provider / model identity | [Provider architecture](../architecture/provider-architecture/README.md) → [identity analysis](../analysis/model-provider-identity/README.md) | Keep provider architecture SSOT separate from time-bounded audit evidence. |
| File pipeline | [File pipeline](../file-pipeline/README.md) → [DFC ledger](../file-pipeline/document-format-conversion/progress-ledger.md) | Domain entry; the older worker-architecture progress ledger is archived. |
| DFC | [DFC context](../file-pipeline/document-format-conversion/important-context.md) → [v1.2 contract](../file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md) | Current support matrix and boundaries. |
| File type detection / plugins | [Detection README](../file-pipeline/file-type-detection-implementation/README.md) → [plugin distribution](../file-pipeline/plugin-distribution/) | Epoch 2 and plugin distribution records. |
| Model catalog / preferences | [Specs](../spec/) → [notes](../notes/) | Contracts, schemas, queries, and verification records; current source remains authoritative. |
| Development / troubleshooting | [Development setup](DEVELOPMENT_SETUP.md), [troubleshooting](TROUBLESHOOTING.md) | Environment setup and problem diagnosis. |
| Testing / gates | [Test strategy](../maintenance/test-strategy.md) | Test partitions, validation scope, and gates. |
| Credentials / security | [Security docs](../security/) | Credential authority, security boundaries, and platform policy. |
| Documentation governance | [Document governance](../maintenance/document-governance.md) → [redirect map](../maintenance/document-redirect-map.md) | Status, role, archive, and move rules. |

## Decisions and specifications

- Record new architecture decisions in [docs/adr/](../adr/) using [template.md](../adr/template.md).
- [docs/decisions/](../decisions/) is historical reference material for early foundational decisions; do not add new ADRs there.
- [spec/](../spec/), [requirements/](../requirements/), and [rfc/](../rfc/) have distinct meanings: contracts, requirements, and proposals are not interchangeable.

## Historical material

- [docs/archive/](../archive/) contains terminal historical records and is skipped by default.
- [analysis/](../analysis/) contains time-bounded investigations and audits. Unless explicitly marked SSOT, it does not replace current source or owner decisions.
- [refactor/](../refactor/) and [ui-refactoring/](../ui-refactoring/) record different refactoring topics. The old [refactoring/](../refactoring/README.md) folder remains only as a redirect.

## Documentation maintenance rules

1. New non-archived documents declare `Status`, `Document Role`, and `Last updated` at the top.
2. Before moving or renaming a document, update [document-redirect-map.md](../maintenance/document-redirect-map.md), then update entry points and cross-references.
3. Archived documents remain read-only; historical closeouts do not describe current implementation by default.
4. Documentation organization does not change production code, database schemas, or runtime contracts.

## Quick search

~~~sh
rg -n "keyword" docs README.md
rg --files docs | sort
~~~
