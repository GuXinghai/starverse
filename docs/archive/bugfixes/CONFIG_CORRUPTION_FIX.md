# 配置文件损坏修复方案

## 问题背景

**问题现象**：应用启动时抛出 `SyntaxError: Unexpected end of JSON input`，主进程崩溃。

**根本原因**：`electron-store` 期望配置文件始终是合法 JSON，但如果文件内容被手动修改为空字符串、半截内容或其他非法格式，`JSON.parse()` 会直接抛出错误。

**触发场景**：
- 手动清空配置文件内容（`Set-Content "$env:APPDATA\starverse\config.json" ""`）
- 外部脚本错误地修改配置文件
- 应用在写入配置时被强制终止，导致文件损坏

---

## 完整解决方案

### 1. 自动容错机制（已实现）

#### 1.1 Store 初始化容错

在 `electron/main.ts` 中，`electron-store` 现已配置三层防护：

```typescript
const store = new Store({
  name: 'config',
  
  // 第一层：JSON 解析失败时自动重置为默认值
  clearInvalidConfig: true,
  
  // 第二层：提供默认配置
  defaults: DEFAULT_CONFIG,
  
  // 第三层：自定义反序列化，捕获错误并返回默认值
  deserialize: (text: string) => {
    try {
      if (!text || text.trim() === '') {
        return DEFAULT_CONFIG
      }
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null) {
        backupCorruptedConfig(text, 'invalid-format')
        return DEFAULT_CONFIG
      }
      return parsed
    } catch (error) {
      backupCorruptedConfig(text, 'parse-error')
      return DEFAULT_CONFIG
    }
  },
})
```

**安全保证**：
- 永远不会因为配置文件损坏而导致应用崩溃
- 损坏的配置自动备份到 `config.json.corrupted.*.bak`
- 自动重置为默认配置，用户可以继续使用

#### 1.2 启动时完整性检查

在应用启动时自动执行：

```typescript
function migrateAndCleanupConfig(store: Store): void {
  // Step 0: 配置完整性检查
  const integrity = checkConfigIntegrity(store)
  if (!integrity.ok) {
    console.warn(`[Config] ⚠️ 配置文件异常: ${integrity.reason}`)
  }
  
  // Step 1: 版本迁移
  // Step 2: 验证和清理
  // Step 3: 确保版本号存在
}
```

---

### 2. 安全的配置清空函数

#### 2.1 服务端 API（`configSchema.ts`）

```typescript
/**
 * 安全地清空配置
 * 
 * ⚠️ 重要：永远不要直接操作配置文件，而应使用此函数
 * 
 * @param store - electron-store 实例
 * @param keepKeys - 需要保留的字段（例如 API Keys）
 * @returns 备份文件路径
 */
export function safeClearConfig(
  store: any,
  keepKeys: string[] = []
): string | null
```

**使用示例**：

```typescript
// 清空所有配置
safeClearConfig(store)

// 清空配置但保留 API Keys
safeClearConfig(store, ['geminiApiKey', 'openRouterApiKey'])
```

#### 2.2 渲染进程 API

通过 IPC 调用：

```typescript
// 清空所有配置
await window.electronStore.clearSafe()

// 清空配置但保留 API Keys
await window.electronStore.clearSafe([
  'geminiApiKey',
  'openRouterApiKey'
])
```

**返回值**：备份文件的绝对路径，失败则返回 `null`。

---

### 3. 配置文件完整性检查 API

#### 3.1 手动触发检查

```typescript
// 渲染进程
const result = await window.electronStore.checkIntegrity()

if (!result.ok) {
  console.warn('配置文件异常:', result.reason)
  // 提示用户是否重置配置
}
```

#### 3.2 检查项

- 配置文件是否为空对象（损坏后的重置状态）
- 是否缺少 `configVersion` 字段
- 是否包含非白名单字段

---

## 一次性修复操作（当前崩溃）

如果应用当前无法启动，按以下步骤手动修复：

### 方案 A：删除配置文件（推荐）

```powershell
# 1. 关闭 Starverse
# 2. 删除配置文件
Remove-Item "$env:APPDATA\starverse\config.json"

# 3. 重新启动 Starverse
# electron-store 会自动创建新文件并写入默认值
```

### 方案 B：重置为空对象

```powershell
# 1. 关闭 Starverse
# 2. 重置为空对象
Set-Content "$env:APPDATA\starverse\config.json" "{}"

# 3. 重新启动 Starverse
```

### 方案 C：检查并修复所有配置文件

```powershell
# 检查所有 JSON 文件
Get-ChildItem "$env:APPDATA\starverse\" -Filter "*.json" | ForEach-Object {
    Write-Host "检查: $($_.Name)"
    try {
        $content = Get-Content $_.FullName -Raw
        if ([string]::IsNullOrWhiteSpace($content)) {
            Write-Host "  -> 文件为空，删除" -ForegroundColor Yellow
            Remove-Item $_.FullName
        } else {
            $json = $content | ConvertFrom-Json
            Write-Host "  -> 正常" -ForegroundColor Green
        }
    } catch {
        Write-Host "  -> JSON 格式错误，删除" -ForegroundColor Red
        Remove-Item $_.FullName
    }
}
```

