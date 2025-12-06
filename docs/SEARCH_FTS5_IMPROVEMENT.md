# 搜索功能待改进 - FTS5 中文支持问题

## 问题描述

当前全文搜索功能在处理中文查询时存在匹配问题，用户输入中文关键词后无法找到匹配内容。

## 技术背景

### 当前实现
- **数据库**: SQLite FTS5 全文搜索引擎
- **分词器**: `unicode61` (定义在 `infra/db/schema.sql`)
- **查询构建**: `src/services/searchDsl.ts`
- **搜索执行**: `infra/db/repo/searchRepo.ts`

### 核心问题
1. **unicode61 分词器对中文的处理方式**:
   - 将每个汉字作为独立的 token
   - 不支持中文词语的智能分词
   - 例如："机器学习" 被拆分为 "机", "器", "学", "习" 四个独立 token

2. **当前查询策略的局限**:
   - 尝试过短语搜索 `"机器学习"` - 要求精确顺序匹配
   - 尝试过 AND 连接 `机 AND 器 AND 学 AND 习` - 只要求包含所有字符，但对顺序和连续性没有要求
   - 两种方法都无法很好地匹配中文自然语言

## 改进方案

### 方案 1: 升级分词器 (推荐)
使用支持中文的 FTS5 分词器：

#### 选项 A: jieba 分词器
```sql
-- 需要编译 SQLite 扩展
CREATE VIRTUAL TABLE message_fts USING fts5(
  message_id UNINDEXED,
  convo_id UNINDEXED,
  body,
  tokenize = 'jieba',  -- 中文智能分词
  content = ''
);
```

**优点**:
- 智能中文分词，能识别词语边界
- 搜索体验最接近用户预期
- 支持词语级别的匹配

**缺点**:
- 需要编译 SQLite 扩展 (better-sqlite3 + jieba)
- 增加构建复杂度
- 可能需要分词词典文件

#### 选项 B: simple 分词器
```sql
CREATE VIRTUAL TABLE message_fts USING fts5(
  message_id UNINDEXED,
  convo_id UNINDEXED,
  body,
  tokenize = 'simple',
  content = ''
);
```

**优点**:
- 无需额外依赖
- 按空格和标点分词

**缺点**:
- 中文搜索体验仍然不理想（中文无空格）

### 方案 2: 改进查询策略
保持 unicode61 分词器，优化查询构建逻辑：

```typescript
// 使用 NEAR 操作符确保字符相邻
// "机器学习" -> "机 NEAR 器 NEAR 学 NEAR 习"
const chars = query.split('')
const fts5Query = chars.join(' NEAR ')
```

**优点**:
- 无需更改数据库结构
- 实现简单

**缺点**:
- NEAR 只保证一定距离内，不保证精确连续
- 搜索精度仍然有限

### 方案 3: 混合搜索
结合 FTS5 和 LIKE 查询：

```sql
-- 先用 FTS5 粗筛
WHERE message_fts.body MATCH @query
-- 再用 LIKE 精确匹配
AND m.body LIKE '%' || @rawQuery || '%'
```

**优点**:
- 兼顾性能和精度
- 无需更改分词器

**缺点**:
- LIKE 查询在大数据集上性能较差
- 可能需要优化查询执行计划

## 相关文件

- `infra/db/schema.sql` - FTS5 表定义
- `src/services/searchDsl.ts` - 搜索查询构建
- `infra/db/repo/searchRepo.ts` - 搜索执行
- `src/components/ConversationList.vue` - 搜索 UI

## 测试场景

需要测试的中文搜索场景：
1. 单个词语：`机器学习`、`人工智能`
2. 短语：`深度学习算法`
3. 混合中英文：`ChatGPT 使用指南`
4. 特殊字符：`C++ 编程`、`Vue.js 开发`

## 实施建议

1. **短期方案** (快速修复):
   - 实施方案 2 或方案 3
   - 添加详细的搜索日志便于调试
   - 在 UI 中添加搜索帮助提示

2. **长期方案** (彻底解决):
   - 评估 jieba 分词器集成的可行性
   - 考虑使用第三方搜索引擎 (Elasticsearch, MeiliSearch)
   - 或者实现客户端搜索 (小数据集)

## 优先级

**中**: 搜索功能可用但体验不佳，不影响核心功能使用

## 更新记录

- 2025-11-25: 创建文档，记录 unicode61 分词器中文支持问题
