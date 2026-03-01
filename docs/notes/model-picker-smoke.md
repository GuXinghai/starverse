# Model Picker Smoke Test（阶段 2）

## 1. 目标
- 固化阶段 2 主路径的可复现回归：
  - 模型查询与筛选
  - ModelPickerDialog 交互（单击选中、关闭回填）
  - 会话级 `selectedModelKey` 写入与发送链路覆盖
  - endpoints 详情首次拉取、缓存命中、手动刷新
  - 偏好持久化（favorites/recents 去重、排序、容量裁剪、scope 扩展路径）
- 保证离线环境可跑通自动 smoke；联网时可手动验证真实 endpoints 行为。

## 2. 方案决策
- 当前阶段采用：`集成测试 + 组件测试 + 手动 sanity`。
- 暂不新增 UI 层 e2e：
  - 阶段 2 主路径已可通过离线自动测试稳定覆盖。
  - UI e2e 后置到阶段 2 收尾或阶段 3，避免当前引入高维护/高波动用例。

## 3. 一键离线 Smoke（必跑）

```bash
npm run test:model-picker:smoke
```

该脚本当前实际执行（与 `package.json` 一致）：
- `tests/integration/model-catalog-sync-query-smoke.test.ts`
- `tests/integration/model-catalog-stage4-smoke.test.ts`
- `src/next/modelCatalog/catalogQueryService.test.ts`
- `src/next/modelCatalog/modelEndpointDetailService.test.ts`
- `src/ui-app/components/EndpointDetailPanel.test.ts`
- `src/ui-app/components/ModelPickerDialog.test.ts`
- `src/ui-app/components/ChatAppComposer.modelPicker.test.ts`
- `src/ui-app/AppChatApp.send.test.ts`
- `src/next/modelPrefs/modelPrefsService.test.ts`
- `infra/db/repo/modelPreferencesRepo.test.ts`

### 3.1 覆盖范围
- `tests/integration/model-catalog-sync-query-smoke.test.ts`
  - fixture 同步落库、fallback、providers 失败降级、hide guard。
- `tests/integration/model-catalog-stage4-smoke.test.ts`
  - 模型级筛选分组覆盖（身份/能力/模态/特性/合规/生命周期/category）
  - endpoints 缓存关键路径（首次拉取、缓存命中、手动刷新、刷新失败回退）
- `src/next/modelCatalog/catalogQueryService.test.ts`
  - query contract 归一化、filter/sort/pagination 组装。
- `src/next/modelCatalog/modelEndpointDetailService.test.ts`
  - endpoints 首次拉取、缓存命中、手动刷新、失败回退缓存。
- `src/ui-app/components/EndpointDetailPanel.test.ts`
  - endpoints 页签内部筛选（provider/tag/quantization/supports_implicit_caching/supported_parameters/status/uptime）与排序（latency/throughput/uptime）。
- `src/ui-app/components/ModelPickerDialog.test.ts`
  - 搜索防抖、分页、错误态可关闭、endpoints 刷新交互。
- `src/ui-app/components/ChatAppComposer.modelPicker.test.ts`
  - 选中模型后 pill 回填。
- `src/ui-app/AppChatApp.send.test.ts`
  - 会话级 `selectedModelKey` 持久化，下一次发送 payload 使用选中 `model_id`。
- `src/next/modelPrefs/modelPrefsService.test.ts`
  - Renderer 服务层收藏/最近使用读写、缓存失效、降级兜底、非 global scope 参数透传。
- `infra/db/repo/modelPreferencesRepo.test.ts`
  - favorites 去重与排序稳定、recents 去重与容量裁剪、事务原子性、global/project/conversation scope 组合。

### 3.2 断言方式（可审核）
- 集成测试（fixture + sqlite）：
  - `tests/integration/model-catalog-sync-query-smoke.test.ts`
  - 验证目录同步与查询结果，不依赖真实网络。
- repo 测试（sqlite in-memory）：
  - `infra/db/repo/modelPreferencesRepo.test.ts`
  - 验证偏好表持久化语义与裁剪逻辑（用于证明“重启后仍存在”的数据层契约）。
- service 层（mock fetch + mock dbBridge）：
  - `src/next/modelCatalog/modelEndpointDetailService.test.ts`
  - 验证 endpoints 双层缓存语义：首次拉取、缓存命中、手动刷新、失败回退缓存。
  - `src/next/modelPrefs/modelPrefsService.test.ts`
  - 验证偏好服务缓存语义与 scope 参数路径。
- 组件层（@testing-library/vue）：
  - `src/ui-app/components/ModelPickerDialog.test.ts`
  - `src/ui-app/components/ChatAppComposer.modelPicker.test.ts`
  - 验证 UI 交互（搜索/分页/单击选择/关闭回填/refresh 点击）。
- 渲染器链路测试（App 级 mock）：
  - `src/ui-app/AppChatApp.send.test.ts`
  - 验证会话级模型选择写入 `convo.meta.selectedModelKey`，并断言发送调用 payload 的 `config.model`。

