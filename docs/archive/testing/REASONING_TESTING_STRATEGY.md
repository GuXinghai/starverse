# Starverse · OpenRouter Reasoning 测试清单与风险评估

本文档提供完整的测试策略、风险点与缓解措施，确保推理标准化重构的稳定性与正确性。

## 一、测试分层策略

### 1.1 测试金字塔

```
        ┌──────────────────┐
        │  E2E 测试 (5%)   │  用户完整流程
        ├──────────────────┤
        │ 集成测试 (15%)   │  组件 + Store + Adapter
        ├──────────────────┤
        │ 单元测试 (80%)   │  纯函数 + 适配器逻辑
        └──────────────────┘
```

**原则**：
- 单元测试覆盖核心逻辑（适配器、能力推断、类型转换）
- 集成测试验证组件交互与状态管理
- E2E 测试覆盖关键用户路径（模型切换、档位调整、发送消息）

## 二、单元测试清单（Vitest）

### 2.1 适配器核心逻辑测试

**文件**：`tests/unit/services/openrouterReasoningAdapter.spec.ts`

#### Test Suite 1: buildReasoningPayload - Class A (Anthropic)

```ts
describe('buildReasoningPayload - Class A (Anthropic)', () => {
  const anthropicCapability: ModelReasoningCapability = {
    modelId: 'anthropic/claude-3.7-sonnet',
    supportsReasoningParam: true,
    supportsIncludeReasoning: true,
    supportsMaxReasoningTokens: true,
    returnsVisibleReasoning: 'yes',
    maxCompletionTokens: 8192,
    internalReasoningPrice: 0.000002,
    family: 'anthropic',
    reasoningClass: 'A',
    maxTokensPolicy: 'anthropic-1024-32000'
  }
  
  it('应裁剪 maxReasoningTokens 到 [1024, 32000]', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'max_tokens',
      maxReasoningTokens: 40000, // 超出上限
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('anthropic/claude-3.7-sonnet', anthropicCapability, config)
    
    expect(result.payload.reasoning?.max_tokens).toBe(32000)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'clipped',
        message: expect.stringContaining('裁剪到 [1024, 32000]')
      })
    )
  })
  
  it('应裁剪 maxReasoningTokens 到下限 1024', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'max_tokens',
      maxReasoningTokens: 512, // 低于下限
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('anthropic/claude-3.7-sonnet', anthropicCapability, config)
    
    expect(result.payload.reasoning?.max_tokens).toBe(1024)
  })
  
  it('应确保 max_tokens > reasoning.max_tokens', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'max_tokens',
      maxReasoningTokens: 8000,
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('anthropic/claude-3.7-sonnet', anthropicCapability, config)
    
    expect(result.payload.max_tokens).toBeGreaterThan(8000)
  })
  
  it('effort 模式下不应设置 reasoning.max_tokens', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'effort',
      effort: 'high',
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('anthropic/claude-3.7-sonnet', anthropicCapability, config)
    
    expect(result.payload.reasoning?.effort).toBe('high')
    expect(result.payload.reasoning?.max_tokens).toBeUndefined()
  })
})
```

#### Test Suite 2: buildReasoningPayload - Class B (OpenAI o-series)

```ts
describe('buildReasoningPayload - Class B (OpenAI o-series)', () => {
  const openaiCapability: ModelReasoningCapability = {
    modelId: 'openai/o1-preview',
    supportsReasoningParam: true,
    supportsIncludeReasoning: false,
    supportsMaxReasoningTokens: true, // 作为 hint
    returnsVisibleReasoning: 'no',
    maxCompletionTokens: 32768,
    internalReasoningPrice: null,
    family: 'openai',
    reasoningClass: 'B',
    maxTokensPolicy: 'effort-only'
  }
  
  it('max_tokens 模式应作为 hint 转发（不裁剪到 Anthropic 范围）', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'max_tokens',
      maxReasoningTokens: 16000, // 超出 Anthropic 上限，但不应裁剪
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('openai/o1-preview', openaiCapability, config)
    
    expect(result.payload.reasoning?.max_tokens).toBe(16000)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'auto-adjusted',
        message: expect.stringContaining('作为推理强度提示')
      })
    )
  })
  
  it('max_tokens 超过 provider cap 时应裁剪', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'max_tokens',
      maxReasoningTokens: 40000, // 超过 32768
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('openai/o1-preview', openaiCapability, config)
    
    expect(result.payload.reasoning?.max_tokens).toBe(32768)
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'clipped',
        message: expect.stringContaining('模型上限')
      })
    )
  })
  
  it('effort 模式应正常工作', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'effort',
      effort: 'medium',
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('openai/o1-preview', openaiCapability, config)
    
    expect(result.payload.reasoning?.effort).toBe('medium')
    expect(result.payload.reasoning?.max_tokens).toBeUndefined()
  })
})
```

