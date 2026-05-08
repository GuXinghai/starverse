# P4-B：Magika Official Managed Plugin Closeout

Status: **P4-B completed with follow-ups**

## 1. 阶段定位

P4-B 是 Phase 4 的第二个任务包，目标是在 P4-A（官方限定插件市场最小闭环）基础上，完成 Magika official managed plugin 的 package spec、managed root registration、classify runner contract、detectFull integration 及 gated test scaffold。

P4-B 不代表 Phase 4 completed。

## 2. 子包完成概览

| 子包 | 内容 | Commit | 状态 |
|------|------|--------|------|
| P4-B1 | Magika package specification + trusted root / catalog distribution hardening | `47e29e7` | completed |
| P4-B2 | Managed root / official pre-staged package registration replacement | `ce39ca1` | completed |
| P4-B3 | Magika classify runner contract + fake runtime tests | `1baace1` | completed |
| P4-B4 | detectFull integration + gated real-runtime test scaffold | `a87ed3d` | completed |
| P4-B5 | P4-B closeout and manual smoke checklist | 本 commit | completed |

## 3. 关键交付

### 3.1 Package Spec（P4-B1）

- `MagikaPackageLayoutSpec` 类型定义了官方 Magika 包的必须结构（`manifest.json`、`runtime/`、`model/`）
- `validateMagikaPackageLayout()` 提供代码级布局校验
- `runtimeKind` 确认无需扩展（`local_loader` 已覆盖生产路径）

### 3.2 Managed Root Registration（P4-B1 + P4-B2）

- UI 端 `installRootKind` 由 API 返回的 `recommendedInstallRootKind` 驱动（P4-B1）
- 服务端强制校验：`trustedRootSource === 'official'` 时拒绝 `test_root`（P4-B2）
- `test_root` 仅在 test/dev 环境可用

### 3.3 Classify Runner（P4-B3）

- `magikaClassifyRunner.ts` — 受控 classify runner
- 通过 `externalProcessRunner`（P3-A 安全底座）执行
- 输入上限 10MB（超限返回 `input_too_large`）
- 输出 JSON schema 校验（label、score、modelVersion）
- 异常场景结构化失败（timeout、output_limit、runtime_error、invalid_output、process_kill_failed）
- `createMagikaClassifyCallback()` 连接 classify runner 到 managed plugin loader

### 3.4 detectFull Integration（P4-B4）

- Magika classify 通过 `detectFull` 的 runtime probe 路径接入
- `detectBasic` 始终不调用 Magika（代码+测试已验证）
- modelVersion 写入 `versionInfo.magikaModelVersion`
- modelVersion 变化 → `magika_model_version_changed` stale
- Magika evidence 评分（700 base）不覆盖 strong magic（900+120）或 containerProbe（1000）

### 3.5 Gated Real-Runtime Tests（P4-B4）

- `magikaClassifyRunner.real.test.ts` — gated scaffold
- `STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1` 启用
- `STARVERSE_REAL_MAGIKA_PLUGIN_DIR` 指定插件目录
- 默认 CI skip，无本地模型时 skip with reason
- 禁止联网下载

## 4. 全面禁止项扫描结果

| 扫描项 | 结果 |
|--------|------|
| `provider_file_ref` / `providerFileRef` 新增引入 | 未引入（仅 docs 中描述为延后项） |
| `contentToken` 在普通日志中 | 仅在 logSanitizer 中出现（安全脱敏） |
| `fullHash` 在普通日志中 | 无匹配 |
| 真实绝对路径在 console.log/warn/error | 无匹配 |
| third-party / custom marketplace / marketplaceUrl / trustedRootUrl 新增 | 未引入（仅 docs 中描述为非目标） |
| `magika` / `@tensorflow/tfjs` 在 package.json / package-lock.json | 无匹配 |
| 过早完成措辞（Phase 4 completed 等） | 未写入（仅 docs 中描述此口径） |
| `shell: true` 在生产代码中 | 仅在测试代码中出现（显式测试拒绝） |

## 5. 人工烟测清单

以下手工烟测需要在真实 Electron 环境中执行（当前仅在自动化测试中验证）：

| # | 场景 | 预期 |
|---|------|------|
| 1 | 无 trusted root 配置时 UI 显示未配置 | 显示 amber 警告条 |
| 2 | 配置 official trusted root 后 list plugins 正常 | 插件列表正常 |
| 3 | Register with `managed_root` 成功 | installState → installed |
| 4 | Enable / Disable 状态切换 | 状态正确切换 |
| 5 | Uninstall 后状态 | installState → uninstalled |
| 6 | Health check 正常 | healthStatus → healthy |
| 7 | 篡改模型文件后 health check | 返回 hash_mismatch |
| 8 | 篡改 catalog 后签名验证 | 返回 catalog_signature_invalid |
| 9 | UI 不显示真实路径/hash/token | 无敏感信息 |
| 10 | `test_root` 在 official source 下被拒绝 | 返回 install_root_kind_mismatch |
| 11 | `managed_root` 在 Electron 环境下注册成功 | 插件正常可用 |

