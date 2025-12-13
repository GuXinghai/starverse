# Gate 0–2（TC-00~TC-02）15–30 分钟可跑完的关卡检查

目标：用“先验产物齐全 → 再验边界锁死 → 最后验可切换”的方式，尽早抓住三类关键失败：

- **ADR（可审计决策）**：只有模板、没有触发条件；或偏离 SSOT 但没有 ADR。
- **Strangler（单点门面分流）**：开关散落、多处分流点、调用方绕开门面。
- **Branch by Abstraction（抽象承载替换）**：调用方依赖具体实现而非抽象，导致无法渐进替换。

---

## 一键执行（推荐）

在仓库根目录：

- 运行（含最小单测）：`powershell -ExecutionPolicy Bypass -File scripts/gates/tc00-tc02.ps1`
- 跳过单测（更快）：`powershell -ExecutionPolicy Bypass -File scripts/gates/tc00-tc02.ps1 -SkipTests`
- 直接用 Node（跨平台）：`node scripts/gates/tc00-tc02.mjs`（跳过单测：`node scripts/gates/tc00-tc02.mjs --skip-tests`）

脚本会做：

1. **TC-00**：检查 `docs/refactor/*` 三份产物存在；并抽检 checklist 是否包含关键 “必须/禁止” 条款；检查 `plan.md` 是否对每个 Gate 写死 allowlist。
2. **TC-01**：检查 ADR 模板/README/至少 1 条编号 ADR；并验证 README 中存在可执行触发条件。
3. **TC-02**：检查 interface/facade/flags 结构存在；硬验证开关不泄漏；验证 send/retry 入口只走 Facade；跑最小可切换性单测。

---

## 手工复核（可选，用于 Code Review）

### TC-00（SSOT 对齐）
- 产物存在：`docs/refactor/plan.md`、`docs/refactor/compliance-checklist.md`、`docs/refactor/risk-log.md`
- checklist 必须是“可勾选、逐条硬约束”，而不是建议/愿景
- `plan.md` 必须写死每个 Gate 的“目录 allowlist（Anti-smear）”

### TC-01（ADR Scaffold）
- `docs/adr/template.md` 必须含 `Context/Decision/Consequences`
- `docs/adr/README.md` 必须含命名规则、状态枚举、触发条件（必须写 ADR 的硬规则）
- 至少 1 条编号 ADR（`NNN-title.md`）

### TC-02（Facade + 单点开关）
- 抽象接口：`src/next/generation/IGenerationPipeline.ts`
- 单点门面：`src/next/generation/GenerationFacade.ts`
- 集中 flags：`src/next/config/flags.ts`（只允许 Facade 读取）
- send/retry 入口只依赖 Facade（不得直连 legacy）