#### Test Suite 3: buildReasoningPayload - Class C (不支持推理)

```ts
describe('buildReasoningPayload - Class C (不支持推理)', () => {
  const basicCapability: ModelReasoningCapability = {
    modelId: 'meta-llama/llama-3-8b',
    supportsReasoningParam: false,
    supportsIncludeReasoning: false,
    supportsMaxReasoningTokens: false,
    returnsVisibleReasoning: 'no',
    maxCompletionTokens: 8192,
    internalReasoningPrice: null,
    family: 'other',
    reasoningClass: 'C',
    maxTokensPolicy: 'effort-only'
  }
  
  it('应返回空 payload', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'effort',
      effort: 'high',
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('meta-llama/llama-3-8b', basicCapability, config)
    
    expect(result.payload).toEqual({})
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'unsupported',
        message: expect.stringContaining('不支持显式 reasoning 参数')
      })
    )
  })
})
```

#### Test Suite 4: 可见性控制

```ts
describe('buildReasoningPayload - 可见性控制', () => {
  it('showReasoningContent=true 应设置 exclude=false', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'effort',
      effort: 'medium',
      showReasoningContent: true
    }
    
    const result = buildReasoningPayload('anthropic/claude-3.7-sonnet', anthropicCapability, config)
    
    expect(result.payload.reasoning?.exclude).toBe(false)
  })
  
  it('showReasoningContent=false 应设置 exclude=true', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'effort',
      effort: 'medium',
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('anthropic/claude-3.7-sonnet', anthropicCapability, config)
    
    expect(result.payload.reasoning?.exclude).toBe(true)
  })
  
  it('支持 include_reasoning 的模型应设置兼容字段', () => {
    const capabilityWithInclude = { ...anthropicCapability, supportsIncludeReasoning: true }
    const config: ReasoningResolvedConfig = {
      controlMode: 'effort',
      effort: 'medium',
      showReasoningContent: true
    }
    
    const result = buildReasoningPayload('anthropic/claude-3.7-sonnet', capabilityWithInclude, config)
    
    expect(result.payload.include_reasoning).toBe(true)
  })
})
```

#### Test Suite 5: disabled 模式

```ts
describe('buildReasoningPayload - disabled 模式', () => {
  it('应设置 effort=none', () => {
    const config: ReasoningResolvedConfig = {
      controlMode: 'disabled',
      showReasoningContent: false
    }
    
    const result = buildReasoningPayload('anthropic/claude-3.7-sonnet', anthropicCapability, config)
    
    expect(result.payload.reasoning?.effort).toBe('none')
  })
})
```

### 2.2 能力推断辅助函数测试

**文件**：`tests/unit/utils/reasoningHelpers.spec.ts`

```ts
describe('reasoningHelpers', () => {
  describe('inferMaxTokensSupport', () => {
    it('应识别 Anthropic reasoning 模型', () => {
      const modelData = { id: 'anthropic/claude-3.7-sonnet-reasoning' }
      expect(inferMaxTokensSupport(modelData)).toBe(true)
    })
    
    it('应识别 Gemini thinking 模型', () => {
      const modelData = { id: 'google/gemini-2.5-flash-thinking' }
      expect(inferMaxTokensSupport(modelData)).toBe(true)
    })
    
    it('应识别 OpenAI o-series（作为 hint）', () => {
      const modelData = { id: 'openai/o1-preview' }
      expect(inferMaxTokensSupport(modelData)).toBe(true)
    })
    
    it('应拒绝不支持的模型', () => {
      const modelData = { id: 'meta-llama/llama-3-8b' }
      expect(inferMaxTokensSupport(modelData)).toBe(false)
    })
  })
  
  describe('inferVisibleReasoning', () => {
    it('应识别不返回的模型 (Gemini Flash Thinking)', () => {
      const modelData = { id: 'google/gemini-flash-thinking' }
      expect(inferVisibleReasoning(modelData)).toBe('no')
    })
    
    it('应识别返回的模型 (Anthropic reasoning)', () => {
      const modelData = { id: 'anthropic/claude-3.7-sonnet-reasoning' }
      expect(inferVisibleReasoning(modelData)).toBe('yes')
    })
    
    it('应默认返回 unknown', () => {
      const modelData = { id: 'unknown/model-123' }
      expect(inferVisibleReasoning(modelData)).toBe('unknown')
    })
  })
  
  describe('inferMaxTokensPolicy', () => {
    it('应识别 Anthropic 策略', () => {
      const modelData = { id: 'anthropic/claude-3.7-sonnet-reasoning' }
      expect(inferMaxTokensPolicy(modelData)).toBe('anthropic-1024-32000')
    })
    
    it('应识别 Gemini/Qwen 策略', () => {
      const modelData = { id: 'google/gemini-2.5-flash-thinking' }
      expect(inferMaxTokensPolicy(modelData)).toBe('provider-unknown-range')
    })
    
    it('应识别 OpenAI/Grok 策略', () => {
      const modelData = { id: 'openai/o1-preview' }
      expect(inferMaxTokensPolicy(modelData)).toBe('effort-only')
    })
  })
})
```

