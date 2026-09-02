# Goal：Model Facts UI 同步规划与 Owner 决策冻结

- **Lifecycle Status**: frozen planning; production implementation not authorized by this document
- **Document Role**: controlling Model Facts UI/product plan and post-Goal 2C Owner amendment
- **Last updated**: 2026-09-02
- **Authority**: Owner decisions in this document, current checkout UI audit, and documents 06/09/10/11 subject to the amendments recorded here

## 0. 摘要与停止边界

本 Goal 只完成 UI/产品规划和权威文档校正，不修改生产代码、数据库、IPC、Capability Rules 数据或 Goal 3 Resolver。

总原则：

> Cloud-managed Rules 与 User Rules 是唯一 Capability Rules source 内部的两种 ownership/lifecycle，不是两个独立 Model Facts sources。二者共享同构 Pack/Rule semantics，但具有不同 mutability、persistence 和 update lifecycle。

本文件冻结未来实现应遵守的 UI、产品生命周期、revision 与 identity 边界；它不是生产实现授权。Cloud distribution contract 仍是独立硬阻断，必须由 Owner 另行冻结。

## 1. 当前 UI 与架构审计结论

- Starverse 使用单一 `AppChatApp` workspace，没有 URL router。
- Settings 是 categorized modal：桌面为左侧一级导航，窄窗口退化为顶部横向滚动导航。
- 现有 Settings tabs 已支持方向键、Home/End、roving tabindex 和 ARIA tab semantics。
- Model Picker 已有搜索、虚拟列表、模型详情、Catalog stale/LKG 和 Raw Data 模式，但 Catalog 仍是 availability/display cache，不是 Model Facts authority。
- Composer、Generation Params 与 send preflight 已存在 capability projection 接点；本 Goal 只记录未来 Goal 3 迁移位置。
- Capability Rules 与 Canonical Source Facts 目前只有 main/DB 级接口，缺少 UI-safe 查询、分页、draft、Cloud distribution 和 Inspector IPC。
- 现有 bundled built-in Rules 与按请求执行的 query-bound regex 是 Goal 2C 当时的实现状态，已被本轮 Owner amendment 修改为待迁移旧路径。

新 UI 复用现有 Settings category、逐层列表、详情页、modal、status banner、虚拟列表和 i18n 体系。未来实施需补齐 focus trap、关闭后焦点恢复和新 tabs 的键盘/ARIA 行为。

## 2. Capability Rules 单源与同构 Pack/Rule 模型

Model Facts 仍然只有三套来源：

1. Provider Native；
2. models.dev；
3. Capability Rules。

Cloud-managed Rules 和 User Rules 共同组成第三套来源，不得拆成第四、第五套来源。

### 2.1 共享 Pack/Rule core

Cloud-managed 与 User ownership 共用同一 domain model：

- immutable stable Pack identity；
- immutable stable Rule identity；
- Pack `displayName` 必填；
- Rule label/displayName 可选；
- Pack priority；
- Rule priority；
- Rule configured state：`default | on | off`；
- Pack mode：`override | default_only | no_control`；
- Pack target：`enabled | disabled`；
- 完全相同的 effective activation semantics；
- 完全相同的 one-shot Rewrite child rules；
- 相同 selector/assertion representation；
- 相同 Pack → Rule hierarchy；
- 相同 canonical path 与 typed value/domain contract。

Cloud update metadata 不进入通用 Pack/Rule core；User draft/recovery metadata 也不进入通用 Pack/Rule core。不得为 Cloud 与 User 分别实现两套 Pack/Rule 语义。

### 2.2 Ownership 差异

User：

- Pack/Rule content 可编辑；
- 可创建、删除、跨 Pack 移动 Rule、Import/Replace；
- content 与 activation 全部进入 User Rules tab draft；
- 统一通过 batch Save 原子发布；
- 没有 remote update lifecycle。

Cloud-managed：

- Pack/Rule content 只读；
- 内容由指定 Cloud distribution source 更新；
- 本地 activation metadata 可编辑；
- activation adjustment 立即原子提交；
- remote update 通过 stable identity 保留本地 activation metadata。

### 2.3 Revision 收敛

Cloud 与 User 可以分别维护内部 revision，例如：

