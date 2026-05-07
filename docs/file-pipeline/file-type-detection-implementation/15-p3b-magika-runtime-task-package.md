# P3-B Magika runtime 接入与降级闭环实施前任务包

## 1. 阶段定位

本文件是 P3-B implementation package（实施前任务包），用于约束下一轮实现范围与验收，不代表 P3-B implementation completed。

## 2. P3-B 目标

- 明确真实 Magika runtime 或 runtime loader 的接入边界。
- 将 `magikaModelVersion` 稳定写入 verdict provenance（经 Stage C 独立表落库链路持久化）。
- 确保 Magika label 必须先经过 `taxonomyMap` 映射，再进入内部 `FileFormatId`。
- runtime unavailable 时稳定降级到 lightweight detector（magic/container/text），不阻断基础识别。
- 明确 Magika 不是 Core Detector 硬依赖。
- 复核 `engineAvailability` 与 `sendRouteMapping` 的联动边界（只影响 candidate，不污染 verdict）。
- 明确 cache invalidation 与 Magika 模型版本变化的边界与触发条件。

## 3. P3-B 非目标

- 不接入 Tika / LibreOffice / ffprobe / Pandoc。
- 不做插件安装、升级、回滚、卸载完整生命周期。
- 不做 Office / PDF / HTML / EPUB 深度转换闭环。
- 不改 UI 主流程。
- 不改 `sendPlanService` 主逻辑。
- 不引入 `provider_file_ref`。
- 不做 destructive cleanup（含 legacy message_asset 破坏性清理）。
- 不做完整诊断面板。

## 4. 已勘察文件清单

- `D:/Starverse/src/next/file-type/magikaAdapter.ts`
- `D:/Starverse/src/next/file-type/magikaAdapter.test.ts`
- `D:/Starverse/src/next/file-type/taxonomyMap.ts`
- `D:/Starverse/src/next/file-type/types.ts`
- `D:/Starverse/src/next/file-type/evidenceMerge.ts`
- `D:/Starverse/src/next/file-type/sendRouteMapping.ts`
- `D:/Starverse/src/next/file-type/sendRouteMapping.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineTypes.ts`
- `D:/Starverse/src/next/file-type/externalEngineAvailability.ts`
- `D:/Starverse/src/next/file-type/externalEngineAvailability.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineManifest.ts`
- `D:/Starverse/src/next/file-type/externalEngineRegistry.ts`
- `D:/Starverse/src/next/file-type/externalEngineRegistry.test.ts`
- `D:/Starverse/src/next/file-type/externalEngineHealth.ts`
- `D:/Starverse/src/next/file-type/externalEngineHealth.test.ts`
- `D:/Starverse/src/next/file-type/externalProcessPolicy.ts`
- `D:/Starverse/src/next/file-type/externalProcessRunner.ts`
- `D:/Starverse/infra/files/fileTypeDetectionService.ts`
- `D:/Starverse/infra/files/fileTypeDetectionService.test.ts`
- `D:/Starverse/infra/files/fileTypeDetectionService.fixtures.test.ts`
- `D:/Starverse/infra/db/repo/fileTypeVerdictRepo.ts`
- `D:/Starverse/infra/db/types.ts`

## 5. 当前 Magika scaffold 与可复用能力

- `magikaAdapter` 当前是 mockable adapter：`detect(input) -> {label, score} | null`，并通过 `mapMagikaOutputToEvidence` 转成 `FileTypeEvidence`。
- `detectFull` 路径会调用 `runMagikaProbe`；`detectBasic` 不调用。
- 未知 Magika label 当前被映射为 `unknown` 且强制降为 low confidence，不扩展内部枚举。
- `fileTypeDetectionService` 已有 versionInfo 落库能力，包含 `magikaModelVersion` 字段，但默认值仍是 `null`。
- `externalEngineRegistry/Health/Availability` 已有 scaffold，health 可注入 process runner，失败可映射 availability 与 diagnostics，不会直接修改 verdict。
- `sendRouteMapping` 已消费 `engineAvailability` 影响 requiresJob 路线 gating，但该 gating 目前与 Magika 运行时可用性尚未形成专门契约。

## 6. 当前缺口

- runtime loader 缺口：
  - 尚无真实 Magika loader 接口定义（模型路径、加载时机、失败分类）。
- model version / provenance 缺口：
  - `magikaModelVersion` 缺少运行时来源与回填规则，默认常量为 `null`。
- taxonomyMap 映射缺口：
  - 映射表已存在，但缺少“label 版本变化 -> taxonomyMapVersion 升级”执行规范。
- unavailable 降级缺口：
  - 缺少统一策略定义：runtime unavailable 时 detectFull 如何记录 reason/error 且保持 verdict 可用。
- cache invalidation 缺口：
  - 目前主要基于 fingerprint；尚未明确 “模型版本变化” 是否触发重检。
- sendRouteMapping / availability 联动缺口：
  - 需要明确 Magika availability 仅影响 candidate 附加 warning/blockedBy，不能回写/污染 verdict。
- 测试缺口：
  - 缺少“模型版本变化触发或不触发缓存策略”测试。
  - 缺少“runtime unavailable 但基础检测继续成功”针对 detectFull 的契约测试细化。

## 7. P3-B 建议最小实现范围

拟修改文件（计划）：

