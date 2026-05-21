# Debug Investigation Records (Archived)

**Status**: archived  
**Archived**: 2026-05-22  
**Owner**: DGR-1

---

## Purpose

This directory contains archived debug investigation records from Starverse development. These documents provide historical reference for debugging techniques, patterns, and solutions.

---

## Archive Contents

| Document | Topic | Archived | Reference Value |
|----------|-------|----------|-----------------|
| `DEBUG_OPENROUTER_REQUEST_LOG.md` | OpenRouter request logging guide | 2026-05-22 | Medium — Security warnings, usage scenarios |
| `DEBUG_OPENROUTER_REQUEST_LOG_IMPL.md` | OpenRouter request logging implementation | 2026-05-22 | Medium — Code changes, performance analysis |
| `DEBUG_OPENROUTER_REQUEST_QUICK_REF.md` | OpenRouter request logging quick reference | 2026-05-22 | Low — Duplicate content |
| `DEBUG_OPENROUTER_REQUEST_COMPLETION.md` | OpenRouter request logging completion report | 2026-05-22 | Low — Process record |

---

## Archive Reason

These documents were archived because:

1. **Task completed**: The OpenRouter request logging feature was completed on 2026-01-31
2. **Content redundancy**: 4 documents with ~1064 lines, significant content overlap
3. **Temporary nature**: Debug documentation with limited long-term value
4. **Contradictions**: QUICK_REF.md and LOG.md have conflicting security statements
5. **Governance compliance**: Following "delete DEBUG_*.md after resolution" rule (with archive instead of delete)

---

## Usage Guidelines

**When to read**:
- Debugging similar OpenRouter request logging issues
- Understanding historical debug techniques
- Reference for security audit patterns

**When to skip**:
- Current implementation debugging (check active docs first)
- General OpenRouter integration (see `docs/architecture/OPENROUTER_INTEGRATION_SUMMARY.md`)

---

## Related Documents

- [document-redirect-map.md](../../maintenance/document-redirect-map.md) — Redirect map for moved files
- [document-governance.md](../../maintenance/document-governance.md) — Archive rules
- [archive/README.md](../README.md) — Main archive index

---

## Original Locations

| Document | Original Path |
|----------|---------------|
| DEBUG_OPENROUTER_REQUEST_LOG.md | `docs/DEBUG_OPENROUTER_REQUEST_LOG.md` |
| DEBUG_OPENROUTER_REQUEST_LOG_IMPL.md | `docs/DEBUG_OPENROUTER_REQUEST_LOG_IMPL.md` |
| DEBUG_OPENROUTER_REQUEST_QUICK_REF.md | `docs/DEBUG_OPENROUTER_REQUEST_QUICK_REF.md` |
| DEBUG_OPENROUTER_REQUEST_COMPLETION.md | `docs/DEBUG_OPENROUTER_REQUEST_COMPLETION.md` |