## 6. 明确约束确认

| 约束 | 状态 |
|------|------|
| 不新增 magika / @tensorflow/tfjs 到 Starverse 主包 | 确认 |
| 不修改 package.json / package-lock.json | 确认 |
| 不提交真实 Magika 模型文件 | 确认 |
| 不提交真实 runtime 包 | 确认 |
| 不提交 private key | 确认 |
| 不提交测试签名私钥 | 确认 |
| 不接 Tika / LibreOffice / ffprobe / Pandoc | 确认 |
| 不做深度转换闭环 | 确认 |
| 不引入 provider_file_ref | 确认 |
| 不做 legacy message_asset destructive cleanup | 确认 |
| 不改 sendPlanService 主逻辑 | 确认 |
| 不重构 appChatApp.logic.ts | 确认 |
| 不开放第三方插件生态 | 确认 |
| 不支持 custom marketplace URL | 确认 |
| 不支持用户自定义 trusted root | 确认 |
| 不把 P4-B 写成 Phase 4 completed | 确认 |
| renderer/UI/IPC DTO 不暴露 installRef/manifestHash/packageSha256/contentToken/fullHash | 确认 |
| 不在普通日志输出真实路径/contentToken/fullHash/完整 hash/真实插件路径 | 确认 |
| 不联网下载模型/catalog/runtime 或插件包 | 确认 |

## 7. 修改文件总清单

### 新增（11 files）
1. `src/next/file-type/magikaClassifyRunner.ts`
2. `src/next/file-type/magikaClassifyRunner.test.ts`
3. `src/next/file-type/magikaClassifyRunner.real.test.ts`
4. `docs/file-pipeline/file-type-detection-implementation/22-p4b1-magika-package-spec-and-distribution.md`
5. `docs/file-pipeline/file-type-detection-implementation/23-p4b2-managed-root-registration.md`
6. `docs/file-pipeline/file-type-detection-implementation/24-p4b3-magika-classify-runner-contract.md`
7. `docs/file-pipeline/file-type-detection-implementation/25-p4b4-detectfull-gated-runtime.md`
8. `docs/file-pipeline/file-type-detection-implementation/26-p4b-magika-official-managed-plugin-closeout.md`

### 修改（13 files）
9. `src/next/file-type/magikaManagedPlugin.ts`
10. `src/next/file-type/magikaManagedPlugin.test.ts`
11. `src/next/file-type/index.ts`
12. `infra/files/enginePluginLifecycleService.ts`
13. `infra/files/enginePluginLifecycleService.test.ts`
14. `infra/files/fileTypeDetectionService.test.ts`
15. `infra/db/worker/runtime.ts`
16. `src/next/ipc/contracts/enginePluginLifecycleContracts.ts`
17. `src/next/files/enginePluginLifecycleClient.test.ts`
18. `src/ui-app/components/EnginePluginSettingsPanel.vue`
19. `src/ui-app/components/EnginePluginSettingsPanel.test.ts`
20. `docs/file-pipeline/file-type-detection-implementation/README.md`

## 8. 剩余风险

1. **真实 Magika 模型文件未入主仓** — 模型文件不在此次实现范围，需 Owner 在 P4-D / 生产发布前提供预置包。
2. **magika / tfjs 未入主包依赖** — 真实 runtime 需在 Electron 打包时以独立 bundle 形式分发。
3. **real-runtime tests 默认 gated / skip** — 仅在有人工干预的 dev 环境下手动执行。
4. **手工烟测未执行** — Settings UI 真实 Electron 交互烟测需在生产环境部署前完成。
5. **P4-B 不代表 Phase 4 completed** — Phase 4 仍需 P4-C（Tika / LibreOffice / ffprobe / Pandoc）后续规划。
6. **真实 catalog 未生成** — 当前使用测试签名密钥，生产 catalog 需 Owner 离线签名。

## 9. 测试覆盖率摘要

| 测试文件 | 测试数 |
|----------|--------|
| magikaManagedPlugin.test.ts | 32 |
| magikaClassifyRunner.test.ts | 11 |
| magikaRuntimeLoader.test.ts | 2 |
| magikaAdapter.test.ts | 6 |
| fileTypeDetectionService.test.ts | 14 |
| enginePluginLifecycleService.test.ts | 16 |
| EnginePluginSettingsPanel.test.ts | 10 |
| pluginCatalog.test.ts | 6 |
| officialPluginTrustedRoots.test.ts | 12 |
| externalProcessRunner.test.ts | 11 |
| evidenceMerge.test.ts | 5 |
| enginePluginLifecycleClient.test.ts | 14 |
| enginePluginRegistryRepo.test.ts | 11 |
| **总计** | **150** |

## 10. 下一步

P4-C 是 Tika / LibreOffice / ffprobe / Pandoc 外部转换引擎优先级与深度转换闭环规划。建议在 P4-B 外部审计通过后进入 P4-C planning。

本次 P4-B 停止后，等待 Owner / 外部审计。