## 三、集成测试清单

### 3.1 组件集成测试

**文件**：`tests/integration/components/ReasoningControls.spec.ts`

```ts
describe('ReasoningControls.vue - 集成测试', () => {
  it('Class C 模型应禁用所有控件', async () => {
    const capability: ModelReasoningCapability = {
      modelId: 'llama-3-8b',
      supportsReasoningParam: false,
      // ... 其他字段
      reasoningClass: 'C'
    }
    
    const wrapper = mount(ReasoningControls, {
      props: {
        modelReasoningCapability: capability,
        isActive: true
      }
    })
    
    // 验证推理开关禁用
    const toggleButton = wrapper.find('[data-testid="reasoning-toggle"]')
    expect(toggleButton.attributes('disabled')).toBeDefined()
    
    // 验证提示信息
    expect(wrapper.text()).toContain('当前模型不支持显式 reasoning 参数')
  })
  
  it('Class B 模型应隐藏 max_tokens 输入', async () => {
    const capability: ModelReasoningCapability = {
      modelId: 'openai/o1-preview',
      supportsReasoningParam: true,
      supportsMaxReasoningTokens: true, // 但 maxTokensPolicy = 'effort-only'
      reasoningClass: 'B',
      maxTokensPolicy: 'effort-only'
    }
    
    const wrapper = mount(ReasoningControls, {
      props: {
        modelReasoningCapability: capability,
        isActive: true
      }
    })
    
    // 验证自定义预算输入不可见
    const maxTokensInput = wrapper.find('[data-testid="max-tokens-input"]')
    expect(maxTokensInput.exists()).toBe(false)
  })
  
  it('Class A 模型应显示自定义预算输入', async () => {
    const capability: ModelReasoningCapability = {
      modelId: 'anthropic/claude-3.7-sonnet',
      supportsMaxReasoningTokens: true,
      reasoningClass: 'A',
      maxTokensPolicy: 'anthropic-1024-32000'
    }
    
    const wrapper = mount(ReasoningControls, {
      props: {
        modelReasoningCapability: capability,
        isActive: true
      }
    })
    
    // 验证自定义预算输入可见
    const maxTokensInput = wrapper.find('[data-testid="max-tokens-input"]')
    expect(maxTokensInput.exists()).toBe(true)
  })
  
  it('returnsVisibleReasoning=no 应显示警告', async () => {
    const capability: ModelReasoningCapability = {
      modelId: 'openai/o1-preview',
      supportsReasoningParam: true,
      returnsVisibleReasoning: 'no',
      reasoningClass: 'B'
    }
    
    const wrapper = mount(ReasoningControls, {
      props: {
        modelReasoningCapability: capability,
        isActive: true
      }
    })
    
    expect(wrapper.text()).toContain('该模型不会返回可见的推理内容')
  })
})
```

### 3.2 ChatView 集成测试

**文件**：`tests/integration/components/ChatView.spec.ts`