- Cloud content revision；
- Cloud activation revision；
- User committed content/activation revision；
- User draft/editing-session revision。

这些都不是独立 Model Facts source revisions。

Capability Rules canonical publisher 必须将当前已应用 Cloud Rules、当前已提交 User Rules、activation、priority 和 Rule materialization 结果共同发布为唯一 Capability Rules canonical source snapshot/revision。

冻结规则：

- Cloud candidate 尚未 Apply：不改变 Capability Rules canonical source。
- User draft 尚未 Save：不改变 Capability Rules canonical source。
- Cloud activation 成功提交：若改变有效 claims，重新发布 Capability Rules canonical source。
- Cloud update Apply：重新发布 Capability Rules canonical source。
- User batch Save：重新发布 Capability Rules canonical source。
- 任何改变 emitted claims、正式 claim metadata、priority 或 effective activation 的变化，都必须产生新的 Capability Rules canonical source revision。
- Inspector、Goal 3 与运行时只看到一个 Capability Rules source；claim 可携带 Cloud/User ownership provenance，但 ownership 不创建新 source。

## 3. Activation 精确语义

### 3.1 Cloud Rules default activation policy

Cloud Rules default activation policy 可配置，初始为 `enabled`。它只控制 Cloud-managed Rules，不控制 User Rules。

当 Pack mode 为 `no_control`：

- configured=`on` → enabled；
- configured=`off` → disabled；
- configured=`default` → 继承 Cloud Rules default activation policy。

Pack modes：

- `override`：当前 Pack target 覆盖所有子 Rule 的 effective state；
- `default_only`：Pack target 只控制 configured=`default` 的子 Rule，显式 on/off 保持；
- `no_control`：Pack 不参与子 Rule activation。

User Rules 使用同一 activation model。User ownership 的 default state 由相同 core contract 表达，但不得误读为继承 Cloud Rules default activation policy；未来实现必须把 User 自己的配置输入或创建默认值与 Cloud default policy 分开。

### 3.2 Rewrite child rules

Rewrite 是一次性 mutation，不是持续 policy：

- Pack target=`enabled` 时写入 configured=`on`；
- Pack target=`disabled` 时写入 configured=`off`；
- `override`：覆写执行时全部现有子 Rules；
- `default_only`：只覆写执行时 configured=`default` 的子 Rules，已显式 on/off 的 Rule 保持不变；
- `no_control`：Rewrite 不可用；
- 未来新增 Rule 不受历史 Rewrite 影响；
- Rewrite 不修改 Pack mode 或 Pack target。

Cloud 执行 Rewrite：

- 显示受影响数量；
- 输入由 i18n resource 提供的 confirmation phrase；
- 确认后立即原子提交；
- 随后按需重新发布唯一 Capability Rules canonical source。

User 执行 Rewrite：

- 使用完全相同的选择和 mutation 语义；
- 结果只进入 User Rules tab draft；
- 最终随 `Save changes` 批量原子提交；
- 不得因为提交生命周期不同而复制另一套 Rewrite 实现。

## 4. Authoritative exact-subject set 与 Rule materialization

### 4.1 模型身份来源

原生供应商的 authoritative exact model set 只来自官方/native `models.list` 或等价官方模型目录接口。

Third-party/compatible provider 的 authoritative exact model set 可以来自：

- provider-native model-list；
- 用户配置的 custom model-list acquisition/parsing；
- 用户手工添加的 exact native model IDs。

以下信息不得创建 model subject：

- models.dev；
- Cloud/User exact selector；
- regex selector；
- regex positive/negative examples；
- Catalog alias；
- display name；
- compatibility alias。

Manual/custom identity 属于 Provider/Model Catalog 的正式模型枚举能力，不属于 Capability Rules，也不等同于普通 availability。

### 4.2 Regex materialization

- exact/regex Rule 可提前存在，但在对应 subject 尚未进入 authoritative exact-subject set 时保持 dormant。
- Rule definition source refresh、Rule 变更或 authoritative exact-subject-set revision 变化时，重新物化受影响 Rules。
- Materialization 输出只能是 `exact subject → canonical typed Rule claims`。
- Regex 不进入 Canonical Source Facts。
- 不在每次 model request、send preflight 或 Goal 3 resolution 中执行 regex。
- Capability Rules source revision 必须绑定用于本轮 materialization 的 authoritative-subject-set revision。
- Adapter 不选 winner、不合并 Rule claims。

