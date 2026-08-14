# Starverse 当前系统架构

**Status**: active
**Document Role**: ssot
**Last updated**: 2026-08-14
**Coverage**: 当前 Electron 进程边界、Epoch-2 数据所有权和 Generation V2 的高层入口；具体 Provider、文件管道与数据契约由各自专题 SSOT 覆盖。

## 运行时入口与所有权

Starverse 当前由 Electron 主进程启动：

```text
electron/epoch2MainEntry.ts
  -> epoch-2 application bootstrap
  -> electron/mainV2.ts
  -> IPC registration, provider services, file/plugin services
```

Renderer 通过 `electron/preload.ts` 暴露的受限 IPC 接口调用主进程；它不得直接打开 SQLite、读取凭据存储或创建 Provider 请求。

主进程拥有 Epoch-2 数据根和主数据库连接。`electron/data-epoch/` 解析根布局、租约、schema/integrity 检查及受控恢复；`infra/db/` 提供 SQLite repository 和数据契约。主数据库位于应用数据根下的 `workspace/epoch-2/starverse.db`，不是历史 `chat.db`，也不经由数据库 Worker 线程访问。

## 主要边界

| Boundary | Authority | Primary code paths |
|---|---|---|
| Renderer interaction | Vue UI、会话展示与受限客户端命令 | `src/ui-app/`, `src/next/`, `electron/preload.ts` |
| Application runtime | 生命周期、窗口、IPC 注册和服务装配 | `electron/epoch2MainEntry.ts`, `electron/mainV2.ts`, `electron/bootstrap/` |
| Persistence | Epoch-2 layout、SQLite schema/repository、受控恢复 | `electron/data-epoch/`, `infra/db/` |
| Generation | Provider binding、请求快照、执行和历史投影 | `src/next/generation-v2/`, `electron/services/`, `infra/db/repo/` |
| Provider/model selection | Catalog、route preference、credential/settings 和执行身份边界 | `src/shared/modelCatalog/`, `src/next/provider/`, `docs/architecture/provider-architecture/` |
| Files and plugins | 附件、转换、Send Plan 与插件生命周期 | `src/shared/files/`, `infra/files/`, `docs/file-pipeline/README.md` |

## 当前架构的阅读顺序

1. 本文用于确定进程、数据和模块所有权。
2. Provider 设计阅读 [provider architecture README](provider-architecture/README.md)。
3. Generation V2 的持久化和请求事实以当前代码、测试及对应专题契约为准。
4. 文件管道从 [file-pipeline entry](../file-pipeline/README.md) 进入其决策 ledger。

## 非目标与历史边界

- 本文不替代具体 API、数据库 schema 或 Provider 协议的专题规范。
- 旧的 `dbBridge`/数据库 Worker 架构记录见 [OVERVIEW.md](OVERVIEW.md)，仅供历史追溯，不可作为当前实现依据。
- 当本文与当前源码或测试冲突时，以当前源码和测试为最终事实，并更新本文或相应专题 SSOT。