```ts
describe('ChatView.vue - 推理配置集成', () => {
  it('切换模型时应自动更新推理能力', async () => {
    const wrapper = mount(ChatView, {
      props: {
        conversationId: 'test-conv-1'
      }
    })
    
    // 初始模型：Anthropic
    expect(wrapper.vm.modelReasoningCapability?.reasoningClass).toBe('A')
    
    // 切换到 OpenAI o-series
    await wrapper.setProps({ conversationId: 'test-conv-2' }) // 假设对应不同模型
    
    await nextTick()
    expect(wrapper.vm.modelReasoningCapability?.reasoningClass).toBe('B')
  })
  
  it('发送消息时应调用适配器', async () => {
    const buildReasoningPayloadSpy = vi.spyOn(reasoningAdapter, 'buildReasoningPayload')
    
    const wrapper = mount(ChatView, {
      props: {
        conversationId: 'test-conv-1'
      }
    })
    
    // 触发消息发送
    await wrapper.vm.sendMessage('测试消息', [])
    
    expect(buildReasoningPayloadSpy).toHaveBeenCalledWith(
      expect.any(String), // modelId
      expect.objectContaining({ reasoningClass: 'A' }), // capability
      expect.objectContaining({ controlMode: 'effort' }), // config
      expect.any(Object) // strategy
    )
  })
})
```

## 四、E2E 测试场景（可选）

### 4.1 关键用户流程

**工具**：Playwright 或 Cypress

#### 场景 1：模型切换与推理控件适配

```ts
test('模型切换应自动调整推理控件可用性', async ({ page }) => {
  // 1. 打开对话
  await page.goto('/chat/conv-123')
  
  // 2. 初始模型：Anthropic（Class A）
  await expect(page.locator('[data-testid="reasoning-toggle"]')).toBeEnabled()
  await expect(page.locator('[data-testid="max-tokens-input"]')).toBeVisible()
  
  // 3. 切换到 Llama 3（Class C）
  await page.click('[data-testid="model-selector"]')
  await page.click('text=Llama 3 8B')
  
  // 4. 验证推理控件禁用
  await expect(page.locator('[data-testid="reasoning-toggle"]')).toBeDisabled()
  await expect(page.locator('text=当前模型不支持')).toBeVisible()
  
  // 5. 切换到 OpenAI o1（Class B）
  await page.click('[data-testid="model-selector"]')
  await page.click('text=OpenAI o1-preview')
  
  // 6. 验证推理开关可用，但自定义预算隐藏
  await expect(page.locator('[data-testid="reasoning-toggle"]')).toBeEnabled()
  await expect(page.locator('[data-testid="max-tokens-input"]')).not.toBeVisible()
})
```

#### 场景 2：高成本档位警告

```ts
test('选择 high 档位应显示成本警告', async ({ page }) => {
  await page.goto('/chat/conv-123')
  
  // 打开推理设置
  await page.click('[data-testid="reasoning-button"]')
  await page.click('[data-testid="reasoning-menu"]')
  
  // 选择 high 档位
  await page.click('text=深度 (High)')
  
  // 验证警告提示
  await expect(page.locator('text=高成本')).toBeVisible()
  await expect(page.locator('text=显著增加延迟和费用')).toBeVisible()
  
  // 验证按钮颜色变为红色
  const button = page.locator('[data-testid="reasoning-button"]')
  await expect(button).toHaveClass(/border-red-300/)
})
```

#### 场景 3：发送消息并验证请求体

```ts
test('发送消息应包含正确的 reasoning 参数', async ({ page }) => {
  // 拦截 API 请求
  await page.route('**/api/chat', async (route) => {
    const request = route.request()
    const body = JSON.parse(request.postData() || '{}')
    
    // 验证 reasoning 参数
    expect(body.reasoning).toBeDefined()
    expect(body.reasoning.effort).toBe('high')
    expect(body.reasoning.exclude).toBe(true)
    
    await route.continue()
  })
  
  await page.goto('/chat/conv-123')
  
  // 设置 high 档位
  await page.click('[data-testid="reasoning-button"]')
  await page.click('text=深度 (High)')
  
  // 发送消息
  await page.fill('[data-testid="chat-input"]', '测试消息')
  await page.press('[data-testid="chat-input"]', 'Enter')
  
  // 等待请求完成
  await page.waitForResponse('**/api/chat')
})
```

## 五、风险评估与缓解措施

### 5.1 技术风险矩阵

| 风险项                          | 影响等级 | 概率 | 缓解措施                                      |
|---------------------------------|----------|------|-----------------------------------------------|
| **Anthropic 规则错误应用**      | 高       | 中   | 单元测试覆盖 + 白名单维护                     |
| **模型能力缓存过期**            | 中       | 中   | 定时刷新 + 版本检查                           |
| **旧配置迁移失败**              | 高       | 低   | 迁移脚本测试 + 回滚机制                       |
| **IPC 数据结构变化**            | 高       | 低   | TypeScript 类型强约束 + 版本化 IPC 协议       |
| **UI 与适配器逻辑脱节**         | 中       | 中   | 集成测试 + Props/Emits 类型检查               |
| **成本计算错误**                | 高       | 低   | 单元测试 + 对账测试（vs OR Generation API）   |
| **性能退化（多次适配器调用）**  | 中       | 低   | 计算属性缓存 + Profiling                      |