Facts Inspector 只显示 authoritative subjects。models.dev-only、Rules-only exact IDs 不显示，也不提供额外 Raw Source 浏览器。

## 5. Settings 信息架构

新增一级分类：

- `模型与能力 / Models & Capabilities`

内容区直接使用三个并排的二级横向 tabs：

- `云端托管规则 / Cloud-managed Rules`
- `用户规则 / User Rules`
- `事实检查器 / Facts Inspector`

不得增加 Rules → Cloud/User 的第三层 tab。

Cloud/User Rules 内部均使用：

```text
Pack list → Rule list → Rule detail/editor
```

通过 breadcrumb/back 返回；不使用 Pack accordion、常驻左右分栏或拖拽排序。窄窗口复用现有 Settings responsive horizontal navigation，不创建新导航系统。

## 6. Cloud-managed Rules UI

### 6.1 列表与详情

默认摘要行显示：

- Pack displayName 或 Rule label/自动摘要；
- selector 摘要；
- canonical semantic path；
- configured/effective activation；
- priority；
- update、invalid、dormant 等状态徽标。

完整 assertion、domain、revision、evidence、provenance 和 stable ID 进入详情。

无 Rule label 时，自动摘要使用：

```text
selector 的最短可识别部分 · canonical assertion path
```

自动摘要只用于显示，不进入 identity。

### 6.2 Activation

Cloud content 只读；activation 控件立即原子提交。

Pack/Rule activation UI 必须展示：

- configured state；
- effective state；
- effective state 的来源：explicit Rule、Pack override/default_only 或 Cloud Rules default activation policy；
- Pack mode；
- Pack target；
- Rewrite 可影响数量。

### 6.3 Distribution/update

Starverse 不随应用捆绑任何永久 built-in Rules。首次启动只从 Owner 指定的 Cloud distribution source 获取候选；若网络/校验失败且本地从未有成功 snapshot，Cloud-managed Rules 保持为空，不生成临时 Pack 或 fallback。成功应用的 remote snapshot 按 version/revision/digest 持久化为 LKG，后续 refresh 失败不得清空该 LKG。

默认策略：

- autoCheck enabled；
- checkInterval 24h；
- 无有效 snapshot 时，首次 fetch+parse+validation 成功后直接建立初始 snapshot；
- 后续 updateBehavior 默认为 `notify_only`。

操作严格分离：

- `Check for updates`；
- `View changes`；
- `Apply update`。

Candidate diff 使用独立 unified/line-oriented Diff 窗口：

- 对当前已应用 snapshot 与已验证 candidate 做 deterministic canonical serialization；
- Pack/Rule 按 stable identity 排序；
- object key 固定；
- array 是否排序遵循字段自身语义；
- 不添加重要性、winner 或 conflict 解释。

查看 Diff 不是 Apply 前置条件。

手动 Apply 使用普通确认 modal，显示当前与候选 version、digest、Pack/Rule 数量变化以及 activation preservation/cleanup 影响。

Apply 原子切换 snapshot，并按 stable Rule identity：

- 保留未变化 Rule 的本地 activation；
- 删除远端已删除 Rule 的 activation；
- 新 Rule 初始化为 configured=`default`。

## 7. User Rules UI

### 7.1 Draft transaction

整个 User Rules tab 是独立 draft transaction boundary，不复用 Settings 底部全局 Save。

- 打开时记录 base Rules revision；
- 可连续新增、编辑、跨 Pack 移动 Rule、删除多个 Pack/Rule；
- 层级切换不保存；
- sticky action bar 显示 dirty state、`Save changes`、`Cancel changes`；
- draft debounce 持久化为 crash-recoverable working copy；
- 编辑期间不修改正式 Rules。

Save 在一个数据库事务中：

1. 校验 base revision；
2. 验证整个 draft；
3. 写入全部 Pack/Rule content 与 activation；
4. 发布一次新的唯一 Capability Rules canonical source revision；
5. 删除 persisted draft/editing session；
6. 全部成功才 commit。

