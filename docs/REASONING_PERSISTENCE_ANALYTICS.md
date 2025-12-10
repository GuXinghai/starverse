# Starverse · OpenRouter Reasoning 持久化与分析方案

本文档说明如何在 SQLite 数据库中持久化推理配置、使用统计与成本数据，以支持：
- 对话级推理配置保存与恢复
- 推理使用情况分析（档位分布、成本统计）
- 历史账单查询与优化建议

## 一、SQLite Schema 设计

### 1.1 对话表 (conversations) 扩展

**现有字段**（推测）：
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  model TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  status TEXT,
  -- ... 其他字段
);
```

**新增字段（reasoning 配置）**：
```sql
ALTER TABLE conversations
ADD COLUMN reasoning_control_mode TEXT DEFAULT 'effort';
-- 'disabled' | 'effort' | 'max_tokens' | 'auto'

ALTER TABLE conversations
ADD COLUMN reasoning_effort TEXT DEFAULT 'medium';
-- 'minimal' | 'low' | 'medium' | 'high' | 'none'

ALTER TABLE conversations
ADD COLUMN reasoning_max_reasoning_tokens INTEGER DEFAULT NULL;
-- 用户设定的推理预算（仅 max_tokens 模式）

ALTER TABLE conversations
ADD COLUMN reasoning_max_completion_tokens INTEGER DEFAULT NULL;
-- 顶层 max_tokens（可选）

ALTER TABLE conversations
ADD COLUMN reasoning_show_content INTEGER DEFAULT 0;
-- 0=隐藏, 1=显示推理内容

ALTER TABLE conversations
ADD COLUMN reasoning_strategy_config TEXT DEFAULT NULL;
-- JSON 格式存储 StarverseReasoningStrategy（高级设置）
```

**迁移脚本示例**（SQLite）：
```sql
-- migration_v1_to_v2_reasoning.sql
PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- 1. 新增列（默认值设为安全值）
ALTER TABLE conversations ADD COLUMN reasoning_control_mode TEXT DEFAULT 'effort';
ALTER TABLE conversations ADD COLUMN reasoning_effort TEXT DEFAULT 'medium';
ALTER TABLE conversations ADD COLUMN reasoning_max_reasoning_tokens INTEGER DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN reasoning_max_completion_tokens INTEGER DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN reasoning_show_content INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN reasoning_strategy_config TEXT DEFAULT NULL;

-- 2. 兼容旧数据：从旧 JSON 字段迁移（若存在）
-- 假设旧配置存储在 metadata TEXT 列中
UPDATE conversations
SET 
  reasoning_control_mode = CASE 
    WHEN json_extract(metadata, '$.reasoningEnabled') = 1 THEN 'effort'
    ELSE 'disabled'
  END,
  reasoning_effort = COALESCE(json_extract(metadata, '$.reasoningEffort'), 'medium'),
  reasoning_show_content = CASE 
    WHEN json_extract(metadata, '$.reasoningVisibility') = 'visible' THEN 1
    ELSE 0
  END
WHERE metadata IS NOT NULL;

COMMIT;

PRAGMA foreign_keys=ON;
```

### 1.2 消息表 (messages) 扩展

**新增字段（运行时统计）**：
```sql
ALTER TABLE messages
ADD COLUMN reasoning_tokens_used INTEGER DEFAULT NULL;
-- 实际使用的推理 tokens（从 usage.reasoning_tokens 获取）

ALTER TABLE messages
ADD COLUMN reasoning_cost REAL DEFAULT NULL;
-- 推理成本（USD，基于 pricing.internal_reasoning）

ALTER TABLE messages
ADD COLUMN reasoning_effort_actual TEXT DEFAULT NULL;
-- 实际使用的 effort（若 OR 返回）

ALTER TABLE messages
ADD COLUMN reasoning_latency_ms INTEGER DEFAULT NULL;
-- 推理部分的延迟（毫秒，若可测量）
```

**用途**：
- 在消息发送后，从响应的 `usage` 字段提取 `reasoning_tokens` 并保存
- 通过 `/api/v1/generation?id=<gen_id>` 查询更精确的 token 计数与成本
- 用于后续分析与优化

### 1.3 新表：推理使用统计 (reasoning_usage_stats)

**表结构**：
```sql
CREATE TABLE IF NOT EXISTS reasoning_usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  
  -- 配置参数
  control_mode TEXT NOT NULL, -- 'effort' | 'max_tokens'
  effort TEXT,                 -- 'minimal' | 'low' | 'medium' | 'high'
  max_reasoning_tokens INTEGER,
  
  -- 使用统计
  reasoning_tokens_used INTEGER NOT NULL DEFAULT 0,
  completion_tokens_used INTEGER NOT NULL DEFAULT 0,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  
  -- 成本统计（USD）
  reasoning_cost REAL DEFAULT 0,
  completion_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  
  -- 性能指标
  latency_ms INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_reasoning_stats_conversation ON reasoning_usage_stats(conversation_id);