### 5.2 关键风险详解与缓解

#### 风险 1：Anthropic 规则错误应用到其他模型

**场景**：
- 开发者误将 `[1024, 32000]` 裁剪逻辑应用到 Gemini / Qwen 模型
- 导致用户无法设置合理的推理预算

**缓解**：
1. **单元测试**：为每个 `maxTokensPolicy` 编写独立测试
2. **类型守卫**：在适配器中使用 `family === 'anthropic'` 双重检查
3. **Lint 规则**：增加自定义 ESLint 规则，检测"硬编码 1024/32000"
4. **代码审查**：PR 检查清单包含"模型策略隔离"

#### 风险 2：模型能力缓存过期

**场景**：
- OpenRouter 增加新模型或修改 `supported_parameters`
- Starverse 本地缓存未及时更新，导致能力判断错误

**缓解**：
1. **定时刷新**：Worker 线程每日凌晨自动调用 `/models/user`
2. **版本检查**：在响应头中检查 `X-Model-Version`，发现变化时触发刷新
3. **白名单维护**：在 `reasoningHelpers.ts` 中维护已知模型列表，定期更新
4. **降级策略**：能力未知时默认为 Class C（最保守）

#### 风险 3：旧配置迁移失败

**场景**：
- 用户从 v1 升级到 v2 时，SQLite 迁移脚本失败
- 导致对话历史丢失或推理配置错乱

**缓解**：
1. **迁移测试**：在测试数据库中模拟各种旧配置格式
2. **回滚机制**：保留旧列，仅在确认迁移成功后标记为已迁移
3. **数据备份**：升级前自动备份 `.db` 文件到 `backups/` 目录
4. **错误恢复**：迁移失败时提示用户手动回滚或联系支持

#### 风险 4：成本计算错误

**场景**：
- `pricing.internal_reasoning` 单价变化或计算公式错误
- 导致用户账单统计不准确

**缓解**：
1. **单元测试**：模拟已知成本的请求，验证计算结果
2. **对账测试**：定期调用 `/api/v1/generation?id=` 验证本地统计与 OR 一致
3. **价格更新**：在模型缓存刷新时同步更新 `internalReasoningPrice`
4. **用户提示**：在分析面板标注"成本为估算值，以 OpenRouter 账单为准"

### 5.3 UX 风险与警示

| 用户场景                        | 潜在问题                              | 缓解措施                              |
|---------------------------------|---------------------------------------|---------------------------------------|
| **频繁使用 high 档位**          | 成本快速增加                          | 自动弹窗警告 + 月度成本提醒           |
| **模型不返回推理内容**          | 用户困惑为何"显示思考"无效             | 提前显示警告"该模型不会返回内容"       |
| **Anthropic 预算自动调整**      | 用户输入 8000 但实际只用了 8000       | 显示"已根据 Starverse 策略调整"提示   |
| **切换模型后配置失效**          | 用户期望保留推理档位                  | 按模型族记忆配置（Anthropic/OpenAI 等）|

## 六、性能测试与基准

### 6.1 适配器性能测试

**目标**：确保适配器调用不影响消息发送延迟

```ts
describe('buildReasoningPayload - 性能测试', () => {
  it('应在 1ms 内完成计算', () => {
    const start = performance.now()
    
    for (let i = 0; i < 1000; i++) {
      buildReasoningPayload(
        'anthropic/claude-3.7-sonnet',
        anthropicCapability,
        {
          controlMode: 'effort',
          effort: 'medium',
          showReasoningContent: false
        }
      )
    }
    
    const end = performance.now()
    const avgTime = (end - start) / 1000
    
    expect(avgTime).toBeLessThan(1) // 平均 < 1ms
  })
})
```

### 6.2 数据库查询性能测试

**场景**：大量推理统计数据（100K+ 记录）

```sql
-- 测试查询：effort 分布分析（模拟 1 年数据）
EXPLAIN QUERY PLAN
SELECT effort, COUNT(*), SUM(reasoning_cost)
FROM reasoning_usage_stats
WHERE created_at >= strftime('%s', 'now', '-1 year') * 1000
GROUP BY effort;

-- 预期：使用 idx_reasoning_stats_effort 索引
-- 执行时间 < 50ms
```

