# Starverse 故障排查指南

> **Status**: active
> **Document Role**: guide
> **Last updated**: 2026-08-14
>
> 2026-08-14 重写：原指南停留在 `chat.db`/“完全离线”时代；已按 epoch-2 布局与现行工具链重写。

## better-sqlite3 编译 / ABI 错误

原生模块 ABI 不匹配（如 `NODE_MODULE_VERSION` 或 native binding 错误）时：

```bash
# Node 脚本 / 数据库测试 / Vitest 前
npm run rebuild:node

# Electron 启动或 smoke 前
npm run rebuild:electron
```

Node 与 Electron 的 ABI 目标互斥：切换环境后需为即将运行的环境重建对应目标。Windows 下若首次编译失败，确认已安装 Visual Studio Build Tools（VS Installer 的“使用 C++ 的桌面开发”工作负载）。

## 数据存储路径（epoch-2）

- **Windows**: `C:\Users\<用户名>\AppData\Roaming\Starverse\workspace\epoch-2\starverse.db`
- **macOS**: `~/Library/Application Support/Starverse/workspace/epoch-2/starverse.db`
- **Linux**: `~/.config/Starverse/workspace/epoch-2/starverse.db`

配置文件在 `<appData>/Starverse/config.json`（含官方 Provider 受保护凭据记录）。应用**不再打开旧的 `chat.db`**。

> 注意：“本地优先”表示会话和配置默认保存在本机，**不代表应用完全离线**——发送消息、同步远端模型目录、下载插件或处理远程 URL 时，数据会按用户选择发送到相应服务。

## 数据库 schema 不匹配

schema digest 不匹配时默认 fail-closed（不启动）。如需显式备份并重建：

```powershell
$env:SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH=1
npm run electron:dev
```

相关 smoke：`npm run test:schema-mismatch-recovery`。

## LibreOffice / DFC 转换问题

- **DOCX→PDF 选项不可用**：Windows x64 的 LibreOffice 运行时需先在 Plugin Management 中**手动安装**（`install_official_plugin`）或离线导入已验证的 `.svpkg`；应用不会自动下载。
- **安装下载失败（`fetch_failed` / `curl_28` / `resume_retries_exhausted`）**：多为网络或代理问题。在设置中配置 Network Proxy（manual/system），再从 Plugin Management 重试**一次**；不要反复触发大包下载。
- **安装卡在 `staging`/import**：旧版本存在解压阶段事件循环饥饿，已由异步解压修复；如复现，运行 `npm run test:office-pdf-libreoffice-live-installed-state-smoke` 收集诊断。
- **路径深度**：运行时工作目录不宜过深（深度路径曾导致转换失败）；运行时与产物放在仓库外短路径下，见 [本地运行时工作目录规范](../maintenance/local-runtime-workdirs.md)。
- **支持范围**：仅 Windows x64 DOCX→PDF 为已批准生产范围；`.doc/.rtf/.docm`、Excel→PDF、OCR 不支持；无系统 LibreOffice/PATH 回退。

## 网络 / 代理

- OpenAI-compatible 请求在主进程执行地址/DNS 审计、重定向限制与凭据转发检查；代理凭据不支持的 URL 会被拒绝。
- 网络出口门禁：`npm run gate:network-egress`；抓包：`npm run dev:netlog`（敏感模式需显式设置 `SV_NETLOG_CAPTURE_MODE` 等环境变量）。

## 其他

- **推理参数探测**：`npm run diagnose:openai-responses-o-reasoning`。
- **数据清理**：旧清理指南已归档（[archive/documentation/DATA_CLEANUP_GUIDE.md](../archive/documentation/DATA_CLEANUP_GUIDE.md)）；epoch-2 数据通过应用内删除对话/项目处理。
- **打包身份**：`npm run test:packaged-identity-smoke`。
- **诊断记录**：历史调试调查见 [docs/diagnostics/](../diagnostics/)。
