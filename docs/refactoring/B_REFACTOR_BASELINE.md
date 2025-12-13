# B 变更集 - TS 错误基线与回滚护栏

baseline_error_count: 45

## 建立时间
2025年12月13日 - 在 A 变更集全绿后建立

## 前置状态快照

### ✅ 已验收的 A 改动
- 测试全绿：`npx vitest run` → 396 passed, 2 skipped, 0 failed, 0 unhandled
- `useMessageSending` 入参归一化（getter helper + 默认值集中处理）
- phaseStateMachine 结构化 abort signal（不依赖文案）
- `npm run build` 的 TS 错误数量与类别未变

### 📊 既有 TS 错误基线
- **总数**：45 errors
- **建立命令**：`npx vue-tsc 2>&1 > ts-baseline-snapshot.txt`
- **快照保存**：[ts-baseline-snapshot.txt](../ts-baseline-snapshot.txt)
- **关键错误类别**：
  - Reasoning capability missing fields（3 errors）
  - StreamChunk 类型属性缺失（8 errors）
  - Unused imports（15 errors）
  - Provider type mismatches（4 errors）
  - Other（15 errors）

## B 变更集护栏规则

### 🚨 禁止条件（B 中任何一步如违反 → 立即 rollback）
1. **TS 错误增加**：新增错误数 > 0（比对基线）
2. **新增错误类别**：未曾出现过的 error code（如 TS9999）
3. **测试失败**：`npx vitest run` 出现 fail 或 unhandled（容忍度 0）

### ✅ 必须验收检查点

每完成 B 的一个步骤后，执行：

```bash
# 步骤验收三部曲
1. vitest 全绿
   npx vitest run > /dev/null && echo "✅ vitest pass" || echo "❌ vitest fail"

2. TS 基线 + 旧链路黑名单门禁（跨平台）
   node scripts/b_gate.mjs
```

## B 执行顺序（共 5 步）

| 步骤 | 目标 | 文件/范围 | 验收口径 |
|------|------|---------|--------|
| 1 | 删类型复活源 | `src/types/providers.ts`、`electron/types/openrouter-service.d.ts`、legacy exports | grep 旧接口名 = 0 |
| 2 | 删通信旁路 | `electron/ipc/`、`src/utils/electronBridge.ts` | grep 旧 handler name = 0 |
| 3 | 迁移运行时调用 | `src/services/`, `src/stores/`, `src/composables/` | grep 旧符号引用 = 0 |
| 4 | 删旧实现文件 | `buildModelCapability*`, old map, old normalize | grep 旧函数名 = 0 |
| 5 | 落 grep 黑名单门禁 | 配置 CI 脚本、文档 | 黑名单命中 = 0 + vitest green |

## 旧链路黑名单 Gate

### 禁止命中的符号/文件（任何阶段）
使用 `node scripts/b_gate.mjs` 统一检查（递归扫描 src/electron/infra/tests，且包含 *.d.ts）。

### 运行时链路验证
- **网络请求**：无 `/api/v1/parameters` 或 `/parameters/` 请求（抓包或日志）
- **内存中的旧对象**：`window.aiChatService?.getModelParameters` 不存在
- **导出白名单**：`src/services/index.ts` 不导出任何 `*Parameters` 相关函数

## Rollback 协议

如果 B 中任何一步违反护栏规则，执行：

```bash
# 1. 停止当前步骤
# 2. 运行 vitest 查看失败原因
npx vitest run 2>&1 | grep -A 10 "FAIL"

# 3. 查看 TS 错误是否增加
npx vue-tsc 2>&1 | wc -l

# 4. 联系 Agent 提供上下文（git diff + 错误输出）
git diff HEAD~1 > rollback-context.patch
npx vue-tsc 2>&1 > rollback-errors.txt

# 5. 回滚该步骤
git reset --hard HEAD
```

## DoD（Definition of Done）

B 整体完成标准：

1. ✅ `npx vitest run`：396 passed, 2 skipped, 0 failed, 0 unhandled
2. ✅ `npx vue-tsc` 错误数 ≤ 45（不增加）
3. ✅ 所有黑名单 gate 命中 = 0
4. ✅ 无网络请求到 `/parameters` 端点
5. ✅ `AppModel.capabilities` 为唯一能力数据源（registry 只读、只用于派生重建，不覆盖）
6. ✅ 所有改动点附上 `revival_risk_reason` 注释（防复活）
7. ✅ PR 描述包含本文档链接与验收结果

---

**建立者**：Agent  
**建立时间**：2025-12-13  
**下一步**：开始 B 第 1 步（删类型复活源）
