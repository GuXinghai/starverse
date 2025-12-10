# Starverse AI 对话使用量统计功能 - 详细实施计划

## 📋 项目概述

### 目标
为 Starverse 企业级 AI 对话桌面应用实现完整的 AI 使用量统计系统，包括 token 消耗、费用、响应时间、推理时间等关键指标的记录与查询功能。

**时间范围**: 2025年12月6日
**负责人**: 开发团队
**状态**: 计划阶段

### 现状分析
✅ **已实现功能**:
- Usage 数据捕获（OpenRouter）
- 数据标准化（多格式兼容）
- UI 显示（单条消息）
- 类型定义完整

❌ **缺失功能**:
- 专用 `usage_log` 统计表
- `UsageRepo` 数据访问层
- 聚合查询 API
- 统计可视化 UI

## 🏗️ 技术架构设计

### 数据库层设计

#### 新增 `usage_log` 表
```sql
-- 在 infra/db/schema.sql 中添加
CREATE TABLE IF NOT EXISTS usage_log (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
  convo_id TEXT REFERENCES convo(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,        -- 'Gemini' | 'OpenRouter'
  model TEXT NOT NULL,            -- 模型 ID
  tokens_input INTEGER NOT NULL,
  tokens_output INTEGER NOT NULL,
  tokens_cached INTEGER DEFAULT 0,
  tokens_reasoning INTEGER DEFAULT 0,
  cost REAL DEFAULT 0.0,
  duration_ms INTEGER NOT NULL,   -- 请求总耗时
  ttft_ms INTEGER,                -- Time To First Token
  timestamp INTEGER NOT NULL,     -- 请求时间
  status TEXT DEFAULT 'success',  -- 'success' | 'error'
  meta TEXT                       -- JSON: 详细信息
);

-- 索引设计
CREATE INDEX IF NOT EXISTS idx_usage_project ON usage_log(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_convo ON usage_log(convo_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_log(model, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_log(timestamp DESC);
```

#### 数据访问层设计

**新建文件**: `infra/db/repo/usageRepo.ts`
```typescript
export class UsageRepo {
  private insertStmt: BetterSqlite3.Statement
  private getProjectStatsStmt: BetterSqlite3.Statement
  
  constructor(private db: SqlDatabase) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO usage_log(...) VALUES (...)
    `)
  }
  
  logUsage(input: UsageLogPayload): void {
    this.insertStmt.run({
      id: randomUUID(),
      projectId: input.project_id ?? null,
      convoId: input.convo_id ?? null,
      provider: input.provider,
      model: input.model,
      tokensInput: input.tokens_input,
      tokensOutput: input.tokens_output,
      tokensCached: input.tokens_cached ?? 0,
      tokensReasoning: input.tokens_reasoning ?? 0,
      cost: input.cost ?? 0.0,
      durationMs: input.duration_ms,
      ttftMs: input.ttft_ms ?? null,
      timestamp: input.timestamp,
      status: input.status ?? 'success',
      meta: input.meta ? JSON.stringify(input.meta) : null
    })
  }
  
  getProjectStats(projectId: string, days: number = 30): ProjectUsageStats {
    // 实现聚合查询逻辑
  }
}
```

### 服务层设计

#### 修改现有 AI 服务

**1. GeminiService.js** (修复 usage 捕获）
```javascript
// 在流式响应结束后获取 usageMetadata
for await (const chunk of result.stream) {
  yield chunk.text()
}

// 流结束后获取 usage
const finalResponse = await result.response
if (finalResponse.usageMetadata) {
  yield {
    type: 'usage',
    usage: {
      promptTokens: finalResponse.usageMetadata.promptTokenCount,
      completionTokens: finalResponse.usageMetadata.candidatesTokenCount,
      totalTokens: finalResponse.usageMetadata.totalTokenCount
    }
  }
}
```

#### Worker 线程集成

**修改文件**: `infra/db/worker.ts`
```typescript
// 在 registerHandlers() 中添加
this.handlers.set('usage.log', (raw) => {
  const input = LogUsageSchema.parse(raw)
  this.usageRepo.logUsage(input)
  return { ok: true }
})