### 3.3 离线前提
- 不需要真实 API key。
- 不依赖联网。
- 使用本地 fixture、mock fetch、内存 sqlite。

### 3.4 离线 endpoints 覆盖边界（明确）
- 离线 smoke 覆盖的是 endpoints 双层缓存的 **mock/fixture 逻辑路径**：
  - 盘缓存读写与回退逻辑
  - 内存 volatile 缓存命中逻辑
  - 手动刷新触发重拉逻辑
- 离线 smoke **不**覆盖真实 OpenRouter endpoints 网络可用性或真实返回波动。

## 4. 联网手动 Sanity（可选）

## 4.1 准备
1. 在设置中配置：
   - `openRouterApiKey`
   - `openRouterBaseUrl`（默认 `https://openrouter.ai/api/v1`）
2. 运行环境需可访问对应 `baseUrl` 域名。
3. 启动应用并等待目录可查询。
4. 若使用 EU 域名（`https://eu.openrouter.ai/api/v1`），目录集合可能与默认域名不同，手动 sanity 需与当前目录源 baseUrl 对齐。

## 4.2 步骤
1. 打开 `ModelPickerDialog`，搜索并切换到一个模型。
2. 观察右侧 `Endpoints` 面板：
   - 首次进入该模型：应触发一次网络拉取并显示 `fetchedAt`。
3. 关闭再打开同一模型：
   - 应优先显示缓存（不要求再次网络拉取）。
4. 点击 `Refresh`：
   - 触发重新拉取，`fetchedAt` 更新。
5. 断网后再次打开同一模型：
   - 若有缓存，仍显示缓存详情；
   - 若刷新失败，显示错误提示，但不影响模型选择与发送主路径。

### 4.3 联网 endpoints 覆盖边界（明确）
- 联网 sanity 覆盖的是 **真实 OpenRouter endpoints** 拉取与刷新路径：
  - 首次查看网络拉取
  - 后续缓存读取
  - 手动刷新重拉
- 若网络失败，仍以缓存可用性优先，不阻断模型选择主路径。

## 5. 验收判定
- 离线 smoke 一键通过。
- 联网手动 sanity 满足：
  - 首次查看拉取一次
  - 后续查看读缓存
  - 刷新才重新拉取
  - 失败不阻断主路径
- 偏好回归满足：
  - favorites 去重 + 排序稳定
  - recents 去重 + 容量裁剪
  - 至少一个非 global scope 测试通过（证明框架可扩展）

## 6. e2e 预埋约束（阶段 2）
- 阶段 2 暂不引入 UI e2e。
- 为后续 Playwright 预埋稳定选择器：
  - 关键控件 `data-testid` 命名保持稳定，不随样式重构改名。
  - 当前关键点包括（示例）：`model-picker-dialog`、`model-picker-item-*`、`endpoint-detail-panel`、`endpoint-detail-refresh`、`current-model-pill`。
- 满足以下条件后再引入 e2e：
  - ModelPickerDialog DOM 与关键 testid 稳定
  - `selectedModelKey` 写入与发送链路字段稳定
  - query contract 关键字段稳定

## 7. 阶段 3 验收步骤（收藏与最近使用）

### 7.1 离线自动回归（必跑）
1. 执行：`npm run test:model-picker:smoke`
2. 重点确认以下测试通过：
   - `infra/db/repo/modelPreferencesRepo.test.ts`
   - `src/next/modelPrefs/modelPrefsService.test.ts`
   - `src/ui-app/components/ChatAppComposer.modelPicker.test.ts`
3. 验收点：
   - favorites 去重与排序稳定
   - recents 去重与容量裁剪
   - 至少一个非 global scope 用例通过（证明 framework 可扩展）

### 7.2 手动 sanity（本地 UI）
1. 打开主界面，确保当前 scope 仍为 global（阶段 3 UI 不暴露 project/conversation 入口）。
2. 在 ModelPicker 中连续点击同一模型收藏两次（收藏 -> 取消 -> 收藏）。
3. 验收点：
   - FavoritesStrip 立即刷新
   - 重启后收藏状态保持
4. 发送消息至少 2 次（可切换不同模型发送）。
5. 验收点：
   - RecentsStrip 按最近使用时间更新
   - 同一模型不会产生重复条目（应更新为最新时间）

### 7.3 失败降级回归
1. 通过测试 mock 或开发调试手段模拟 `dbBridge` 不可用。
2. 验收点：
   - 收藏/最近列表降级为空，不崩溃
   - 模型选择与发送主路径仍可继续
3. 通过测试 mock 模拟写入异常（例如 reorder 事务中途失败）。
4. 验收点：
   - 原有排序保持不变（原子回滚）

## References
- OpenRouter Endpoints API: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints
- OpenRouter Models API: https://openrouter.ai/docs/api/api-reference/models/get-models
