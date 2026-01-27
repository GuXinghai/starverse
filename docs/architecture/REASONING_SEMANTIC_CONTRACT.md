# Reasoning Details 语义契约

> 本文档定义 reasoning_details 在 Starverse 系统中的语义规范。
> 所有涉及 reasoning_details 处理的代码必须遵循此契约。

## 1. 上游假设（OpenRouter Provider）

OpenRouter 的 `reasoning_details` 字段可能采用以下两种语义之一：

### 1.1 快照语义 (Snapshot)
- 每次返回**完整的推理内容**（累积式）
- 后续 chunk 包含前序所有内容
- 例：`["思"]` → `["思考"]` → `["思考中"]`

### 1.2 增量语义 (Delta)
- 每次返回**仅本次新增的内容**
- 后续 chunk 不重复前序内容
- 例：`["思"]` → `["考"]` → `["中"]`

**关键假设**：上游行为不可预测，系统必须自动检测并处理两种语义。

## 2. 系统内部语义（Merger 输出）

系统内部**只接受经过归一化的增量语义**。

### 2.1 归一化规则

`ReasoningDetailStreamMerger` 负责将任意上游语义转换为标准增量：

```
上游 chunk → Merger.merge() → MergedDelta {
  key,                 // 稳定标识符
  offsetBefore,        // 逻辑位置（累计长度）
  offsetAfter,
  deltaText,           // 真正的增量
  deltaSummary,
  deltaData,
  isSnapshot,          // 诊断：是否检测到快照语义
  hasNewMetadata,      // 是否有 metadata 变化
  metadataDigest,      // metadata 摘要（用于幂等）
}
```

### 2.2 稳定 Key 定义

Key 由以下字段拼接：`${id}|${index}|${type}|${format}`

- **id**: detail 的唯一标识符（若存在）
- **index**: detail 在数组中的索引
- **type**: 类型，如 `reasoning.text`, `reasoning.summary`, `reasoning.encrypted`
- **format**: 格式，如 `markdown`

### 2.3 必须保留的字段

为确保 Provider 切换时的兼容性，以下字段**必须在事件结构中保留**：

| 字段 | 用途 |
|------|------|
| `id` (detail_id) | 唯一标识符 |
| `index` | 在数组中的位置 |
| `type` | 语义类型 |
| `format` | 内容格式 |
| `signature` | 完整性签名（若存在） |
| `encrypted` | 加密标记（若存在） |

## 3. 下游约束

### 3.1 禁止假设上游语义

下游代码（DB 层、UI 层）**不得自行判断**快照/增量语义：

```typescript
// ❌ 禁止
if (detail.text.startsWith(previousText)) { /* 假设快照 */ }

// ✅ 正确：只使用 Merger 输出的 deltaText
appendToDb({ deltaText: merged.deltaText })
```

### 3.2 幂等性依赖 offset

下游幂等去重**必须基于 offsetBefore**，不得基于 chunkNo 或 delta 内容：

```typescript
// ❌ 禁止：chunkNo 在重传时不稳定
fingerprint = sha256(`${chunkNo}\n${payload}`)

// ✅ 正确：offsetBefore 是稳定的逻辑位置
fingerprint = sha256(`${key}\n${offsetBefore}\n${deltaText}\n${metadataDigest}`)
```

## 4. 事件流图示

```
OpenRouter SSE
     │
     ▼
mapChunkToEvents()  ─── 纯函数，只转换不假设语义
     │
     ▼
MessageDeltaReasoningDetail { detail, messageId }
     │
     ▼
ReasoningDetailStreamMerger.merge()  ─── 归一化为增量语义
     │
     ▼
MergedDelta { key, offsetBefore, deltaText, ... }
     │
     ▼
messageRepo.appendReasoningDetailSegments()  ─── 幂等落库
```

## 5. 数据重建策略（Aggregator）

### 5.1 权威数据源

`buildReasoningDetailsArray` 从 DB 重建 reasoning_details 时，**必须优先使用 delta 列**：

| 优先级 | 数据源 | 用途 |
|--------|--------|------|
| 1（主） | `segment.deltaText` / `deltaData` / `deltaSummary` | 新写入数据的权威来源 |
| 2（兜底） | `payload.text` / `payload.data` / `payload.summary` | 历史数据兼容（仅当所有 delta 列为空时） |

### 5.2 历史兼容策略

**重要**：`payload.text` 回退是**历史数据兼容策略**，不是正常数据流的期待。

```typescript
// ✅ 正确：聚合器实现
for (const seg of segments) {
  text += seg.deltaText ?? ''  // 主数据源
}
// 仅当所有 delta 列为空时，才从 payload 兜底
if (!text && !summary && !data) {
  const p = JSON.parse(seg.payload)
  text = p.text ?? ''  // 历史兼容兜底
}
```

**禁止假设**：
- ❌ 不得假设 `payload.text` 总是可靠
- ❌ 不得在新代码中依赖 `payload.text` 作为主数据源
- ✅ 上游必须确保 `deltaText` 总是被正确填充

### 5.3 验收护栏

修改 reasoning/DB repo 相关代码时，**必须运行**：

```bash
# Repo 聚合一致性测试
npx vitest run infra/db/repo/messageRepo.reasoningSegments.test.ts

# Stress 回归测试 (100 场景，mismatch 必须为 0)
node scripts/gates/tc19-reasoning-stress.mjs
```

## 6. 相关文档

- [REASONING_IDEMPOTENCY_CONTRACT.md](./REASONING_IDEMPOTENCY_CONTRACT.md) - 幂等策略
- [mapChunkToEvents.ts](../../src/next/openrouter/sse/mapChunkToEvents.ts) - 事件映射
- [reasoningDetailStreamMerger.ts](../../src/shared/reasoningDetailStreamMerger.ts) - Merger 实现

---

**维护者注意**：修改 reasoning_details 处理逻辑前，请先阅读并理解本契约。