this.handlers.set('usage.getProjectStats', (raw) => {
  const input = GetProjectUsageStatsSchema.parse(raw)
  return this.usageRepo.getProjectStats(input.projectId, input.days)
})
```

## 📅 实施阶段划分

### 🔴 Phase 1: 核心统计功能 (1-2 天）

**目标**: 实现使用量日志记录和基础查询

**任务清单**:
1. 创建 `usage_log` 表 (schema.sql）
2. 实现 `UsageRepo` (usageRepo.ts）
3. 注册 Worker Handler (worker.ts）
4. 在 ChatView.vue 中调用 `logUsage()`
5. 修复 Gemini Service 的 usage 捕获

**验收标准**:
- ✅ 每次 AI 对话后，`usage_log` 表有新记录
- ✅ 记录包含 tokens、cost、duration
- ✅ Gemini 和 OpenRouter 都能记录

### 🟡 Phase 2: 统计查询 API (1 天）

**目标**: 提供聚合统计接口

**任务清单**:
1. 实现 `getProjectStats()` (按项目统计）
2. 实现 `getConvoStats()` (按对话统计）
3. 实现 `getModelStats()` (按模型统计）
4. 添加 IPC 方法 (dbClient.getProjectUsageStats）

**验收标准**:
- ✅ 控制台能调用 `getProjectStats()`
- ✅ 返回总 tokens、费用、请求数

### 🟢 Phase 3: UI 可视化 (2-3 天）

**目标**: 在 UI 中展示统计数据

**任务清单**:
1. 创建 `UsageStatistics.vue` 组件
2. 集成图表库 (推荐 ECharts）
3. 在 `ProjectHome.vue` 中显示项目统计
4. 在 `ConversationList.vue` 侧边栏显示对话统计

**验收标准**:
- ✅ 项目主页显示总使用量
- ✅ 图表展示每日趋势
- ✅ 支持按模型筛选

### 🔵 Phase 4: 高级功能 (可选）

**任务清单**:
1. 费用预算告警
2. 导出统计报表 (CSV/JSON）
3. 定时清理旧日志
4. 实时使用量监控

## 🛠️ 具体任务清单

### Phase 1 详细任务

#### 1.1 数据库 Schema 更新
- 在 `infra/db/schema.sql` 中添加 `usage_log` 表定义
- 添加必要的索引
- 更新类型定义

#### 1.2 UsageRepo 实现
- `logUsage()` - 记录单次使用
- 预编译 SQL 语句
- 事务支持

#### 1.3 Worker Handler 注册
- 在 `infra/db/worker.ts` 中添加 `usage.log` 处理器

#### 1.4 Gemini Service 修复
- 在流结束后访问 `result.response.usageMetadata`
- Yield `{ type: 'usage', usage: {...} }`

#### 1.5 ChatView 集成
- 在 `performSendMessage()` 中记录请求时间
- 计算 duration_ms 和 ttft_ms
- 调用 `dbClient.logUsage()`

### Phase 2 详细任务

#### 2.1 聚合查询方法
- `getProjectStats()` - 项目维度统计
- `getConvoStats()` - 对话维度统计
- `getModelStats()` - 模型维度统计

#### 2.2 IPC 方法暴露
- 在 `electron/ipc/dbBridge.ts` 中添加方法类型

### Phase 3 详细任务

#### 3.1 统计组件开发
- `UsageStatistics.vue` - 主要统计展示组件
- 集成 ECharts 图表

## ⚠️ 风险评估与应对措施

### 风险 1: Gemini SDK 缺少 usage 信息

**问题**: Google Generative AI SDK 的流式响应不返回 token 统计

**解决方案**:
- 方案 A: 使用 REST API 替代 SDK（可获取 usage）
- 方案 B: 在流结束后访问 `result.response.usageMetadata`
- 方案 C: 本地估算（基于文本长度，准确度低）

**推荐**: 方案 B（优先），方案 A（备选）

### 风险 2: JSON 存储的查询性能

**问题**: 现有 `message.meta` JSON 字段无法高效查询

**解决方案**:
- ✅ 创建专用 `usage_log` 表（推荐）
- ❌ 使用 SQLite JSON 扩展（需重新编译 better-sqlite3）

### 风险 3: 历史数据迁移

**问题**: 已有的对话 `message.meta` 中的 usage 数据

**解决方案**:
- 编写一次性迁移脚本
- 从 `message.meta` 提取 usage 插入到 `usage_log`
- 保留原始数据作为备份

## 📊 工作量评估

| 阶段 | 工作量 | 优先级 |
|------|--------|--------|
| Phase 1: 核心功能 | 1-2 天 | 🔴 高 |
| Phase 2: 查询 API | 1 天 | 🟡 中 |
| Phase 3: UI 可视化 | 2-3 天 | 🟢 低 |
| Phase 4: 高级功能 | 可选 | ⚪ 按需 |

**总计**: 4-6 天（核心功能）

## 🎯 成功指标

### 技术指标
- ✅ 数据库查询响应时间 < 100ms（聚合统计）
- ✅ 内存使用 < 50MB（统计数据）
- ✅ 支持 10,000+ 条使用记录
- ✅ 支持多维度统计查询

### 用户体验指标
- ✅ 统计页面加载时间 < 2s
- ✅ 图表渲染流畅（60fps）
- ✅ 支持实时数据更新

## 🚀 下一步行动

### 立即开始
1. 创建 `usage_log` 表（修改 schema.sql）
2. 实现 `UsageRepo` + 修复 Gemini
3. 迭代验证：先完成记录，再开发查询
4. UI 分离：统计界面可独立迭代

## 📚 参考资料

- **OpenRouter API**: https://openrouter.ai/docs
- **Google Gemini API**: https://ai.google.dev/api/rest
- **SQLite 索引优化**: https://www.sqlite.org/optoverview.html
- **Better SQLite3**: https://github.com/WiseLibs/better-sqlite3
- **ECharts 文档**: https://echarts.apache.org/

---

**文档生成时间**: 2025年11月29日
**调研范围**: 完整代码库（18,000+ 行 TypeScript/JavaScript）
**数据源**: 90+ 份架构文档 + 源代码分析