**优化措施**：
- 定期归档旧数据（> 1 年）
- 增加覆盖索引
- 使用定时任务预计算统计数据

## 七、测试执行计划

### 7.1 开发阶段测试

**Phase 1：类型与适配器（当前）**
- [ ] 编写 `openrouterReasoningAdapter.spec.ts`（80+ 个用例）
- [ ] 编写 `reasoningHelpers.spec.ts`（30+ 个用例）
- [ ] 运行 `npm run test:unit`
- [ ] 代码覆盖率 > 90%

**Phase 2：UI 组件集成**
- [ ] 编写 `ReasoningControls.spec.ts`（20+ 个用例）
- [ ] 编写 `ChatView.spec.ts`（15+ 个用例）
- [ ] 运行 `npm run test:integration`
- [ ] 验证组件交互正确性

**Phase 3：E2E 测试**
- [ ] 编写 Playwright 测试脚本（5+ 个关键流程）
- [ ] 在 CI 环境运行
- [ ] 验证用户完整体验

### 7.2 发布前测试

**回归测试**：
- [ ] 运行全部单元测试（预期 < 10s）
- [ ] 运行全部集成测试（预期 < 30s）
- [ ] 运行 E2E 测试（预期 < 3min）

**兼容性测试**：
- [ ] 测试从 v1 升级到 v2
- [ ] 测试旧配置迁移
- [ ] 测试回滚脚本

**压力测试**：
- [ ] 模拟 10 个并发对话
- [ ] 验证数据库锁争用
- [ ] 验证 UI 流畅度

### 7.3 生产监控

**关键指标**：
- 适配器调用错误率 < 0.1%
- 平均适配器延迟 < 1ms
- 成本计算偏差 < 5%（vs OpenRouter Generation API）
- 用户投诉推理相关问题 < 1/月

**监控工具**：
- Sentry 错误追踪
- 自定义 analytics 事件（reasoning_config_changed、reasoning_warning_shown）
- 数据库查询日志（慢查询 > 100ms）

## 八、测试清单摘要

### 8.1 必须通过的测试（Blocker）

- ✅ Anthropic [1024, 32000] 裁剪测试
- ✅ OpenAI o-series max_tokens 作为 hint 测试
- ✅ Class C 模型空 payload 测试
- ✅ 可见性控制测试（exclude / include_reasoning）
- ✅ disabled 模式测试
- ✅ 成本计算准确性测试

### 8.2 推荐通过的测试（High Priority）

- ✅ 模型能力推断测试（inferMaxTokensSupport 等）
- ✅ ReasoningControls 集成测试（禁用/隐藏逻辑）
- ✅ ChatView 集成测试（适配器调用）
- ✅ 数据库迁移测试
- ✅ 旧配置兼容性测试

### 8.3 可选测试（Nice to Have）

- ⭕ E2E 测试（用户完整流程）
- ⭕ 性能基准测试
- ⭕ 压力测试（并发场景）
- ⭕ 可访问性测试（a11y）

## 九、总结

### 9.1 测试覆盖目标

| 测试层级     | 覆盖率目标 | 预期用例数 | 执行时间 |
|--------------|------------|------------|----------|
| 单元测试     | > 90%      | 100+       | < 10s    |
| 集成测试     | > 70%      | 30+        | < 30s    |
| E2E 测试     | 关键路径   | 5+         | < 3min   |

### 9.2 关键成功指标

- ✅ 所有 Class A/B/C 模型分支测试通过
- ✅ 旧配置迁移无数据丢失
- ✅ 成本计算偏差 < 5%
- ✅ 用户投诉 < 1/月
- ✅ 代码覆盖率 > 85%

### 9.3 后续优化方向

1. **增量测试**：仅运行受影响文件的测试（提升 CI 速度）
2. **快照测试**：对复杂 UI 状态使用快照（Jest Snapshot）
3. **模糊测试**：随机生成配置组合，发现边界 case
4. **A/B 测试**：在生产环境对比新旧推理系统效果

---

**附录：测试命令速查表**

```bash
# 运行所有单元测试
npm run test:unit

# 运行指定文件测试
npm run test:unit openrouterReasoningAdapter

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行集成测试
npm run test:integration

# 运行 E2E 测试
npm run test:e2e

# 监听模式（开发时）
npm run test:watch
```
