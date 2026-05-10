# 41. Phase 4 Owner Decision Record

**状态**: Phase 4 closeout accepted as Phase 5 handoff-ready
**日期**: 2026-05-10
**阶段**: Phase 4 final closeout — Owner decisions
**父文档**: `40-phase4-final-closeout-report.md`

Phase 4 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。

---

## 1. Context

P4-D implementation (P4-D1~D5) completed. Gemini CLI external audit passed with follow-ups. All P4-A/P4-B/P4-C/P4-D documentation packages committed (`ed7ccb6` → `1a25f6d`).

---

## 2. Owner Decisions

### 2.1 P4-D Implementation Closeout

**Decision**: Owner accepts P4-D implementation closeout. P4-D1~D5 documents are accepted as the Phase 4 final acceptance package.

### 2.2 Phase 4 Closeout Status

**Decision**: Phase 4 remains NOT completed. Owner accepts the 7 closeout blockers (BL-01~BL-07) as Phase 5 handoff items. Phase 4 code implementation (P4-A/P4-B/P4-C) is accepted as completed with follow-ups.

### 2.3 Phase 5 Priority P0 Items

**Decision**: BL-06 (`SV_ENGINE_PLUGIN_DEV_MODE=1` production guard) and BL-07 (legacy `messageAsset.*` IPC path sanitization) are Phase 5 priority P0 items. Both must be resolved before production release.

### 2.4 Manual Smoke

**Decision**: 43 manual smoke cases remain `not_run`. Owner acknowledges this gap and requires execution in Phase 5 / Electron environment before production release.

### 2.5 Known Baseline Issues

**Decision**: 17 pre-existing TS errors and derivativeJobService HTML targetKind failure remain known baseline issues. These are P2 maintenance items for Phase 5.

### 2.6 Production Runtime / Signing / Trusted Root

**Decision**: Real runtime packaging (RP-1~RP-10), production signing workflow (TK-1/TK-2/TK-6/TK-7), and production trusted root key pair generation are Phase 5 handoff. No real runtime is claimed completed.

### 2.7 Phase 5 Planning

**Decision**: Phase 5 planning approved. Scope includes:
- Real runtime acquisition and packaging
- Production key management and signing pipeline
- BL-06/BL-07 P0 fixes
- 43-item manual smoke execution
- TS error cleanup (P2)
- derivativeJobService fix (P2)
- Sanitization hardening (P1-1~P1-4)

---

## 3. Explicit Non-Goals (reconfirmed)

- 不写全项目完成
- 不写主工程已完成
- 不写完整插件系统已完成
- 不写真实 Tika / LibreOffice / ffprobe / Pandoc runtime completed
- 不写第三方插件生态已完成
- Phase 4 不是项目收口

---

## 4. Documents Accepted

| Phase | Document | Status |
|-------|----------|--------|
| P4-A | `20-p4a-official-plugin-marketplace-closeout.md` | completed |
| P4-B | `26-p4b-magika-official-managed-plugin-closeout.md` | completed with follow-ups |
| P4-C | `34-p4c-external-conversion-engines-closeout.md` | completed with follow-ups (Gemini CLI audit passed) |
| P4-D planning | `35-p4d-final-acceptance-planning.md` | completed |
| P4-D1 | `36-p4d1-baseline-verification-ledger.md` | completed |
| P4-D2 | `37-p4d2-manual-smoke-execution-package.md` | completed |
| P4-D3 | `38-p4d3-security-privacy-followup-audit.md` | completed |
| P4-D4 | `39-p4d4-provider-legacy-decision-package.md` | completed |
| P4-D5 | `40-phase4-final-closeout-report.md` | completed |
| P4-Owner | `41-phase4-owner-decision-record.md` (this doc) | accepted |

---

## 5. Commit

- **文件**: `41-phase4-owner-decision-record.md` (new)
- **READNE**: 索引更新
- **commit message**: `docs: record phase 4 owner closeout decision`
