# 配置文件治理方案实施文档

**实施日期**: 2025-12-05  
**问题**: 配置文件异常膨胀至 62.6 MB，导致应用启动卡死  
**根因**: `conversations-meta` 字段误将大量会话数据存入配置文件

---

## 一、问题诊断总结

### 1.1 症状
- 配置文件 `config.json` 大小: **62,629,933 字节 (≈ 62.6 MB)**
- 应用启动时 `ConvertFrom-Json` 解析超时/卡死
- OpenRouter 404 错误（`openrouter/bodybuilder`）为表象，非根因

### 1.2 根本原因
- **罪魁祸首**: `conversations-meta` 字段包含完整会话列表数据
- **设计失误**: 大数据误存入 electron-store（应使用 SQLite）
- **历史遗留**: 旧版本可能包含 `modelCapabilities`、`modelsCache` 等大字段

### 1.3 影响范围
- complete: 配置文件已清理并重置（62.6 MB → 0.01 KB）
- complete: 备份已保存: `config.json.bak_20251205_140021`
- complete: 代码中已无 `conversations-meta` 引用

---

## 二、实施的治理方案

### 2.1 短期急救 - complete
1. **备份原配置**: `config.json.bak_20251205_140021` (62.59 MB)
2. **重置配置文件**: 删除并重建为空对象 `{}`
3. **验证效果**: 配置文件恢复到 10 字节，应用可正常启动

### 2.2 中期治理架构 - complete

#### 新增模块：`electron/config/configSchema.ts`
集中管理配置 schema、白名单和验证逻辑。

**核心功能**:
- complete: 配置版本化管理 (当前 v2)
- complete: 字段白名单定义 (33 个允许字段)
- complete: 配置迁移逻辑 (`migrateConfig`)
- complete: 体积检测工具 (`checkFieldSize`, `checkTotalSize`)
- complete: 自动清理遗留大字段

#### 重构模块：`electron/main.ts`
使用 `configSchema` 模块实现智能配置管理。

**关键改进**:
1. **启动时自动处理**:
   ```typescript
   migrateAndCleanupConfig(store)   // 版本迁移 + 清理
   performConfigSizeCheck(store)     // 体积检查
   ```

2. **写入前验证**:
   ```typescript
   ipcMain.handle('store-set', (_event, key, value) => {
     checkFieldSize(key, value)      // 单字段检查
     ALLOWED_CONFIG_KEYS.has(key)    // 白名单验证
     performConfigSizeCheck(store)   // 总体积检查（仅开发环境）
   })
   ```

3. **环境感知日志**:
   - **开发环境**: 详细输出字段大小、白名单警告
   - **生产环境**: 仅输出严重错误（> 200 KB 或 > 100 KB 字段）

---

## 三、配置字段白名单

### 3.1 允许的字段类别

| 类别 | 字段示例 | 说明 |
|------|---------|------|
| **元数据** | `configVersion` | 配置版本号 |
| **API Keys** | `geminiApiKey`, `openRouterApiKey` | 敏感凭证 |
| **Provider & Model** | `activeProvider`, `defaultModel` | 提供商和模型选择 |
| **用户偏好** | `theme`, `language`, `fontSize`, `webSearchEngine` | UI/行为设置 |
| **窗口状态** | `windowBounds`, `windowMaximized`, `sidebarWidth` | 窗口布局 |
| **项目管理** | `projects`, `activeProjectId`, `recentProjectIds` | 项目元数据（仅 ID） |
| **模型配置** | `favoriteModels`, `modelConfigs`, `conversationModelConfigs` | 参数配置（仅元数据） |

### 3.2 禁止的字段类型 - blocked
- **模型列表**: 使用 API 动态获取或 SQLite 缓存
- **会话内容**: 必须存储在 SQLite (`convo`, `message` 表)
- **API 响应缓存**: 使用独立缓存文件 (`cache/*.json`)
- **任何 > 100 KB 的数据**: 单字段阈值限制