Cancel 删除 draft，正式 Rules 不变。

崩溃后自动恢复 persisted draft，提示“已恢复上次未保存的更改”，并提供 `Discard recovered changes`。

不实现 permanent lock、WAL 产品契约、three-way merge、partial save 或 multi-writer merge。

### 7.2 Pack 生命周期

- 数据模型始终是普通显式 Pack → Rule。
- 用户没有任何 Pack 时，首次创建 Rule 自动创建普通 User Pack。
- 自动创建 Pack 没有特殊 ID、隐藏标志或永久生命周期。
- 它可重命名、删除、启停、设置 priority、Rewrite、Import/Replace、Export。
- 删除全部 Pack 后不立即重建；下一次创建 Rule 时再次自动创建。

### 7.3 Priority 与排序

Pack/Rule priority：

- 显式有界整数；
- 默认 0；
- 用户直接输入数值；
- 相同数值表示平级。

UI 排序：

1. priority 从高到低；
2. lastModifiedAt 降序；
3. stable identity deterministic tie-breaker。

lastModifiedAt 只用于显示排序，不参与 Rule winner/conflict。禁止拖拽排序和隐含 priority。

### 7.4 Rule editor

- 只允许 direct canonical assertions；
- 不开放 derived authoring；
- 已合法存在的 derived claims 只在 Inspector 中只读展示；
- semantic path 从 versioned ontology registry 搜索选择；
- typed editor 由 path 的 canonical type/domain 机械生成；
- 不提供 arbitrary JSON；
- `missing/unknown` 不是用户可写 assertion；
- `unsupported` 只能作为明确 support 事实；
- exact selector 可包含多个 native model IDs；
- regex 必须完整锚定并满足正反例 guardrails。

Exact selector 编辑：

- 用户先选择 provider authority/endpoint profile；
- native model ID 始终允许自由输入；
- 当前 authoritative exact subjects 只作为输入候选，不是白名单或 existence validation；
- 不在候选列表中不阻止保存；
- 不查询模型真实性；
- 不创建 availability、unknown 或 unsupported。

User Rule 只提供可选 Note：

- 可记录来源、实测、URL 或说明；
- 不参与 validity、matching、priority 或 conflict；
- 不自动解析为 structured evidence；
- 空 Note 不警告；
- createdAt/updatedAt 只是对象元数据，不是 evidence verification。

### 7.5 删除

单 Rule 删除：

- 不弹 modal；
- 点击“删除”后原位置切换为“取消”，相邻位置显示“确认删除”；
- 双击原位置第二次执行取消而非确认；
- Esc、切换 Rule 或离开区域取消待确认；
- 删除只修改 draft。

Pack 删除：

- 使用普通 modal；
- 显示 Pack displayName、Rule 数量和影响；
- 确认后删除 Pack 及全部 Rules，但只修改 draft。

User Rewrite 使用共享 Rewrite core，只修改 draft，不要求 Cloud 的 confirmation phrase，最终随 batch Save 提交。

### 7.6 Import/Export

使用版本化 Starverse Rule Pack 格式。

Export：

- 只导出最后一次成功保存的正式 Pack；
- User Rules tab 任何位置 dirty 时禁用 Export，并提示先 Save 或 Cancel；
- 导出 stable IDs、displayName/label、selector/assertion、priority、activation 和可选 Note；
- 不导出 DB revision、LKG、source snapshot、runtime diagnostics、draft 或 editing session。

Import：

- 完整解析和 schema/version 校验；
- 失败不得修改 draft；
- 成功后先显示内容与 identity collision；
- 新 Pack identity：整包加入 draft；
- 已存在同 Pack identity：明确执行 whole-pack replacement；
- 显示当前/导入后 Rule 数量并确认；
- 不保留导入包未包含的旧 Rules；
- 不做 copy、ID 重建、自动 merge、逐 Rule merge 或部分替换；
- 与目标 Pack 外对象发生不可解释 collision 时阻止导入；
- 确认后仍只修改 draft，最终由 Save 原子提交。

## 8. Facts Inspector

### 8.1 Subject 入口