CREATE INDEX idx_reasoning_stats_model ON reasoning_usage_stats(model_id);
CREATE INDEX idx_reasoning_stats_effort ON reasoning_usage_stats(effort);
CREATE INDEX idx_reasoning_stats_created_at ON reasoning_usage_stats(created_at);
```

**插入示例**：
```sql
INSERT INTO reasoning_usage_stats (
  conversation_id, message_id, model_id,
  control_mode, effort,
  reasoning_tokens_used, completion_tokens_used, total_tokens_used,
  reasoning_cost, completion_cost, total_cost,
  latency_ms, created_at
) VALUES (
  'conv_123', 'msg_456', 'anthropic/claude-3.7-sonnet',
  'effort', 'high',
  2048, 512, 2560,
  0.004096, 0.001536, 0.005632,
  8500, 1701234567890
);
```

## 二、数据流设计

### 2.1 保存对话级配置

**触发点**：
- 用户修改推理设置（effort 档位、max_tokens、可见性等）
- 通过 `usePersistenceStore` 防抖保存（500ms）

**代码示例**（在 `conversationStore` 或 `usePersistenceStore`）：
```ts
// src/stores/conversation.ts
export const useConversationStore = defineStore('conversation', () => {
  const updateReasoningConfig = async (
    conversationId: string,
    config: ReasoningUserConfig
  ) => {
    // 更新内存状态
    const conversation = conversations.value.find(c => c.id === conversationId)
    if (!conversation) return
    
    conversation.reasoningConfig = config
    
    // 持久化到 SQLite
    await dbClient.query('conversations:updateReasoning', {
      conversationId,
      controlMode: config.controlMode,
      effort: config.effort,
      maxReasoningTokens: config.maxReasoningTokens,
      maxCompletionTokens: config.maxCompletionTokens,
      showReasoningContent: config.showReasoningContent ? 1 : 0,
      strategyConfig: config.strategyConfig ? JSON.stringify(config.strategyConfig) : null
    })
  }
  
  return { updateReasoningConfig }
})
```

**Repository 方法**（`infra/db/repo/convoRepo.ts`）：
```ts
export function updateConversationReasoning(
  db: Database,
  conversationId: string,
  config: {
    controlMode: string
    effort?: string
    maxReasoningTokens?: number
    maxCompletionTokens?: number
    showReasoningContent: number
    strategyConfig?: string | null
  }
): void {
  const stmt = db.prepare(`
    UPDATE conversations
    SET 
      reasoning_control_mode = ?,
      reasoning_effort = ?,
      reasoning_max_reasoning_tokens = ?,
      reasoning_max_completion_tokens = ?,
      reasoning_show_content = ?,
      reasoning_strategy_config = ?,
      updated_at = ?
    WHERE id = ?
  `)
  
  stmt.run(
    config.controlMode,
    config.effort ?? null,
    config.maxReasoningTokens ?? null,
    config.maxCompletionTokens ?? null,
    config.showReasoningContent,
    config.strategyConfig ?? null,
    Date.now(),
    conversationId
  )
}
```

### 2.2 恢复对话级配置

**触发点**：
- 用户切换标签页
- 应用启动时恢复上次对话

**代码示例**：
```ts
// src/stores/conversation.ts
const loadConversation = async (conversationId: string) => {
  const data = await dbClient.query('conversations:getById', { conversationId })
  
  const conversation: Conversation = {
    id: data.id,
    title: data.title,
    model: data.model,
    // ... 其他字段
    
    // 恢复推理配置
    reasoningConfig: {
      controlMode: data.reasoning_control_mode || 'effort',
      effort: data.reasoning_effort || 'medium',
      maxReasoningTokens: data.reasoning_max_reasoning_tokens,
      maxCompletionTokens: data.reasoning_max_completion_tokens,
      showReasoningContent: data.reasoning_show_content === 1,
      strategyConfig: data.reasoning_strategy_config
        ? JSON.parse(data.reasoning_strategy_config)
        : undefined
    }
  }
  
  conversations.value.push(conversation)
}
```

### 2.3 记录使用统计

**触发点**：
- AI 响应完成后
- 从响应体的 `usage` 字段提取数据
- （可选）调用 `/api/v1/generation?id=<gen_id>` 获取精确统计

**代码示例**（在 `useMessageSending` 或消息处理回调）：
```ts
// src/composables/chat/useMessageSending.ts
const handleAIResponse = async (response: AIResponse) => {
  const { conversationId, messageId, usage, model } = response
  
  // 提取 usage 数据
  const reasoningTokens = usage?.reasoning_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const totalTokens = usage?.total_tokens ?? 0
  
  // 计算成本（需要模型 pricing 信息）
  const modelData = modelStore.modelDataMap.get(model)
  const internalReasoningPrice = modelData?.pricing?.internal_reasoning ?? 0
  const completionPrice = modelData?.pricing?.completion ?? 0
  
  const reasoningCost = (reasoningTokens / 1000) * internalReasoningPrice
  const completionCost = (completionTokens / 1000) * completionPrice
  const totalCost = reasoningCost + completionCost
  
  // 获取当前配置
  const conversation = conversationStore.getConversation(conversationId)
  const reasoningConfig = conversation?.reasoningConfig
  
  // 记录统计
  await dbClient.query('reasoning:recordUsage', {
    conversationId,
    messageId,
    modelId: model,
    controlMode: reasoningConfig?.controlMode ?? 'unknown',
    effort: reasoningConfig?.effort,
    maxReasoningTokens: reasoningConfig?.maxReasoningTokens,
    reasoningTokensUsed: reasoningTokens,
    completionTokensUsed: completionTokens,
    totalTokensUsed: totalTokens,
    reasoningCost,
    completionCost,
    totalCost,
    latencyMs: response.latency, // 若可测量
    createdAt: Date.now()
  })
  
  // 更新消息表
  await dbClient.query('messages:updateReasoningStats', {
    messageId,
    reasoningTokensUsed: reasoningTokens,
    reasoningCost,
    reasoningEffortActual: reasoningConfig?.effort,
    reasoningLatencyMs: response.latency
  })
}
```

**Repository 方法**：
```ts
// infra/db/repo/reasoningStatsRepo.ts
export function recordReasoningUsage(
  db: Database,
  stats: {
    conversationId: string
    messageId: string
    modelId: string
    controlMode: string
    effort?: string
    maxReasoningTokens?: number
    reasoningTokensUsed: number
    completionTokensUsed: number
    totalTokensUsed: number
    reasoningCost: number
    completionCost: number
    totalCost: number
    latencyMs?: number
    createdAt: number
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO reasoning_usage_stats (
      conversation_id, message_id, model_id,
      control_mode, effort, max_reasoning_tokens,
      reasoning_tokens_used, completion_tokens_used, total_tokens_used,
      reasoning_cost, completion_cost, total_cost,
      latency_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  
  stmt.run(
    stats.conversationId,
    stats.messageId,
    stats.modelId,
    stats.controlMode,
    stats.effort ?? null,
    stats.maxReasoningTokens ?? null,
    stats.reasoningTokensUsed,
    stats.completionTokensUsed,
    stats.totalTokensUsed,
    stats.reasoningCost,
    stats.completionCost,
    stats.totalCost,
    stats.latencyMs ?? null,
    stats.createdAt
  )
}
```

## 三、分析查询设计

### 3.1 推理档位分布分析

**用途**：
- 了解用户最常使用的 effort 档位
- 识别高成本档位的使用频率

**SQL 查询**：
```sql
-- 统计各 effort 档位的使用次数与成本
SELECT 
  effort,
  COUNT(*) AS usage_count,
  SUM(reasoning_tokens_used) AS total_reasoning_tokens,
  SUM(reasoning_cost) AS total_reasoning_cost,
  AVG(reasoning_cost) AS avg_reasoning_cost,
  AVG(latency_ms) AS avg_latency_ms
FROM reasoning_usage_stats
WHERE created_at >= ? -- 时间范围筛选
GROUP BY effort
ORDER BY usage_count DESC;
```

**TypeScript 接口**：
```ts
interface EffortDistributionStats {
  effort: string
  usageCount: number
  totalReasoningTokens: number
  totalReasoningCost: number
  avgReasoningCost: number
  avgLatencyMs: number
}

export async function getEffortDistribution(
  db: Database,
  startTime: number,
  endTime: number
): Promise<EffortDistributionStats[]> {
  const stmt = db.prepare(/* SQL 查询 */)
  return stmt.all(startTime, endTime)
}
```

### 3.2 模型推理成本排行

**用途**：
- 找出最贵的推理模型
- 优化模型选择策略

**SQL 查询**：
```sql
SELECT 
  model_id,
  COUNT(*) AS usage_count,
  SUM(reasoning_cost) AS total_reasoning_cost,
  AVG(reasoning_cost) AS avg_reasoning_cost_per_call,
  AVG(reasoning_tokens_used) AS avg_reasoning_tokens
FROM reasoning_usage_stats
WHERE created_at >= ?
GROUP BY model_id
ORDER BY total_reasoning_cost DESC
LIMIT 10;
```

### 3.3 对话推理成本明细

**用途**：
- 查看单个对话的推理消耗
- 生成账单详情

**SQL 查询**：
```sql
SELECT 
  m.created_at AS message_time,
  m.role AS message_role,
  r.effort,
  r.reasoning_tokens_used,
  r.completion_tokens_used,
  r.reasoning_cost,
  r.completion_cost,
  r.total_cost,
  r.latency_ms
FROM reasoning_usage_stats r
JOIN messages m ON r.message_id = m.id
WHERE r.conversation_id = ?
ORDER BY m.created_at ASC;
```

**TypeScript 接口**：
```ts
interface ConversationReasoningDetail {
  messageTime: number
  messageRole: 'user' | 'assistant'
  effort?: string
  reasoningTokensUsed: number
  completionTokensUsed: number
  reasoningCost: number
  completionCost: number
  totalCost: number
  latencyMs?: number
}

export async function getConversationReasoningDetails(
  db: Database,
  conversationId: string
): Promise<ConversationReasoningDetail[]> {
  const stmt = db.prepare(/* SQL 查询 */)
  return stmt.all(conversationId)
}
```

### 3.4 时间序列分析

**用途**：
- 查看推理使用趋势（按天/周/月）
- 发现使用高峰

**SQL 查询**：
```sql
-- 按天统计
SELECT 
  DATE(created_at / 1000, 'unixepoch') AS date,
  COUNT(*) AS usage_count,
  SUM(reasoning_cost) AS total_cost,
  AVG(reasoning_tokens_used) AS avg_tokens
FROM reasoning_usage_stats
WHERE created_at >= ?
GROUP BY DATE(created_at / 1000, 'unixepoch')
ORDER BY date ASC;
```

## 四、UI 分析界面建议

### 4.1 全局推理统计面板

**位置**：设置 → 使用统计 → 推理分析

**展示内容**：
1. **总览卡片**：
   - 总推理调用次数
   - 总推理 tokens
   - 总推理成本
   - 平均延迟

2. **档位分布饼图**：
   - 各 effort 档位占比
   - 点击可查看详情

3. **成本趋势折线图**：
   - 按日期显示推理成本变化
   - 可切换时间范围（本周/本月/全部）

4. **模型排行榜**：
   - Top 5 最贵的模型
   - 显示平均成本与调用次数

### 4.2 对话级推理详情

**位置**：对话右键菜单 → 查看推理统计

**展示内容**：
- 表格形式展示每条消息的推理使用情况
- 列：时间、角色、档位、tokens、成本、延迟
- 底部汇总：总成本、平均延迟

### 4.3 推理优化建议

**基于统计数据生成建议**：
```ts
interface ReasoningOptimizationSuggestion {
  type: 'high-cost-model' | 'frequent-high-effort' | 'unnecessary-reasoning'
  message: string
  impact: 'high' | 'medium' | 'low'
  recommendation: string
}

export function generateOptimizationSuggestions(
  stats: EffortDistributionStats[],
  modelCosts: ModelCostStats[]
): ReasoningOptimizationSuggestion[] {
  const suggestions: ReasoningOptimizationSuggestion[] = []
  
  // 建议 1：高成本档位使用频繁
  const highEffortUsage = stats.find(s => s.effort === 'high')
  if (highEffortUsage && highEffortUsage.usageCount > 50) {
    suggestions.push({
      type: 'frequent-high-effort',
      message: `您已使用 high 档位 ${highEffortUsage.usageCount} 次，总成本 $${highEffortUsage.totalReasoningCost.toFixed(2)}`,
      impact: 'high',
      recommendation: '考虑在非复杂任务中降低到 medium 或 low 档位，可节省约 40% 成本'
    })
  }
  
  // 建议 2：高成本模型使用频繁
  const expensiveModel = modelCosts[0]
  if (expensiveModel && expensiveModel.totalReasoningCost > 5) {
    suggestions.push({
      type: 'high-cost-model',
      message: `模型 ${expensiveModel.modelId} 的推理成本已达 $${expensiveModel.totalReasoningCost.toFixed(2)}`,
      impact: 'medium',
      recommendation: '考虑切换到成本更低的同系列模型（如从 Claude 3.7 Opus 切换到 Claude 3.7 Sonnet）'
    })
  }
  
  // 建议 3：低档位成本也较高
  const lowEffortCost = stats.find(s => s.effort === 'low')
  if (lowEffortCost && lowEffortCost.avgReasoningCost > 0.01) {
    suggestions.push({
      type: 'unnecessary-reasoning',
      message: `即使使用 low 档位，平均成本仍达 $${lowEffortCost.avgReasoningCost.toFixed(4)}/次`,
      impact: 'low',
      recommendation: '对简单任务（如总结、翻译等），可考虑关闭推理功能'
    })
  }
  
  return suggestions
}
```

## 五、迁移脚本与回滚

### 5.1 完整迁移脚本

```sql
-- migration_v1_to_v2_reasoning.sql
PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- ========== 1. 扩展 conversations 表 ==========
ALTER TABLE conversations ADD COLUMN reasoning_control_mode TEXT DEFAULT 'effort';
ALTER TABLE conversations ADD COLUMN reasoning_effort TEXT DEFAULT 'medium';
ALTER TABLE conversations ADD COLUMN reasoning_max_reasoning_tokens INTEGER DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN reasoning_max_completion_tokens INTEGER DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN reasoning_show_content INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN reasoning_strategy_config TEXT DEFAULT NULL;

-- 从旧配置迁移（若存在）
UPDATE conversations
SET 
  reasoning_control_mode = CASE 
    WHEN json_extract(metadata, '$.reasoningEnabled') = 1 THEN 'effort'
    ELSE 'disabled'
  END,
  reasoning_effort = COALESCE(json_extract(metadata, '$.reasoningEffort'), 'medium'),
  reasoning_show_content = CASE 
    WHEN json_extract(metadata, '$.reasoningVisibility') = 'visible' THEN 1
    ELSE 0
  END
WHERE metadata IS NOT NULL;

-- ========== 2. 扩展 messages 表 ==========
ALTER TABLE messages ADD COLUMN reasoning_tokens_used INTEGER DEFAULT NULL;
ALTER TABLE messages ADD COLUMN reasoning_cost REAL DEFAULT NULL;
ALTER TABLE messages ADD COLUMN reasoning_effort_actual TEXT DEFAULT NULL;
ALTER TABLE messages ADD COLUMN reasoning_latency_ms INTEGER DEFAULT NULL;

-- ========== 3. 创建统计表 ==========
CREATE TABLE IF NOT EXISTS reasoning_usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  control_mode TEXT NOT NULL,
  effort TEXT,
  max_reasoning_tokens INTEGER,
  reasoning_tokens_used INTEGER NOT NULL DEFAULT 0,
  completion_tokens_used INTEGER NOT NULL DEFAULT 0,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  reasoning_cost REAL DEFAULT 0,
  completion_cost REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  latency_ms INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_reasoning_stats_conversation ON reasoning_usage_stats(conversation_id);
CREATE INDEX idx_reasoning_stats_model ON reasoning_usage_stats(model_id);
CREATE INDEX idx_reasoning_stats_effort ON reasoning_usage_stats(effort);
CREATE INDEX idx_reasoning_stats_created_at ON reasoning_usage_stats(created_at);

-- ========== 4. 更新 schema 版本 ==========
PRAGMA user_version = 2; -- 假设当前为 v1，升级到 v2

COMMIT;

PRAGMA foreign_keys=ON;
```

### 5.2 回滚脚本（降级）

```sql
-- rollback_v2_to_v1_reasoning.sql
PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

-- 警告：回滚会丢失新增的推理统计数据！

-- 1. 删除统计表
DROP TABLE IF EXISTS reasoning_usage_stats;

-- 2. 删除 conversations 新增列（SQLite 不支持 DROP COLUMN，需重建表）
-- 方案 1：保留列但不使用（推荐）
-- 方案 2：重建表（风险高，需备份）

-- 这里采用方案 1，只需将数据标记为"已回滚"
UPDATE conversations SET reasoning_control_mode = NULL WHERE 1=1;

-- 3. 删除 messages 新增列（同上）
-- 采用方案 1
UPDATE messages 
SET 
  reasoning_tokens_used = NULL,
  reasoning_cost = NULL,
  reasoning_effort_actual = NULL,
  reasoning_latency_ms = NULL
WHERE 1=1;

-- 4. 恢复 schema 版本
PRAGMA user_version = 1;

COMMIT;

PRAGMA foreign_keys=ON;
```

**注意事项**：
- SQLite 不支持 `ALTER TABLE ... DROP COLUMN`（需 SQLite 3.35.0+）
- 回滚时建议保留列结构，仅清空数据，避免重建表的复杂性
- 生产环境回滚前务必备份数据库

## 六、实施清单

### 6.1 开发任务

- [ ] **Schema 迁移**：
  - [ ] 编写 `migration_v1_to_v2_reasoning.sql`
  - [ ] 在 Worker 线程实现迁移逻辑
  - [ ] 增加版本检查与自动升级

- [ ] **Repository 方法**：
  - [ ] `updateConversationReasoning`
  - [ ] `recordReasoningUsage`
  - [ ] `getEffortDistribution`
  - [ ] `getConversationReasoningDetails`

- [ ] **Store 集成**：
  - [ ] 在 `conversationStore` 增加 `updateReasoningConfig`
  - [ ] 在 `useMessageSending` 增加统计记录逻辑

- [ ] **UI 分析面板**：
  - [ ] 创建 `ReasoningAnalytics.vue` 组件
  - [ ] 集成到设置页面
  - [ ] 实现图表（使用 Chart.js 或 ECharts）

### 6.2 测试任务

- [ ] **迁移测试**：
  - [ ] 测试从 v1 升级到 v2
  - [ ] 测试旧数据兼容性
  - [ ] 测试回滚脚本

- [ ] **统计测试**：
  - [ ] 模拟消息发送并验证统计记录
  - [ ] 验证成本计算准确性
  - [ ] 测试查询性能（大数据量）

- [ ] **UI 测试**：
  - [ ] 验证分析面板数据展示
  - [ ] 测试时间范围筛选
  - [ ] 验证优化建议生成

### 6.3 文档任务

- [ ] 更新 `ARCHITECTURE_REVIEW.md`
- [ ] 编写 `REASONING_ANALYTICS_GUIDE.md`
- [ ] 在设置界面增加"推理统计说明"
- [ ] 更新 `README.md` 中的功能列表

## 七、总结

### 7.1 关键收益

| 维度          | 收益                                        |
|---------------|---------------------------------------------|
| **数据完整性** | 推理配置与统计永久保存，不依赖内存          |
| **成本可见性** | 用户可查看详细的推理成本与档位分布           |
| **优化建议**   | 基于历史数据生成智能优化建议                 |
| **账单审计**   | 提供精确的对话级与模型级成本明细             |

### 7.2 后续扩展方向

1. **推理预算预警**：
   - 当单次推理成本超过阈值时弹窗提示
   - 设置月度推理成本上限

2. **A/B 测试**：
   - 对比不同 effort 档位的效果
   - 记录用户对不同档位响应的评分

3. **推理质量评估**：
   - 记录"重新生成"次数（可能与推理档位相关）
   - 分析高档位是否真正带来更好的输出

4. **导出功能**：
   - 导出 CSV 格式的推理使用报告
   - 用于企业审计或成本分析

---

**附录：SQL 查询性能优化建议**

```sql
-- 优化：为高频查询增加覆盖索引
CREATE INDEX idx_reasoning_stats_analysis ON reasoning_usage_stats(
  effort, created_at, reasoning_cost, reasoning_tokens_used
);

-- 优化：定期归档旧数据（保留最近 3 个月）
DELETE FROM reasoning_usage_stats
WHERE created_at < (strftime('%s', 'now') - 7776000) * 1000;
-- 7776000 秒 = 90 天

-- 优化：使用物化视图（需 SQLite 3.35+）
-- 暂不支持，可通过定时任务预计算统计数据
```
