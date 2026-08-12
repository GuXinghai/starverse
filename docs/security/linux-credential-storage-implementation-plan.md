# Linux Credential Storage Implementation Plan

> 状态：代码、自动化验收与 Windows 真实开发启动已完成；Linux packaged smoke 因当前无 Linux 环境而待核验。目标行为以 [Linux Credential Storage Policy](./linux-credential-storage-policy.md) 为准；全局秘密边界以 [Credential Authority 加固方案](./credential-authority-hardening.md) 为准。

本计划只安排实现顺序，不引入新框架、密码保险箱、外部 helper、自动迁移或新的 CI 门禁。

## 已确定的规则

- Electron 返回 `basic_text`、`unknown` 或 backend 查询失败时，安全存储必须 fail-closed。
- `session` 和 `plaintext` 只能由用户在保存新 Key 时明确选择，不能自动降级。
- `session` 只在 Electron main 内存中存在；可以临时覆盖持久凭据，重启后消失。
- `plaintext` 必须持续显示为“明文存储”；不得伪装成 `safeStorage` 密文。
- `clear` 清除同一 Provider 的 session 与持久凭据。
- 设置页不回填旧 Key；renderer、preload、IPC、日志和 Agent context 均不得读取凭据。
- 当前是受控开发阶段。记录或 SQLite schema 变化可以重置旧凭据/开发数据库，不做在线迁移。

内部保留 `configured`、`availability`、`diagnosticCode`，另增加存储模式和临时覆盖标记；UI 状态由这些字段派生，底层错误码必须保留。

## 实施顺序

### 1. 安全 backend 判定（已完成）

- 建立标准 Provider 与 Compatible Provider 共用的 backend policy。
- 使用 `getSelectedStorageBackend()`；拒绝 `basic_text`、`unknown` 和查询异常。
- 状态与保存失败返回准确错误，不在启动时解密凭据。

验收：安全 backend 正常工作；弱 backend 不发生持久写；两套 credential service 都有定向测试。

### 2. Session 凭据（已完成）

- 在 main process 增加 session credential map，并复用 mutation queue、revision/CAS 和现有 lease 边界。
- 明确 session 覆盖持久记录、替换、清除、关闭 service 和重启后的行为。
- 设置页增加“仅本次运行”，并显示是否临时覆盖已保存凭据。

验收：磁盘和 SQLite 无 session Key；运行中可发送；重建 service 后消失；clear 同时清除两层；并发测试无 lost update 或 hang。

### 3. 显式明文持久化（已完成）

- 标准 Provider 使用 backend-aware record；Compatible Provider 在现有 SQLite transaction 中保存 backend 与 payload。
- 用户必须先看到风险说明并主动选择“明文保存”。
- 检查 Linux 数据目录、配置文件和 SQLite 文件的实际访问权限。

验收：明文状态持续可见；没有自动 secure-to-plaintext 降级；Compatible 创建、替换、清除、删除继续满足事务回滚；公开接口、错误和日志不泄露 Key。

## 完成检查

### 完整复核事项（2026-08-12 至 2026-08-13）

- [x] 解除 Linux 启动对 Win32 native epoch root lease 的无条件依赖；Linux 使用自己的 root/database authority，并保留路径与数据库身份检查。
- [x] 在 Electron main credential authority 中限制 `plaintext` 仅可由 Linux 显式选择；Windows/macOS 绕过 renderer 直接调用 IPC 也 fail-closed，设置页不展示无效的 plaintext 选项。
- [x] 修复 Compatible Provider 的 session 替换语义：临时覆盖已有持久凭据时保留原 credential ref 与持久记录，重启后恢复原凭据，不把 endpoint 永久改指向一次性 session ref。
- [x] 删除公开的 Compatible `writeCredential` 独立写入口；创建与替换由绑定 endpoint metadata 的 SQLite transaction authority 提交。
- [x] 为 Compatible 凭据保留准确的解密失败、记录损坏与 backend 不可用错误；状态携带 `availability`、`diagnosticCode`、backend 与 session override。
- [x] 加固 Linux owner-only 权限验证：覆盖 SQLite journal 文件，拒绝符号链接、非预期文件类型与 owner 漂移；POSIX lease 绑定 boot ID 与进程启动身份以处理 PID 复用。
- [x] 补齐凭据、IPC、endpoint CAS/lease、SQLite 与 UI 定向回归，并完成 TypeScript/Vue 检查。`vue-tsc` 首次超时后单实例重试通过。
- [x] 完成修复后的 P0/P1 复核并处理有效发现；同步修正文档阶段状态。受控开发环境不做在线迁移，旧 credential/开发数据库按明确决策 reset/recreate。
- [ ] 在真实 Linux packaged 环境完成 smoke；若环境仍不可用，明确记录为环境阻塞，不伪装为通过。
- [x] 完成真实开发启动验证：`npm run rebuild` 成功切换到 Electron ABI；`npm run dev` 启动 Vite 与 Electron main，窗口 `Starverse - AI Chat` 句柄非零且响应正常；验证后仅停止本次已识别进程树。启动错误码：无。
- [x] 错误精确展示：已知底层失败映射为稳定且具体的 `diagnosticCode`；状态显示底层诊断，未知异常只返回脱敏的稳定失败码。schema recovery 日志不输出绝对备份路径。
- [x] 旧路径排查与清理：已删除失去权威性的 Compatible credential store、独立写 IPC、preload bridge、类型与专用启动清理分支；通用配置清洗仅负责删除不支持的旧字段。

未勾选项是环境或真实启动验收，不表示上述代码项仍未实现；不得将 Linux packaged smoke 误报为已通过。
