# 模型数据持久化重构说明

## 变更概述

将模型列表数据从 `electron-store`（用户配置）迁移到 SQLite 数据库。

## 变更原因

1. **职责分离**: 模型列表是从 AI 提供商获取的动态数据，不应与用户配置混在一起
2. **性能优化**: SQLite 提供更高效的查询和索引能力
3. **数据规模**: 模型列表可能包含数百个模型，JSON 文件不适合存储大量结构化数据
4. **一致性**: 与其他数据（对话、项目）使用相同的持久化机制

## 实现细节

### 新增文件

1. **`infra/db/repo/modelDataRepo.ts`**
   - Repository 模式的数据访问层
   - 支持批量保存、按提供商替换、查询等操作
   - 使用 SQLite 事务保证数据一致性

2. **`src/services/db/modelDataClient.ts`**
   - 渲染进程调用的客户端封装
   - 自动转换 `ModelData` 和 `ModelDataRecord` 类型

3. **数据库表结构** (`infra/db/schema.sql`)
   ```sql
   CREATE TABLE IF NOT EXISTS model_data (
     id TEXT PRIMARY KEY,
     provider TEXT NOT NULL,
     name TEXT NOT NULL,
     description TEXT,
     context_length INTEGER,
     pricing TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     meta TEXT
   );
   ```

### 修改文件

1. **`src/stores/model.ts`**
   - `saveAvailableModels()`: 从 `electronStore.set()` 改为 `modelDataClient.saveModels()`
   - `loadAvailableModels()`: 从 `electronStore.get()` 改为 `modelDataClient.getAllModels()`

2. **`src/main.ts`**
   - 添加一次性数据迁移逻辑
   - 首次启动时将 `electron-store` 中的模型迁移到数据库
   - 迁移完成后自动清理旧数据

3. **`infra/db/worker.ts`**
   - 注册 `ModelDataRepo` 实例
   - 添加 6 个新的 IPC 方法：
     - `model.saveMany`
     - `model.replaceByProvider`
     - `model.getAll`
     - `model.getByProvider`
     - `model.getById`
     - `model.clear`

4. **`infra/db/types.ts`**
   - 新增 `ModelDataRecord` 和 `SaveModelDataInput` 类型
   - 在 `DbMethod` 联合类型中添加模型相关方法

## 数据迁移策略

### 自动迁移（首次启动）

`src/main.ts` 中的 `bootstrapChatData()` 函数会：

1. 尝试从数据库加载模型列表
2. 如果数据库为空，检查 `electron-store` 中是否有旧数据
3. 如果有旧数据，迁移到数据库并删除 `electron-store` 中的 `availableModels` 键
4. 迁移过程对用户透明，无需手动操作

### 手动清理（可选）

如果需要手动清理旧数据：

```javascript
// 在浏览器控制台或渲染进程中执行
await window.electron.electronStore.delete('availableModels')
```

## 向后兼容性

- ✅ **用户配置保留**: `defaultModel` 和 `favoriteModels` 仍存储在 `electron-store`
- ✅ **自动迁移**: 旧数据会自动迁移到新格式
- ✅ **API 不变**: `modelStore` 的公开接口保持不变

## 测试检查清单

- [ ] 首次启动时模型列表正确加载
- [ ] 切换提供商时模型列表更新并持久化
- [ ] 收藏模型功能正常
- [ ] 默认模型选择正常
- [ ] 旧数据自动迁移成功
- [ ] 数据库查询性能符合预期

## 回滚方案

如果需要回滚到 `electron-store` 方案：

1. 恢复 `src/stores/model.ts` 中的旧实现
2. 移除 `infra/db/repo/modelDataRepo.ts`
3. 移除 `src/services/db/modelDataClient.ts`
4. 从 `infra/db/worker.ts` 中移除模型相关 handler
5. 删除数据库中的 `model_data` 表

## 性能影响

- **正面影响**:
  - 减少 JSON 序列化/反序列化开销
  - 支持索引和高效查询
  - 减少内存占用（按需加载）

- **负面影响**:
  - 增加 IPC 通信次数（可通过批量操作优化）
  - 首次查询需要数据库初始化（约 10-50ms）

## 注意事项

1. **Worker 线程**: 所有数据库操作在独立线程执行，不阻塞 UI
2. **事务安全**: 批量操作使用事务保证原子性
3. **类型转换**: `ModelData` 和 `ModelDataRecord` 之间的转换由客户端层处理
4. **元数据存储**: `_raw` 等扩展字段存储在 `meta` 列的 JSON 中

## 相关文档

- 架构文档: `docs/ARCHITECTURE_REVIEW.md`
- Worker 线程: `docs/MULTITHREADING_MANAGEMENT.md`
- Repository 模式: `infra/db/repo/README.md`（如存在）