- `D:/Starverse/src/next/file-type/magikaAdapter.ts`
- `D:/Starverse/src/next/file-type/magikaAdapter.test.ts`
- `D:/Starverse/infra/files/fileTypeDetectionService.ts`
- `D:/Starverse/infra/files/fileTypeDetectionService.test.ts`
- `D:/Starverse/src/next/file-type/sendRouteMapping.ts`（仅当联动口径需要最小补丁）
- `D:/Starverse/src/next/file-type/sendRouteMapping.test.ts`（联动回归）
- `D:/Starverse/src/next/file-type/taxonomyMap.ts`（仅在 label 映射缺口确认后最小增补）

拟新增文件（计划）：

- `D:/Starverse/src/next/file-type/magikaRuntimeLoader.ts`（仅接口与装配边界，非完整外部引擎链路）
- `D:/Starverse/src/next/file-type/magikaRuntimeLoader.test.ts`

说明：以上仅为 P3-B 实施建议清单，本轮不修改运行时代码。

## 8. 禁止修改范围

- 不重构 `D:/Starverse/src/ui-app/app/appChatApp.logic.ts`。
- 不改 `D:/Starverse/infra/files/sendPlanService.ts` 主逻辑。
- 不改 `D:/Starverse/src/next/openrouter/openRouterSendPlanSerializer.ts` 主行为。
- 不改 UI 附件组件业务判断。
- 不改数据库 schema / migration（除非后续 Owner 明确确认）。
- 不扩大 `externalProcessRunner` 职责（P3-A 安全底座保持稳定，P3-B 不回流重构）。

## 9. 任务步骤

1. 明确 Magika runtime adapter 接口与 loader 边界（加载、失败、版本）。
2. 增加 runtime availability 与 fallback 策略（detectFull 软依赖）。
3. 写入 `magikaModelVersion` 到 evidence/provenance（并落到 `file_type_verdicts` versionInfo）。
4. 保证 taxonomyMap 映射和未知 label 降级行为稳定。
5. 复核 cache invalidation 与 sendRouteMapping 联动（candidate-only 影响）。
6. 增加测试与回归命令，固化 P3-B 契约。

## 10. Owner 待确认问题

- Magika runtime 形态优先级：内置 JS/WASM、Python CLI、外部 binary，还是先保留 mockable loader。
- Magika 模型文件是否随 Starverse 打包，还是运行时按受控策略加载。
- `magikaModelVersion` 的唯一来源：模型 manifest、二进制版本号、还是手动配置。
- runtime unavailable 时是否仅静默降级，还是需要输出可观测诊断事件。
- Magika 首轮进入 `detectBasic` 还是仅保留在 `detectFull`。
- 首轮是否允许新增依赖（默认不允许，需单独审批）。
- 是否允许新增小体积模型 fixture / stub（仅测试用途）。

## 11. 验收命令

```powershell
git diff --check
npm run lint:changed
npx vitest --run <P3-B 新增或相关测试路径>
npx vitest --run src/next/file-type/magikaAdapter.test.ts
npx vitest --run src/next/file-type/evidenceMerge.test.ts
npx vitest --run infra/files/fileTypeDetectionService.test.ts
npx vitest --run src/next/file-type/sendRouteMapping.test.ts
rg -n "magikaModelVersion|taxonomyMapVersion|magika" src/next/file-type infra/files infra/db
rg -n "Phase 3 completed|P3-B implementation completed|真实 Magika runtime 已完成|最终完成|主工程已完成" docs/file-pipeline/file-type-detection-implementation
```

## 12. 风险与回滚策略

- runtime 加载失败：保持 detectFull 可降级，错误仅落诊断，不阻断基础 verdict。
- 模型版本漂移：版本号必须显式入库，回滚时以 versionInfo + taxonomyMapVersion 对齐。
- label 空间变化：未知 label 只能降级 unknown/low，禁止扩展内部枚举。
- 误把 Magika 设为硬依赖：需契约测试锁定 fallback。
- cache 未因模型版本变化失效：需明确策略并加入回归测试。
- runtime 依赖引入跨平台打包风险：首轮优先 loader/stub 边界，避免一次性引入重依赖。
- 测试依赖真实模型不稳定：优先 mock runtime + fixture 框架。

## 13. 是否需要 Owner 确认

需要。进入 P3-B 实施前至少确认：

- runtime 形态选择与依赖策略；
- `magikaModelVersion` 来源与发布策略；
- `detectBasic` 是否纳入 Magika；
- unavailable 的可观测策略（静默降级 vs 诊断提示）；
- 是否允许新增最小 runtime 依赖。

## 14. 给 P3-B 实现 Agent 的下一条提示词草案

请在 `D:/Starverse` 实施 P3-B（Magika runtime 接入与降级闭环），仅做最小闭环实现：  
1) 在不引入真实 Tika/LibreOffice/ffprobe/Pandoc 的前提下，为 Magika 增加 runtime loader 边界与可注入实现；  
2) 在 `detectFull` 中接入 runtime availability + fallback（runtime 不可用时必须退回 lightweight detector）；  
3) 将 `magikaModelVersion` 写入 verdict versionInfo 并通过 repo 持久化；  
4) 保持 Magika label 必须经 `taxonomyMap` 映射，未知 label 降级 unknown/low；  
5) 保证 `engineAvailability` 对 `sendRouteMapping` 的影响仅体现在 candidate，不污染 verdict/cache；  
6) 补最小测试：adapter、service、fallback、version、sendRoute 联动；  
7) 禁止修改 UI 主流程、sendPlanService 主逻辑、DB schema、provider_file_ref；  
8) 完成后执行 lint/vitest/grep 验收并汇报差异与风险。
