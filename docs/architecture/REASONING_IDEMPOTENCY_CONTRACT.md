# Reasoning Details 幂等契约

> 本文档定义 reasoning_details 段落存储的幂等策略。
> 修改 fingerprint 计算逻辑或去重规则前，必须阅读本文档。

## 1. 设计目标

### 1.1 防止数据丢失
- 连续相同的增量内容（如两次输出"好"）**必须都能存储**
- 不同的合法事件必须产生不同的 fingerprint

### 1.2 防止重复存储
- 同一事件的重传（网络重试等）**必须被识别并跳过**
- 相同的 fingerprint 只允许存储一次

## 2. 幂等键设计

### 2.1 UNIQUE 约束

```sql
CREATE UNIQUE INDEX idx_reasoning_segment_fingerprint 
  ON message_reasoning_detail_segments(message_id, segment_fingerprint);
```

**设计目的**：
- 按 (message_id, fingerprint) 唯一约束防止重复插入
- 使用 `INSERT OR IGNORE` 语义静默跳过重复

### 2.2 Fingerprint 计算规则

```typescript
// 稳定幂等键组成
const fingerprintInput = [
  key,              // 稳定标识：id|index|type|format
  offsetBefore,     // 逻辑位置：本次增量前的累计长度
  deltaText,        // 文本增量
  deltaSummary,     // 摘要增量
  deltaData,        // 数据增量（用于加密模型）
  metadataDigest,   // metadata 摘要：JSON(id, index, type, format, signature, encrypted, ...)
].join('\n')

const fingerprint = sha256(fingerprintInput)
```

### 2.3 为什么需要 offsetBefore

**场景**：模型连续输出两个相同字符（如"好""好"）

| 事件 | key | offsetBefore | deltaText | fingerprint |
|------|-----|--------------|-----------|-------------|
| 1 | `\|\|reasoning.text\|` | 0 | "好" | abc123... |
| 2 | `\|\|reasoning.text\|` | 1 | "好" | def456... |

- 两个事件的 `deltaText` 相同
- 但 `offsetBefore` 不同（0 vs 1）
- 因此 fingerprint 不同，**都能成功存储**

### 2.4 为什么不能用 chunkNo

**问题**：chunkNo 在以下场景不稳定：

1. **网络重传**：同一 SSE 事件可能被重新发送，但 chunkNo 递增
2. **重放历史**：从数据库重放时没有原始 chunkNo
3. **分支切换**：不同分支的相同内容 chunkNo 可能不同

```typescript
// ❌ 禁止使用 chunkNo
fingerprint = sha256(`${chunkNo}\n${payload}`)

// 问题：事件 A 的 chunkNo=5，重传后 chunkNo=10
// 两者 fingerprint 不同，导致重复插入
```

### 2.5 为什么不能基于 delta 去重

**问题**：相同的增量内容是合法的

```typescript
// ❌ 禁止在 Merger 层用 deltaText 去重
if (deltaText === previousDeltaText) return null  // 会丢数据！

// 场景："好好好好" 需要保存4个"好"，每个 offset 不同
```

## 3. 跳过规则

### 3.1 Merger 层

`ReasoningDetailStreamMerger.merge()` 返回 `null` 的**唯一条件**：

```typescript
// 无任何增量 + 非首次见到此 key + 无新 metadata
if (!hasAnyDelta && !isFirstSeen && !hasNewMetadata) {
  return null
}
```

### 3.2 Repo 层

`messageRepo.appendReasoningDetailSegments()` 设置 `skipped` 的**唯一条件**：

```typescript
// 快照语义 + 无任何增量 + 无新 metadata
if (isSnapshot && !hasAnyDelta && !hasNewMetadata) {
  skipped++
  continue
}
```

## 4. 插入行为

### 4.1 INSERT OR IGNORE

```sql
INSERT OR IGNORE INTO message_reasoning_detail_segments (
  message_id, detail_id, format, detail_index, type, 
  payload, delta_text, delta_data, delta_summary, 
  created_at, segment_fingerprint
) VALUES (...)
```

- `changes > 0`：成功插入，统计为 `inserted`
- `changes == 0`：fingerprint 冲突，统计为 `ignored`

### 4.2 返回值语义

```typescript
return {
  ok: true,
  received: details.length,     // 接收的事件数
  inserted: number,             // 成功插入数
  skipped: number,              // Merger/Repo 层跳过数
  ignored: number,              // fingerprint 冲突跳过数
  sumDeltaLenInserted: number,  // 插入的增量总长度
}
```

## 5. 不变式验证

以下三条不变式必须在诊断日志中验证：

```typescript
// 1. 事件守恒
received === inserted + skipped + ignored

// 2. 长度守恒（对所有 delta 字段）
totalDeltaLen === sumDeltaLenInserted

// 3. 重放一致性
mergerFinalText === dbFinalText === uiFinalText
```

## 6. 历史数据兼容

### 6.1 NULL fingerprint 处理

迁移前的历史数据 `segment_fingerprint` 可能为 NULL：

- **不追溯去重**：接受历史重复数据
- **新写入强制**：新插入必须有非空 fingerprint

### 6.2 迁移策略

```sql
-- 迁移时不回填历史数据
-- UNIQUE INDEX 已使用 IF NOT EXISTS，幂等创建
CREATE UNIQUE INDEX IF NOT EXISTS idx_reasoning_segment_fingerprint 
  ON message_reasoning_detail_segments(message_id, segment_fingerprint);
```

## 7. 相关文档

- [REASONING_SEMANTIC_CONTRACT.md](./REASONING_SEMANTIC_CONTRACT.md) - 语义契约
- [schema.sql](../../infra/db/schema.sql) - 数据库 Schema
- [messageRepo.ts](../../infra/db/repo/messageRepo.ts) - 存储实现

---

**维护者注意**：修改 fingerprint 计算逻辑会导致幂等失效，必须同时更新本文档。
