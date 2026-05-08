# P3-B2 真实 Magika runtime 接入评估

## 1. 评估结论

`assessment_only`

本轮结论是不进入真实 runtime 最小集成。原因不是架构不可行，而是关键前置条件仍未闭合：依赖体量/打包影响、模型文件供应策略、`magikaModelVersion` 稳定来源与离线策略尚未冻结，现阶段直接改依赖会引入不可控发布风险。

## 2. 当前 Starverse runtime 边界

- 当前 `detectFull` 走 `magikaRuntimeLoader -> magikaAdapter`，`detectBasic` 不启用 Magika。
- runtime 不可用时已能结构化降级，不阻断 lightweight detector（magic/text/container）。
- `magikaModelVersion` 已有 provenance 链路承载，但当前主要由 mock/loader 注入，不依赖真实模型。
- `sendRouteMapping` 与 `engineAvailability` 已存在联动框架，但不会把 Magika 变成发送路径硬门槛。

## 3. Magika NPM package 评估

评估对象（npm registry）：
- package: `magika@1.0.0`
- license: `Apache-2.0`
- 代码仓库: `https://github.com/google/magika`
- unpacked size: ~366 KB（不含其依赖的总体体积）

依赖特征：
- 直接依赖：`@tensorflow/tfjs@^4.22.0`
- 可选依赖：`@tensorflow/tfjs-node`, `chalk`, `commander`
- `@tensorflow/tfjs` 自身 unpacked size 约 147 MB，依赖树较重。

运行形态（Node）：
- 支持 `magika/node` 用法。
- 支持 `modelPath/configPath` 本地加载。
- 也支持 `modelURL/configURL` 远程加载（默认示例指向 `google.github.io`）。

结论：
- 功能上可接入。
- 工程上存在明显体量与构建边界风险，不能在未冻结策略时直接引入依赖。

## 4. 模型文件与版本来源评估

已确认：
- npm 包本体不携带大模型文件。
- 运行真实推断需要模型与配置文件。
- Node 形态可走本地 `modelPath/configPath`，具备离线潜力。

未闭合点：
- 模型文件来源与分发路径未冻结（仓库提交、应用资源、受控下载、managed asset 等）。
- 模型体积与版本管理策略未冻结。
- `magikaModelVersion` 必须来自 runtime/loader 显式返回，但当前尚无已冻结的“唯一元数据来源”规范文件。

结论：
- 在未冻结模型供应链策略前，不应提交真实 runtime 依赖或模型文件。

## 5. Electron / Vite / Node 兼容性评估

当前仓库约束：
- Node: `>=22 <23`
- Electron: `^38.6.0`
- Vite: `^5.1.6`
- DB worker 打包使用 esbuild，`platform: node`，`target: node18`。

风险点：
- 引入 `magika + tfjs` 后，worker bundle 体积与构建时间可能显著上升。
- `@tensorflow/tfjs-node` 为可选依赖，可能引入 native/ABI 复杂性（不同平台 install 行为差异）。
- 需明确 runtime 实际运行上下文（main/worker）与 bundle external 策略，避免将重量依赖卷入不必要构建目标。

结论：
- 兼容性无明确“不可行”证据，但构建与发布风险尚未完成定量验证。

## 6. 离线运行与本地 model/config path 策略

可行策略（建议）：
- 仅允许本地 `modelPath/configPath`。
- 禁止默认远程 `modelURL/configURL`。
- 无本地模型时返回 `runtime_unavailable` 并降级，不联网下载。

当前状态：
- Loader 架构可表达该策略，但尚未落实模型供应链与部署路径。

## 7. Starverse 最小接入方案

仅在 Owner 冻结以下条件后推进最小集成：

1. 依赖冻结
- 明确是否允许加入 `magika`（以及是否允许/禁止 `@tensorflow/tfjs-node`）。
- 明确 lockfile 变化可接受范围与平台安装策略。

2. 模型供应链冻结
- 明确模型/config 的获取与部署方式（禁止测试联网下载）。
- 明确模型版本命名规范，作为 `magikaModelVersion` 唯一来源之一。

3. 运行边界冻结
- 仅 `detectFull` 接入真实 runtime。
- `detectBasic` 保持无 Magika 硬依赖。
- runtime 异常只影响 Magika evidence，不阻断核心识别。

## 8. 测试策略

默认策略：
- 现有测试继续使用 mock runtime / fake metadata。

真实 runtime 测试（后续可选）：
- 必须 gated（例如 `STARVERSE_ENABLE_REAL_MAGIKA_TESTS=1`）。
- 默认 CI 跳过。
- 无本地模型时 `skip with explicit reason`，不得 fail。
- 禁止将联网下载模型作为测试前置。

## 9. 风险与回滚策略

主要风险：
- 依赖体积导致安装/构建/打包回归。
- 模型文件供应链不稳定导致“本地可用性”不可重复。
- `magikaModelVersion` 来源不稳定导致 cache/provenance 混乱。
- 运行时不可用路径处理不一致，意外影响 detectFull 延迟与稳定性。
- label 空间变化影响 taxonomyMap 映射稳定性。

回滚策略：
- 保持 loader 注入边界不变，优先通过配置回退到 `unavailable/mock`。
- 不改 detectBasic 路径。
- 真实 runtime 改动应独立提交，异常时可整包回滚。

## 10. 是否允许本轮继续最小集成

不允许。

本轮结论为 `assessment_only`。建议先补一轮 Owner 冻结：
- 依赖引入许可与版本；
- 模型文件供应链与体积预算；
- `magikaModelVersion` 元数据来源规范；
- worker 打包/external 策略；
- 真实 runtime gated test 策略。

在上述项冻结前，不修改 `package.json/lockfile`，不做真实 runtime 接入代码提交。
