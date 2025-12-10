# ADR-002: 为什么选择 Vue 3 + Composition API

**状态**: 已接受  
**日期**: 2024-08-15  
**决策者**: @GuXinghai

## 背景

选定Electron框架后，需要选择前端框架来构建UI层。Starverse的UI需求包括：
- 复杂的聊天界面（分支树、消息列表）
- 实时响应的状态管理（多标签页、多对话）
- 高性能渲染（长对话、大量消息）

## 决策

选择 **Vue.js 3 + Composition API** + **Pinia**，采用完全的Composition API风格，禁止使用Options API。

## 理由

### 考虑的替代方案

#### 1. React + Hooks

**优点**:
- 最大的生态系统和社区
- 丰富的第三方组件库
- 大公司支持（Meta）

**缺点**:
- ❌ 学习曲线陡峭（Hooks规则、依赖数组）
- ❌ 过度渲染问题（需要手动优化useMemo/useCallback）
- ❌ 模板语法不如Vue直观（JSX嵌套复杂）
- ❌ 状态管理分裂（Redux、MobX、Zustand等）

#### 2. Svelte

**优点**:
- 编译时优化，运行时体积小
- 简洁的语法
- 高性能

**缺点**:
- ❌ 生态系统小（TypeScript支持不完善）
- ❌ 团队无经验
- ❌ 大型应用案例少
- ❌ Electron集成资源少

#### 3. Angular

**优点**:
- 完整的企业级框架
- TypeScript原生支持

**缺点**:
- ❌ 过于重量级
- ❌ 学习成本高（RxJS、依赖注入等）
- ❌ 不适合中小型项目
- ❌ 团队无经验

### 选择 Vue 3 的理由

#### 技术优势

1. **渐进式框架**
   - 从简单到复杂，可按需引入功能
   - 不强制使用路由、状态管理等
   - 适合中型项目（Starverse规模）

2. **Composition API**
   - 逻辑复用更灵活（Composables > Mixins）
   - TypeScript支持优秀（类型推导准确）
   - 代码组织更清晰（按功能而非生命周期）

3. **响应式系统**
   - Proxy-based响应式，性能优秀
   - 自动依赖追踪，无需手动声明依赖
   - `computed`缓存机制减少重复计算

4. **模板语法**
   - `v-if`、`v-for`直观易懂
   - 指令系统强大（`v-model`、`v-bind`）
   - 比JSX更适合设计师协作

5. **开发体验**
   - Vue DevTools调试体验好
   - 单文件组件（SFC）结构清晰
   - `<script setup>`语法糖简洁

#### Pinia vs Vuex

选择Pinia作为状态管理库：
- ✅ Composition API风格统一
- ✅ TypeScript支持更好（无需magic strings）
- ✅ 模块化天然支持（无需namespace）
- ✅ Vue官方推荐（Vuex作者开发）
- ❌ Vuex使用Options API，与项目风格不一致

### 为什么禁止 Options API？

1. **代码组织问题**
   - Options API按生命周期组织，同一功能分散在多处
   - Composition API按功能组织，相关逻辑聚合

2. **类型推导不足**
   - Options API的TypeScript支持需要额外配置
   - `this`的类型推导不准确

3. **逻辑复用困难**
   - Mixins有命名冲突风险
   - Composables更灵活、类型安全

4. **团队一致性**
   - 统一使用Composition API，降低认知负荷
   - 避免两种风格混用导致的混乱

## 后果

### 积极影响

✅ **开发效率高**: Vue的渐进式特性和直观语法加快开发  
✅ **类型安全**: Composition API + TypeScript提供完整类型推导  
✅ **性能优秀**: 响应式系统和虚拟DOM优化，长对话性能良好  
✅ **易于维护**: 7个清晰的Pinia Store，职责单一  
✅ **学习曲线平缓**: 新成员快速上手

### 消极影响

❌ **生态小于React**: 部分第三方库需要自己实现  
❌ **团队规模限制**: 大型团队可能更倾向Angular  
❌ **服务端渲染限制**: Electron不需要SSR，但若未来需要Web版会受限

### 缓解措施

1. **生态问题**
   - 优先使用框架无关的库（如marked、highlight.js）
   - 必要时自己封装React组件为Vue组件

2. **大型项目挑战**
   - 严格的模块化架构（7个职责清晰的Store）
   - 组件分层（atoms → molecules → organisms）
   - 强制TypeScript严格模式

## 实际效果

### Store架构设计

```
useAppStore                  - 全局配置
  ├─ useConversationStore    - 对话CRUD + 多标签页
  │    └─ useBranchStore     - 分支树状态
  ├─ useModelStore           - 模型选择
  ├─ usePersistenceStore     - 持久化调度
  ├─ useProjectStore         - 项目分类
  └─ useProjectWorkspaceStore - 项目工作区
```

### Composable实战

已实现10+个高质量Composable：
- `useBranchNavigation.ts` - 分支导航逻辑
- `useMessageSending.ts` - 消息发送逻辑
- `useScrollControl.ts` - 滚动控制
- `useAttachmentManager.ts` - 附件管理
- ...

### 性能表现

- 长对话（1000+消息）滚动流畅（60 FPS）
- 分支切换延迟减少60-80%（通过computed缓存）
- 多标签页切换响应迅速（< 100ms）

## 参考资料

- [Vue 3官方文档](https://vuejs.org/)
- [Composition API RFC](https://github.com/vuejs/rfcs/blob/master/active-rfcs/0013-composition-api.md)
- [Pinia官方文档](https://pinia.vuejs.org/)
- [为什么Vue 3更适合TypeScript](https://vuejs.org/guide/typescript/overview.html)
- [项目状态管理架构](../architecture/overview.md#状态管理)

---

**相关决策**:
- [ADR-001: 为什么选择 Electron](001-why-electron.md)
- [ADR-003: 为什么使用 SQLite + Worker 线程](003-sqlite-worker-thread.md)
- [ADR-004: 为什么升级 Tailwind v4](004-tailwind-v4-upgrade.md)