---

## 预防措施

### 1. 永远不要手动编辑配置文件

**错误做法**：
```powershell
# ❌ 直接清空
Set-Content "$env:APPDATA\starverse\config.json" ""

# ❌ 手动编辑
notepad "$env:APPDATA\starverse\config.json"
```

**正确做法**：
```typescript
// ✅ 使用 API 清空
await window.electronStore.clearSafe()

// ✅ 使用 API 修改
await window.electronStore.set('someKey', newValue)
await window.electronStore.delete('someKey')
```

### 2. 开发环境调试技巧

如果需要查看配置内容：

```powershell
# 查看配置
Get-Content "$env:APPDATA\starverse\config.json" | ConvertFrom-Json | ConvertTo-Json -Depth 10

# 检查配置文件大小
Get-Item "$env:APPDATA\starverse\config.json" | Select-Object FullName, Length
```

如果需要清空配置（开发环境）：

```typescript
// 在渲染进程的控制台执行
window.electronStore.clearSafe(['geminiApiKey', 'openRouterApiKey'])
  .then(backup => console.log('备份文件:', backup))
```

---

## 配置体积保护

### 正常体积范围

- **正常**：< 200 KB
- **警告**：200 KB ~ 1 MB
- **严重超标**：> 1 MB

### 大数据存储规则

**禁止存储在 `config.json`**：
- 模型列表（应使用独立缓存文件）
- 会话内容（应存储在 SQLite）
- API 响应缓存（应使用独立缓存文件）
- 任何可能超过 100 KB 的数据

**允许存储**：
- API Keys
- 用户偏好设置（主题、字体大小等）
- 窗口尺寸和位置
- 项目基础元数据（仅 ID 和名称，不含内容）

### 自动体积检查

应用启动时会自动检查配置体积：

```
[Config] ✓ 配置文件大小正常: 12.34 KB
[Config] ⚠️ 配置文件体积偏大: 456.78 KB
[Config] ❌ 配置文件严重超标: 2.34 MB
```

如果出现严重超标，说明有大数据被错误地存入配置，需要检查代码逻辑。

---

## 故障排查流程

### 1. 应用无法启动

**症状**：`SyntaxError: Unexpected end of JSON input`

**解决**：
1. 关闭应用
2. 删除 `%APPDATA%\starverse\config.json`
3. 重新启动

### 2. 配置频繁损坏

**可能原因**：
- 应用在写入配置时被强制终止
- 磁盘空间不足
- 权限问题

**排查步骤**：
1. 检查磁盘空间：`Get-PSDrive C`
2. 检查文件权限：`Get-Acl "$env:APPDATA\starverse\config.json"`
3. 查看备份文件：`Get-ChildItem "$env:APPDATA\starverse\" -Filter "*.bak"`

### 3. 配置体积异常增长

**排查步骤**：
1. 启动应用，查看启动日志：
   ```
   [Config] ⚠️ 配置文件体积偏大: 456.78 KB
   [Config] 最大的 5 个字段:
     - modelCapabilities: 234.56 KB
     - conversationsList: 123.45 KB
   ```

2. 检查大字段来源：
   ```powershell
   $config = Get-Content "$env:APPDATA\starverse\config.json" | ConvertFrom-Json
   $config.PSObject.Properties | ForEach-Object {
       $size = ($_.Value | ConvertTo-Json -Depth 100).Length
       [PSCustomObject]@{
           Key = $_.Name
           SizeKB = [math]::Round($size / 1024, 2)
       }
   } | Sort-Object SizeKB -Descending | Format-Table
   ```

3. 使用安全清空功能：
   ```typescript
   // 保留 API Keys，清空其他所有字段
   await window.electronStore.clearSafe([
     'geminiApiKey',
     'openRouterApiKey',
     'activeProvider'
   ])
   ```

---

## 总结

### 核心改进

1. **三层容错机制**：`clearInvalidConfig` + `defaults` + 自定义 `deserialize`
2. **自动备份**：损坏的配置自动备份为 `.bak` 文件
3. **启动时检查**：完整性检查 + 版本迁移 + 体积检查
4. **安全 API**：`safeClearConfig()` 和 `checkIntegrity()`

### 使用原则

- ✅ 使用 `electronStore` API 操作配置
- ✅ 使用 `clearSafe()` 清空配置
- ❌ 不要直接编辑配置文件
- ❌ 不要存储大数据到配置

### 相关文件

- `electron/main.ts` - Store 初始化和 IPC Handler
- `electron/config/configSchema.ts` - 配置管理逻辑
- `electron/preload.ts` - API 暴露
- `src/types/electron.d.ts` - TypeScript 类型定义