### 3.3 已知遗留大字段（自动清理）
```typescript
const LEGACY_LARGE_FIELDS = [
  'conversations-meta',        // 会话列表（应在 SQLite）
  'modelCapabilities',         // 模型能力表（应在缓存文件）
  'modelsCache',              // /models API 响应（应在缓存文件）
  'modelsList',               // 完整模型列表（应动态获取）
  'analyticsCache',           // 统计数据（应在独立文件）
  'conversationsList',        // 会话列表（应从 SQLite 读取）
]
```

---

## 四、配置版本化与迁移

### 4.1 版本历史

**v1 (2024-12 之前)**:
- 无版本号标识
- 可能包含大字段（`conversations-meta` 等）
- 单 provider 模式（`apiKey` 字段）

**v2 (2024-12 起)**:
- 添加 `configVersion: 2` 标识
- 移除所有遗留大字段
- 多 provider 支持（`geminiApiKey` / `openRouterApiKey`）
- 白名单验证机制

### 4.2 自动迁移逻辑

```typescript
function migrateConfig(rawConfig: Record<string, any>) {
  const version = rawConfig.configVersion || 1
  
  if (version < 2) {
    // 1. 迁移 API Key
    if (config.apiKey && !config.geminiApiKey) {
      config.geminiApiKey = config.apiKey
    }
    
    // 2. 移除遗留大字段
    for (const legacyField of LEGACY_LARGE_FIELDS) {
      delete config[legacyField]
    }
    
    // 3. 更新版本号
    config.configVersion = 2
  }
  
  return config
}
```

### 4.3 未来版本添加指南

**添加新字段** (无需升级版本):
1. 在 `configSchema.ts` 的 `ALLOWED_CONFIG_KEYS` 中添加字段名
2. 在应用代码中正常读写

**重命名/删除字段** (需要升级版本):
1. 增加 `CURRENT_CONFIG_VERSION` 版本号
2. 在 `migrateConfig` 中添加迁移逻辑:
   ```typescript
   if (version < 3) {
     config.newFieldName = config.oldFieldName
     delete config.oldFieldName
     config.configVersion = 3
   }
   ```

---

## 五、体积限制与告警

### 5.1 阈值定义

```typescript
export const CONFIG_SIZE_LIMITS = {
  FIELD_WARN_SIZE: 100_000,     // 单字段警告：100 KB
  TOTAL_WARN_SIZE: 200_000,     // 总体积警告：200 KB
  TOTAL_ERROR_SIZE: 1_000_000,  // 总体积严重：1 MB
}
```

### 5.2 检测时机

| 环境 | 启动时 | 每次写入 | 定期检查 |
|------|-------|---------|---------|
| **开发** | 详细 | 完整 | 可选 |
| **生产** | 简化 | warning: 仅大字段 | blocked: 禁用 |

**设计原因**:
- 避免频繁 `JSON.stringify(config)` 造成 CPU 开销
- 开发环境需要详细反馈，便于调试
- 生产环境优先性能，仅报告严重问题

### 5.3 日志示例

**开发环境** (详细):
```
[Config] 开始配置迁移: v1 → v2
[Config] v1→v2: 迁移 apiKey → geminiApiKey
[Config] v1→v2: 移除遗留大字段 conversations-meta (60.5 MB)
[Config] complete: 配置已迁移到 v2
[Config] 清理 1 个非法字段，减少 60.50 MB
  - conversations-meta: 60500.00 KB
[Config] ok: 配置文件大小正常: 0.50 KB
```

**生产环境** (简化):
```
[Config] complete: 配置已迁移到 v2
[Config] warning: 配置文件体积偏大: 250.00 KB
```

---

## 六、验证与测试

### 6.1 快速健康检查

```powershell
# 检查配置文件大小
$path = "$env:APPDATA\starverse\config.json"
Get-Item $path | Select-Object FullName, Length

# 查看配置字段（前 20 行）
Get-Content $path -Head 20
```

### 6.2 启动日志检查

重启应用后，观察控制台输出：
- complete: 应看到: `[Config] ok: 配置文件大小正常: XX KB`
- warning: 如看到警告: 检查是否有大字段误写入
- blocked: 如看到错误: 立即检查 `config.json` 内容