两个正式入口汇聚到同一 Inspector：

1. standalone authoritative-subject search；
2. Model Picker/Model details 的 `Inspect Model Facts` deep-link。

不提供手工 authority/profile/model 三元组表单。

Deep-link 直接携带已经解析的 exact subject identity，不能：

- 用 display name/alias 重新识别；
- 模糊匹配；
- 建立 Model Picker 专用 Inspector；
- 依赖 Inspector 搜索再次猜测身份。

Subject selector 按 exact identity 去重，不按 source 重复显示。

### 8.2 Presentation levels

Inspector 使用 Overview、Fields、Evidence 三层。

Overview：

- 按 Reasoning、Limits、Modalities、Tools、File/Image 等注册 canonical groups 组织；
- 每组展示 Provider Native、models.dev、Capability Rules 三源；
- Capability Rules 只有一列，内部 claim 可标记 Cloud/User ownership；
- 显示 coverage、主要状态、freshness/LKG 和 `Values differ`；
- 不复制全部字段值；
- 点击 group 定位 Fields；
- 点击 source 过滤/突出该 source；
- 点击 difference 定位实际不同字段；
- Goal 3 前不推导 conflict、winner 或 resolved value。

Fields：

- canonical field × source 精确视图；
- 每条 Rule claim 独立展示；
- 保持 no coverage、missing、invalid、unsupported、source absence、LKG 的语义区别；
- source 无 subject/claim 时显示真实 absence，不合成 missing/unknown/unsupported；
- `Values differ` 只做相同 canonical type/value digest 的机械比较。

Evidence：

- 默认展示当前 fact 引用的 source record/field slice；
- 展示 source field refs、digest、source revision、subject-fact revision、adapter/mapping revision、claim ownership 和 LKG disposition；
- 无法可靠定位 slice 时明确说明；
- `View full sanitized payload` 显式打开独立 JSON viewer；
- 完整 payload 按需读取，支持 search/copy 和大文本 virtualization；
- 两级视图引用同一 persisted sanitized evidence；
- 不重新联网，不生成近似 raw。

Matched Rules：

- Rule 详情显示该 Rule 命中的 authoritative exact subjects；
- Inspector 显示命中当前 subject 的全部 Cloud/User claims；
- 两处都不选 winner。

Goal 3 后只在同一 Inspector 增加 Resolved Facts layer，不新建第二套 Inspector。

## 9. Main/Renderer API 与 revision 安全

未来实施新增 UI-safe main-process services/IPC；renderer 不得直接访问 DB 或解释 raw source。

Read contracts 至少包括：

- authoritative subject 分页搜索；
- exact subject Inspector snapshot；
- capability-group overview；
- canonical field × source rows；
- matched Rule claims；
- evidence slice；
- full sanitized payload lazy read；
- source status、freshness、candidate 和 attention severity。

Rule contracts 至少包括：

- Cloud/User Pack/Rule 分页、搜索、详情；
- Cloud immediate activation mutation；
- Cloud check、candidate diff、Apply；
- User durable draft open/replace/validate/commit/discard/recover；
- Import preview；
- committed Pack Export；
- per-source refresh-policy read/save。

Revision 规则：

- renderer cache 只能是带 revision 的非权威 projection；
- stale response 不能覆盖新状态；
- Cloud activation 立即提交；
- User content 与 activation 只随 tab batch Save 发布；
- source refresh policy 使用单 Source 显式 Save，不使用字段 autosave 或 Settings 全局 Save；
- refresh-policy Save 必须携带 expected policy revision，stale write 失败并刷新当前 read model；
- subject search 绑定 authoritative-subject-set revision；
- Inspector snapshot 绑定全部 source/subject-fact refs；
- raw viewer 只接受 persisted raw ref。

## 10. Refresh 与通知

通用调度：

```text
nextDueAt = lastSuccessfulCheckAt + checkInterval
```

唤醒仅来自：

- application startup；
- nearest nextDueAt timer；
- system/app resume；
- refresh policy changed。

不因页面打开或网络恢复自动查询，不补跑错过的 intervals。

默认策略：

- Cloud：autoCheck enabled、24h、bootstrap 自动建立、后续 notify_only；
- models.dev：autoCheck enabled、24h、bootstrap 自动建立、后续 auto_update；
- Provider Native：复用现有 per-provider Catalog/native sync policy。

成功无变化只更新 freshness；失败不推进 lastSuccessfulCheckAt 并保留 LKG；Check/Apply、cadence、backoff 和状态按 source scope 隔离。

通知：

- notify-only candidate 在一级分类和对应 tab 显示 badge；
- 每个新 candidate revision 只弹一次可关闭的应用内提示；
- 关闭提示后 badge 保留；
- 普通后台失败不弹提示，只显示 warning/LKG；
- 无有效 LKG、source facts 不可用或主进程判定严重陈旧时才弹一次应用内警告；
- 不发送 OS notification；
- renderer 不自行推导严重阈值。

## 11. Cloud distribution contract 硬阻断

生产实现 Cloud-managed Rules 前，Owner 必须另行冻结：

- repository authority；
- ref、release 或 channel authority；
- manifest format；
- version/revision identity；
- digest/integrity verification；
- candidate acquisition rules；
- redirect、retention 与 rollback 边界。

实施 Agent 不得自行选择 branch、release、manifest 或完整性策略。该事项不阻止本 UI planning Goal 冻结，但阻止 Cloud distribution 生产实现。

## 12. 未来实施顺序

1. 冻结 Cloud distribution contract。
2. 迁移到同构 Pack/Rule core 与唯一 Capability Rules source。
3. 建立 authoritative model set 和 revision-bound regex materialization。
4. 增加 UI-safe services、IPC 和 renderer clients。
5. 实现 Settings 分类、Cloud/User Rules 和 refresh status。
6. 实现 User durable draft 及 Import/Export。
7. 实现 Facts Inspector 及 Model Picker deep-link。
8. Goal 3 后再接 Resolved Facts 与正常消费者。

## 13. 未来聚焦验收

- Pack/Rule 共享 activation truth table；
- Cloud immediate mutation 与 User draft mutation 生命周期差异；
- Rewrite override/default_only/no_control 及未来 Rule 不受历史 Rewrite 影响；
- Cloud/User 内部 revision 最终收敛为单一 Capability Rules source revision；
- durable draft crash recovery、Cancel、atomic Save 和无 partial commit；
- priority 降序与 deterministic tie-break；
- exact 自由输入、候选非白名单、dormant Rule；
- regex 只在 revision rebuild 时物化，runtime 无 regex；
- Import whole-pack replacement 和 dirty Export 禁用；
- authoritative subject search 与 deep-link identity 一致；
- Overview 导航与 `Values differ` 无 conflict；
- missing/no-coverage/source absence/unsupported/invalid/LKG 分离；
- evidence slice/full raw lazy load；
- source scheduler、notify-only/auto-update/LKG；
- zh-CN/en-US parity、ARIA、键盘与焦点恢复；
- 静态门禁：renderer 无 DB/raw 解析、无 source priority/winner、Cloud/User 未拆成两个 Model Facts sources。

## 14. 本 Goal 验证与明确延期

本 planning Goal 只运行：

- `doc_consistency`；
- `npm run gate:docs`；
- `git diff --check`。

明确延期：

- Goal 3 merge/priority/winner/conflict/final capabilityRevision；
- derived authoring；
- Pack copy/merge 与逐 Rule Import；
- models.dev/Rules-only subject inspection；
- 手工三元组 Inspector 入口；
- OS notification；
- 正常 Model Picker/Composer/Preflight/Runtime/Compiler consumer 迁移；
- Cloud distribution contract，等待 Owner 另行冻结。

## 15. 冻结结论

本文件冻结一个 Rule/Pack 语义模型及两种 ownership lifecycle：

```text
同一个 Rule/Pack 语义模型
        │
        ├── User ownership
        │      editable + draft + batch Save
        │
        └── Cloud ownership
               read-only content
               + immediate local activation
               + remote update lifecycle
```

无论 ownership 如何，最终都只能向唯一 Capability Rules canonical source publisher 提交 materialized exact-subject claims。UI、缓存、draft、候选更新和内部 revision 不得扩张三来源架构，也不得提前实现 Goal 3 的 winner/conflict/resolved authority。