### 6.3 健康检查脚本

```powershell
# 使用项目提供的健康检查脚本
.\scripts\check-config-health.ps1

# 输出示例：
# Status: healthy (< 50 KB)
# 配置字段统计: 总字段数 12
# 最大的 10 个字段: ...
```

---

## 七、故障排查指南

### 7.1 配置文件再次膨胀

**症状**: 配置文件超过 200 KB

**排查步骤**:
1. 运行健康检查脚本，查看最大字段
2. 检查是否有新代码违反白名单规则
3. 查看开发环境日志，确认警告信息
4. 如是合法需求，更新 `configSchema.ts` 白名单

### 7.2 启动时迁移失败

**症状**: 看到 `[Config] 迁移和清理失败` 错误

**排查步骤**:
1. 备份当前 `config.json`
2. 检查文件是否损坏（JSON 格式错误）
3. 尝试手动删除并重建配置
4. 查看详细错误堆栈，定位具体失败点

### 7.3 写入被拦截

**症状**: 配置无法保存，看到 "非白名单字段" 警告

**解决方案**:
1. 确认字段是否应该存入配置
2. 如是合法字段：添加到 `ALLOWED_CONFIG_KEYS`
3. 如是大数据：改用 SQLite 或独立缓存文件
4. 重新编译主进程: `npm run build`

---

## 八、未来优化建议

### 8.1 已完成 - complete
- [x] 配置版本化和迁移机制
- [x] 字段白名单验证
- [x] 体积检测和告警
- [x] 环境感知日志分级
- [x] 自动清理遗留大字段

### 8.2 待实施 - deferred
- [ ] **配置加密**: 敏感字段（API Keys）加密存储
- [ ] **配置导入/导出**: 用户数据迁移功能
- [ ] **配置备份**: 定期自动备份（保留最近 5 个）
- [ ] **配置恢复**: UI 层提供"恢复默认配置"功能
- [ ] **性能监控**: 记录配置读写耗时，优化热点

### 8.3 架构改进方向
1. **分离存储策略**:
   - 敏感数据 (API Keys): electron-store（加密）
   - 用户偏好: electron-store
   - 缓存数据: 独立 `cache/` 目录（可删除重建）
   - 持久化数据: SQLite

2. **类型安全**:
   - 定义 `AppConfig` TypeScript 接口
   - 运行时使用 `zod` 验证配置格式
   - 编译时类型检查防止错误字段

3. **测试覆盖**:
   - 单元测试：配置迁移逻辑
   - 集成测试：启动时自动清理
   - E2E 测试：配置读写完整流程

---

## 九、相关文件清单

### 9.1 核心文件
- `electron/config/configSchema.ts` - 配置 schema 定义（新增）
- `electron/main.ts` - 主进程配置管理（重构）
- `docs/CONFIG_GOVERNANCE.md` - 本文档

### 9.2 工具脚本
- `scripts/check-config-health.ps1` - 配置健康检查脚本
- `clear-all-data.ps1` - 数据清理脚本（包含配置重置）

### 9.3 备份文件
- `config.json.bak_20251205_140021` - 62.6 MB 原始配置备份

---

## 十、总结

### 问题根源
配置文件治理问题源于**架构设计失误** + **缺乏边界防护**:
- 大数据（会话列表）误入配置文件
- 无版本管理和自动迁移机制
- 缺少写入验证和体积告警

### 解决方案
通过**版本化 + 白名单 + 自动化**三位一体：
- complete: 版本化管理：平滑迁移和向后兼容
- complete: 白名单机制：主动防御非法字段
- complete: 自动化清理：启动时自动修复历史问题

### 预期效果
- **短期**: 配置文件从 62.6 MB 降至 < 50 KB
- **中期**: 配置体积保持稳定，无异常膨胀
- **长期**: 架构健壮，易于扩展和维护

---

**文档维护**: 每次修改配置 schema 时，同步更新本文档的白名单和版本历史章节。
