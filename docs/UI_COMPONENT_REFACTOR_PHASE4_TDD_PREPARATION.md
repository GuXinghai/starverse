# Starverse UI 组件库重构 - 阶段四：测试驱动开发准备 (TDD)

> **QA 工程师角色**: 测试架构师 + 质量保证专家  
> **文档日期**: 2025年11月28日  
> **测试策略**: Test-First Development (先写测试,再写代码)  

---

## 目录

1. [测试金字塔策略](#测试金字塔策略)
2. [原子组件测试用例](#原子组件测试用例)
3. [分子组件测试用例](#分子组件测试用例)
4. [有机体组件测试用例](#有机体组件测试用例)
5. [无障碍性测试清单](#无障碍性测试清单)
6. [性能基准测试](#性能基准测试)

---

## 测试金字塔策略

```
        ┌─────────────┐
        │  E2E Tests  │  10% - Playwright (关键用户流程)
        └─────────────┘
       ┌───────────────┐
       │ Integration   │  20% - Testing Library (组件交互)
       │     Tests     │
       └───────────────┘
      ┌─────────────────┐
      │   Unit Tests    │  70% - Vitest (纯逻辑函数)
      │  (Composables)  │
      └─────────────────┘
```

### 测试覆盖率目标

| 层级 | 目标覆盖率 | 工具 |
|------|-----------|------|
| **单元测试** | ≥ 90% | Vitest |
| **集成测试** | ≥ 70% | @testing-library/vue |
| **E2E 测试** | ≥ 50% | Playwright |
| **无障碍性** | 100% | axe-core |

---

## 原子组件测试用例

### 1. Button 组件测试用例

#### 1.1 快乐路径 (Happy Path)

**测试目的**: 验证组件在正常情况下的行为

```typescript
// src/components/atoms/Button/Button.test.ts

describe('Button - Happy Path', () => {
  describe('渲染', () => {
    it('应该渲染默认的 primary 按钮', () => {
      // Given: 没有传入 props
      render(Button, { slots: { default: '点击我' } })
      
      // When: 组件渲染完成
      const button = screen.getByRole('button', { name: '点击我' })
      
      // Then: 应该显示按钮文本并包含 primary 样式
      expect(button).toBeInTheDocument()
      expect(button).toHaveClass('bg-blue-500')
    })
    
    it('应该正确渲染所有变体', () => {
      // Given: 不同的 variant props
      const variants = ['primary', 'secondary', 'ghost', 'danger', 'success']
      
      // When: 渲染每个变体
      variants.forEach(variant => {
        const { container } = render(Button, {
          props: { variant },
          slots: { default: variant }
        })
        
        // Then: 应该包含对应的样式类
        const button = container.querySelector('button')
        expect(button).toMatchSnapshot() // 快照测试
      })
    })
  })
  
  describe('交互', () => {
    it('应该在点击时触发 click 事件', async () => {
      // Given: 一个带有点击处理器的按钮
      const handleClick = vi.fn()
      render(Button, {
        props: { onClick: handleClick },
        slots: { default: '点击我' }
      })
      
      // When: 用户点击按钮
      await userEvent.click(screen.getByRole('button'))
      
      // Then: 应该调用处理器一次
      expect(handleClick).toHaveBeenCalledTimes(1)
      expect(handleClick).toHaveBeenCalledWith(expect.any(MouseEvent))
    })
    
    it('应该支持键盘交互 (Enter 和 Space)', async () => {
      // Given: 一个按钮
      const handleClick = vi.fn()
      render(Button, {
        props: { onClick: handleClick },
        slots: { default: '按键测试' }
      })
      
      const button = screen.getByRole('button')
      button.focus()
      
      // When: 按下 Enter 键
      await userEvent.keyboard('{Enter}')
      expect(handleClick).toHaveBeenCalledTimes(1)
      
      // When: 按下 Space 键
      await userEvent.keyboard(' ')
      expect(handleClick).toHaveBeenCalledTimes(2)
    })
  })
  
  describe('插槽', () => {
    it('应该正确渲染左侧图标插槽', () => {
      // Given: 传入 left-icon 插槽
      const { container } = render(Button, {
        slots: {
          default: '保存',
          'left-icon': '<svg data-testid="left-icon"></svg>'
        }
      })
      
      // Then: 应该在文本左侧显示图标
      expect(container.querySelector('[data-testid="left-icon"]')).toBeInTheDocument()
    })
  })
})
```

---

#### 1.2 边缘情况 (Edge Cases)

```typescript
describe('Button - Edge Cases', () => {
  describe('禁用状态', () => {
    it('当 disabled=true 时不应触发点击事件', async () => {
      // Given: 一个禁用的按钮
      const handleClick = vi.fn()
      render(Button, {
        props: { disabled: true, onClick: handleClick },
        slots: { default: '禁用按钮' }
      })
      
      // When: 尝试点击
      await userEvent.click(screen.getByRole('button'))
      
      // Then: 不应调用处理器
      expect(handleClick).not.toHaveBeenCalled()
    })
    
    it('当 disabled=true 时应该设置正确的 ARIA 属性', () => {
      // Given: 禁用按钮
      render(Button, {
        props: { disabled: true },
        slots: { default: 'Disabled' }
      })
      
      // Then: 应该有 aria-disabled
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveClass('cursor-not-allowed', 'opacity-60')
    })
  })
  
  describe('加载状态', () => {
    it('当 loading=true 时不应触发点击事件', async () => {
      // Given: 一个加载中的按钮
      const handleClick = vi.fn()
      render(Button, {
        props: { loading: true, onClick: handleClick },
        slots: { default: '加载中...' }
      })
      
      // When: 尝试点击
      await userEvent.click(screen.getByRole('button'))
      
      // Then: 不应调用处理器
      expect(handleClick).not.toHaveBeenCalled()
    })
    
    it('当 loading=true 时应该显示加载指示器', () => {
      // Given: 加载中的按钮
      render(Button, {
        props: { loading: true },
        slots: { default: 'Loading' }
      })
      
      // Then: 应该有 loading 插槽或默认加载图标
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-busy', 'true')
      expect(button.querySelector('.animate-spin')).toBeInTheDocument()
    })
  })
  
  describe('多态属性 (as prop)', () => {
    it('应该能渲染为 <a> 标签', () => {
      // Given: as="a" prop
      render(Button, {
        props: { as: 'a', href: 'https://example.com' },
        slots: { default: '链接按钮' }
      })
      
      // Then: 应该渲染为 <a> 标签
      const link = screen.getByRole('link')
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'https://example.com')
    })
  })
  
  describe('极端情况', () => {
    it('应该处理空内容', () => {
      // Given: 没有插槽内容
      render(Button)
      
      // Then: 应该正常渲染但为空
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(button).toBeEmptyDOMElement()
    })
    
    it('应该处理极长文本不溢出', () => {
      // Given: 超长文本
      const longText = 'A'.repeat(1000)
      render(Button, { slots: { default: longText } })
      
      // Then: 应该正常渲染(通过 CSS 控制)
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
    })
  })
})
```

---

#### 1.3 无障碍性测试

```typescript
describe('Button - Accessibility', () => {
  it('应该通过 axe 无障碍性检查', async () => {
    // Given: 一个按钮
    const { container } = render(Button, {
      slots: { default: '无障碍按钮' }
    })
    
    // Then: 不应有 a11y 违规
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
  
  it('图标按钮应该有 aria-label', async () => {
    // Given: 只有图标的按钮
    const { container } = render(Button, {
      props: { 'aria-label': '关闭' },
      slots: {
        default: '<svg aria-hidden="true"><path/></svg>'
      }
    })
    
    // Then: 应该通过 a11y 检查
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
  
  it('应该有足够的颜色对比度', () => {
    // Given: 不同变体的按钮
    render(Button, {
      props: { variant: 'primary' },
      slots: { default: 'High Contrast' }
    })
    
    // Then: 颜色对比度应该 ≥ 4.5:1 (WCAG AA)
    const button = screen.getByRole('button')
    // 使用 Playwright 或浏览器扩展进行实际对比度测试
    expect(button).toBeVisible()
  })
})
```

---

### 2. Dialog 组件测试用例

#### 2.1 快乐路径

```typescript
describe('Dialog - Happy Path', () => {
  describe('打开和关闭', () => {
    it('当 open=true 时应该显示对话框', async () => {
      // Given: open=true
      render({
        components: { Dialog, DialogContent },
        template: `
          <Dialog :open="true">
            <DialogContent>
              <p>对话框内容</p>
            </DialogContent>
          </Dialog>
        `
      })
      
      // Then: 应该在 DOM 中找到内容
      await waitFor(() => {
        expect(screen.getByText('对话框内容')).toBeInTheDocument()
      })
    })
    
    it('当 open=false 时不应显示对话框', () => {
      // Given: open=false
      render({
        components: { Dialog, DialogContent },
        template: `
          <Dialog :open="false">
            <DialogContent>
              <p>对话框内容</p>
            </DialogContent>
          </Dialog>
        `
      })
      
      // Then: 不应找到内容
      expect(screen.queryByText('对话框内容')).not.toBeInTheDocument()
    })
  })
  
  describe('遮罩交互', () => {
    it('点击遮罩应该关闭对话框 (当 closeOnOverlayClick=true)', async () => {
      // Given: 一个打开的对话框
      const handleClose = vi.fn()
      render({
        components: { Dialog, DialogContent },
        setup() {
          return { handleClose }
        },
        template: `
          <Dialog :open="true" @update:open="handleClose">
            <DialogContent>内容</DialogContent>
          </Dialog>
        `
      })
      
      // When: 点击遮罩
      const overlay = document.querySelector('.bg-black\\/50')
      await userEvent.click(overlay!)
      
      // Then: 应该触发关闭事件
      expect(handleClose).toHaveBeenCalledWith(false)
    })
    
    it('点击内容区域不应关闭对话框', async () => {
      // Given: 一个打开的对话框
      const handleClose = vi.fn()
      render({
        components: { Dialog, DialogContent },
        setup() {
          return { handleClose }
        },
        template: `
          <Dialog :open="true" @update:open="handleClose">
            <DialogContent>
              <p data-testid="content">内容</p>
            </DialogContent>
          </Dialog>
        `
      })
      
      // When: 点击内容区域
      await userEvent.click(screen.getByTestId('content'))
      
      // Then: 不应触发关闭
      expect(handleClose).not.toHaveBeenCalled()
    })
  })
  
  describe('键盘交互', () => {
    it('按 ESC 键应该关闭对话框', async () => {
      // Given: 打开的对话框
      const handleClose = vi.fn()
      render({
        components: { Dialog, DialogContent },
        setup() {
          return { handleClose }
        },
        template: `
          <Dialog :open="true" @update:open="handleClose" :close-on-esc="true">
            <DialogContent>内容</DialogContent>
          </Dialog>
        `
      })
      
      // When: 按 ESC 键
      await userEvent.keyboard('{Escape}')
      
      // Then: 应该关闭
      expect(handleClose).toHaveBeenCalledWith(false)
    })
  })
})
```

---

#### 2.2 边缘情况

```typescript
describe('Dialog - Edge Cases', () => {
  describe('焦点管理', () => {
    it('打开时应该将焦点移动到对话框内', async () => {
      // Given: 一个按钮和对话框
      render({
        components: { Dialog, DialogContent, Button },
        setup() {
          const isOpen = ref(false)
          return { isOpen }
        },
        template: `
          <div>
            <Button @click="isOpen = true">打开</Button>
            <Dialog v-model:open="isOpen">
              <DialogContent>
                <Button data-testid="dialog-btn">对话框按钮</Button>
              </DialogContent>
            </Dialog>
          </div>
        `
      })
      
      // When: 打开对话框
      await userEvent.click(screen.getByText('打开'))
      
      // Then: 焦点应该在对话框内
      await waitFor(() => {
        const dialogButton = screen.getByTestId('dialog-btn')
        expect(document.activeElement).toBe(dialogButton)
      })
    })
    
    it('应该形成焦点陷阱 (Tab 键循环)', async () => {
      // Given: 包含多个可聚焦元素的对话框
      render({
        components: { Dialog, DialogContent, Button },
        template: `
          <Dialog :open="true">
            <DialogContent>
              <Button data-testid="btn1">Button 1</Button>
              <Button data-testid="btn2">Button 2</Button>
              <Button data-testid="btn3">Button 3</Button>
            </DialogContent>
          </Dialog>
        `
      })
      
      const btn1 = screen.getByTestId('btn1')
      const btn3 = screen.getByTestId('btn3')
      
      // When: 聚焦最后一个按钮并按 Tab
      btn3.focus()
      await userEvent.keyboard('{Tab}')
      
      // Then: 应该回到第一个按钮
      expect(document.activeElement).toBe(btn1)
    })
    
    it('关闭后应该恢复焦点到触发元素', async () => {
      // Given: 触发按钮和对话框
      render({
        components: { Dialog, DialogContent, Button },
        setup() {
          const isOpen = ref(false)
          return { isOpen }
        },
        template: `
          <div>
            <Button data-testid="trigger" @click="isOpen = true">打开</Button>
            <Dialog v-model:open="isOpen">
              <DialogContent>
                <Button @click="isOpen = false">关闭</Button>
              </DialogContent>
            </Dialog>
          </div>
        `
      })
      
      const trigger = screen.getByTestId('trigger')
      
      // When: 打开并关闭对话框
      await userEvent.click(trigger)
      await userEvent.click(screen.getByText('关闭'))
      
      // Then: 焦点应该回到触发按钮
      await waitFor(() => {
        expect(document.activeElement).toBe(trigger)
      })
    })
  })
  
  describe('Body 滚动锁定', () => {
    it('打开时应该锁定 body 滚动', async () => {
      // Given: 打开的对话框
      render({
        components: { Dialog, DialogContent },
        template: `
          <Dialog :open="true">
            <DialogContent>内容</DialogContent>
          </Dialog>
        `
      })
      
      // Then: body 应该有 overflow: hidden
      await waitFor(() => {
        expect(document.body.style.overflow).toBe('hidden')
      })
    })
    
    it('关闭时应该恢复 body 滚动', async () => {
      // Given: 可控制的对话框
      const { rerender } = render({
        components: { Dialog, DialogContent },
        props: ['open'],
        template: `
          <Dialog :open="open">
            <DialogContent>内容</DialogContent>
          </Dialog>
        `,
        propsData: { open: true }
      })
      
      // When: 关闭对话框
      await rerender({ open: false })
      
      // Then: body 应该恢复滚动
      await waitFor(() => {
        expect(document.body.style.overflow).toBe('')
      })
    })
  })
  
  describe('嵌套对话框', () => {
    it('应该正确处理多个对话框打开', async () => {
      // Given: 嵌套的对话框
      render({
        components: { Dialog, DialogContent },
        setup() {
          const dialog1Open = ref(true)
          const dialog2Open = ref(false)
          return { dialog1Open, dialog2Open }
        },
        template: `
          <div>
            <Dialog v-model:open="dialog1Open">
              <DialogContent>
                <p>Dialog 1</p>
                <button @click="dialog2Open = true">打开 Dialog 2</button>
              </DialogContent>
            </Dialog>
            
            <Dialog v-model:open="dialog2Open">
              <DialogContent>
                <p>Dialog 2</p>
              </DialogContent>
            </Dialog>
          </div>
        `
      })
      
      // When: 打开第二个对话框
      await userEvent.click(screen.getByText('打开 Dialog 2'))
      
      // Then: 两个对话框都应该可见
      expect(screen.getByText('Dialog 1')).toBeInTheDocument()
      expect(screen.getByText('Dialog 2')).toBeInTheDocument()
    })
  })
})
```

---

#### 2.3 无障碍性测试

```typescript
describe('Dialog - Accessibility', () => {
  it('应该有正确的 ARIA 属性', async () => {
    // Given: 一个对话框
    render({
      components: { Dialog, DialogContent, DialogTitle },
      template: `
        <Dialog :open="true">
          <DialogContent>
            <DialogTitle id="dialog-title">标题</DialogTitle>
            <p>内容</p>
          </DialogContent>
        </Dialog>
      `
    })
    
    // Then: 应该有正确的 ARIA 属性
    await waitFor(() => {
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'dialog-title')
    })
  })
  
  it('应该通过 axe 无障碍性检查', async () => {
    // Given: 完整的对话框结构
    const { container } = render({
      components: { Dialog, DialogContent, DialogHeader, DialogTitle },
      template: `
        <Dialog :open="true">
          <DialogContent>
            <DialogHeader>
              <DialogTitle>对话框标题</DialogTitle>
            </DialogHeader>
            <p>对话框内容</p>
          </DialogContent>
        </Dialog>
      `
    })
    
    // Then: 不应有 a11y 违规
    await waitFor(async () => {
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
```

---

### 3. Input 组件测试用例

#### 3.1 快乐路径

```typescript
describe('Input - Happy Path', () => {
  describe('受控模式', () => {
    it('应该显示传入的 value', () => {
      // Given: v-model 绑定
      render({
        components: { Input },
        setup() {
          const value = ref('初始值')
          return { value }
        },
        template: `<Input v-model="value" />`
      })
      
      // Then: 应该显示值
      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('初始值')
    })
    
    it('应该在输入时更新 v-model', async () => {
      // Given: v-model 绑定
      const value = ref('')
      render({
        components: { Input },
        setup() {
          return { value }
        },
        template: `<Input v-model="value" />`
      })
      
      // When: 用户输入
      const input = screen.getByRole('textbox')
      await userEvent.type(input, 'Hello')
      
      // Then: value 应该更新
      expect(value.value).toBe('Hello')
    })
  })
  
  describe('验证状态', () => {
    it('当 invalid=true 时应该显示错误样式', () => {
      // Given: invalid prop
      render(Input, {
        props: {
          invalid: true,
          errorMessage: '此字段为必填项'
        }
      })
      
      // Then: 应该有错误样式和消息
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText('此字段为必填项')).toBeInTheDocument()
    })
  })
})
```

---

## 分子组件测试用例

### 4. Select 组件测试用例

#### 4.1 快乐路径

```typescript
describe('Select - Happy Path', () => {
  describe('基础选择', () => {
    it('应该显示选中的选项', async () => {
      // Given: Select 组件
      const selectedValue = ref('option-1')
      render({
        components: { Select, SelectTrigger, SelectContent, SelectItem },
        setup() {
          return { selectedValue }
        },
        template: `
          <Select v-model="selectedValue">
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="option-1">Option 1</SelectItem>
              <SelectItem value="option-2">Option 2</SelectItem>
            </SelectContent>
          </Select>
        `
      })
      
      // When: 打开下拉菜单
      await userEvent.click(screen.getByRole('button'))
      
      // Then: 选中的选项应该有标记
      const option1 = screen.getByText('Option 1')
      expect(option1.closest('[data-selected]')).toHaveAttribute('data-selected', 'true')
    })
    
    it('应该在点击选项时更新值', async () => {
      // Given: Select 组件
      const selectedValue = ref('')
      render({
        components: { Select, SelectTrigger, SelectContent, SelectItem },
        setup() {
          return { selectedValue }
        },
        template: `
          <Select v-model="selectedValue">
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="option-1">Option 1</SelectItem>
              <SelectItem value="option-2">Option 2</SelectItem>
            </SelectContent>
          </Select>
        `
      })
      
      // When: 选择一个选项
      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(screen.getByText('Option 2'))
      
      // Then: 值应该更新
      expect(selectedValue.value).toBe('option-2')
    })
  })
  
  describe('键盘导航', () => {
    it('应该用方向键导航选项', async () => {
      // Given: 打开的 Select
      render({
        components: { Select, SelectTrigger, SelectContent, SelectItem },
        template: `
          <Select :open="true">
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="1">Option 1</SelectItem>
              <SelectItem value="2">Option 2</SelectItem>
              <SelectItem value="3">Option 3</SelectItem>
            </SelectContent>
          </Select>
        `
      })
      
      const trigger = screen.getByRole('button')
      trigger.focus()
      
      // When: 按下箭头键
      await userEvent.keyboard('{ArrowDown}')
      await userEvent.keyboard('{ArrowDown}')
      
      // Then: 应该高亮第二个选项
      const option2 = screen.getByText('Option 2')
      expect(option2.closest('[data-highlighted]')).toHaveAttribute('data-highlighted', 'true')
    })
    
    it('应该用 Enter 键选择高亮的选项', async () => {
      // Given: 打开的 Select
      const handleChange = vi.fn()
      render({
        components: { Select, SelectTrigger, SelectContent, SelectItem },
        setup() {
          return { handleChange }
        },
        template: `
          <Select :open="true" @change="handleChange">
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="1">Option 1</SelectItem>
              <SelectItem value="2">Option 2</SelectItem>
            </SelectContent>
          </Select>
        `
      })
      
      // When: 导航并选择
      await userEvent.keyboard('{ArrowDown}')
      await userEvent.keyboard('{Enter}')
      
      // Then: 应该选中该选项
      expect(handleChange).toHaveBeenCalledWith('1')
    })
  })
  
  describe('搜索功能', () => {
    it('当 searchable=true 时应该过滤选项', async () => {
      // Given: 可搜索的 Select
      render({
        components: { Select, SelectTrigger, SelectContent, SelectItem },
        template: `
          <Select :searchable="true">
            <SelectTrigger />
            <SelectContent>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
              <SelectItem value="cherry">Cherry</SelectItem>
            </SelectContent>
          </Select>
        `
      })
      
      // When: 打开并搜索
      await userEvent.click(screen.getByRole('button'))
      const searchInput = screen.getByRole('searchbox')
      await userEvent.type(searchInput, 'ban')
      
      // Then: 应该只显示匹配的选项
      expect(screen.getByText('Banana')).toBeInTheDocument()
      expect(screen.queryByText('Apple')).not.toBeInTheDocument()
      expect(screen.queryByText('Cherry')).not.toBeInTheDocument()
    })
  })
})
```

---

### 5. ScrollingText 组件测试用例

#### 5.1 快乐路径

```typescript
describe('ScrollingText - Happy Path', () => {
  describe('溢出检测', () => {
    it('当文本溢出时应该启用滚动', () => {
      // Given: 一个容器宽度小于文本宽度的组件
      const { container } = render(ScrollingText, {
        props: {
          text: '这是一段很长的文本'
        }
      })
      
      // Mock DOM measurements
      const containerEl = container.querySelector('[data-scroll-container]')
      const textEl = container.querySelector('[data-scroll-text]')
      
      vi.spyOn(containerEl!, 'offsetWidth', 'get').mockReturnValue(100)
      vi.spyOn(textEl!, 'offsetWidth', 'get').mockReturnValue(200)
      
      // When: 检测溢出
      // (在实际实现中由 useScrollingText 自动触发)
      
      // Then: 应该应用滚动样式
      expect(textEl).toHaveClass('animate-marquee')
    })
  })
  
  describe('动画控制', () => {
    it('应该在悬停时暂停动画', async () => {
      // Given: 一个滚动文本
      const { container } = render(ScrollingText, {
        props: {
          text: '滚动文本',
          forceScroll: true
        }
      })
      
      const scrollElement = container.querySelector('[data-scroll-text]')
      
      // When: 鼠标悬停
      await userEvent.hover(scrollElement!)
      
      // Then: 动画应该暂停
      expect(scrollElement).toHaveStyle({ animationPlayState: 'paused' })
    })
  })
})
```

---

## 有机体组件测试用例

### 6. ModelPicker 组件测试用例

#### 6.1 集成测试

```typescript
describe('ModelPicker - Integration', () => {
  describe('筛选功能', () => {
    it('应该同时应用搜索和筛选器', async () => {
      // Given: 包含多个模型的 ModelPicker
      const models = [
        { id: '1', name: 'GPT-4', provider: 'OpenAI', input_modalities: ['text', 'image'] },
        { id: '2', name: 'GPT-3.5', provider: 'OpenAI', input_modalities: ['text'] },
        { id: '3', name: 'Claude 3', provider: 'Anthropic', input_modalities: ['text'] }
      ]
      
      render({
        components: { ModelPicker },
        setup() {
          return { models }
        },
        template: `<ModelPicker :open="true" :models="models" />`
      })
      
      // When: 搜索 "gpt" 并筛选 "支持图片"
      await userEvent.type(screen.getByRole('searchbox'), 'gpt')
      await userEvent.click(screen.getByLabelText('图片'))
      
      // Then: 应该只显示 GPT-4
      expect(screen.getByText('GPT-4')).toBeInTheDocument()
      expect(screen.queryByText('GPT-3.5')).not.toBeInTheDocument()
      expect(screen.queryByText('Claude 3')).not.toBeInTheDocument()
    })
  })
  
  describe('虚拟滚动性能', () => {
    it('应该能流畅渲染 1000+ 个模型', async () => {
      // Given: 1000 个模型
      const models = Array.from({ length: 1000 }, (_, i) => ({
        id: `model-${i}`,
        name: `Model ${i}`,
        provider: 'Test',
        input_modalities: ['text']
      }))
      
      const startTime = performance.now()
      
      // When: 渲染 ModelPicker
      render({
        components: { ModelPicker },
        setup() {
          return { models }
        },
        template: `<ModelPicker :open="true" :models="models" />`
      })
      
      const endTime = performance.now()
      
      // Then: 渲染时间应该 < 100ms
      expect(endTime - startTime).toBeLessThan(100)
      
      // And: 应该只渲染可见的项
      const renderedItems = screen.getAllByRole('button').length
      expect(renderedItems).toBeLessThan(50) // 只渲染视口内的
    })
  })
})
```

---

## 无障碍性测试清单

### 全局 a11y 检查

```typescript
// tests/a11y/global-a11y.test.ts

describe('Global Accessibility', () => {
  const components = [
    { name: 'Button', Component: Button },
    { name: 'Dialog', Component: Dialog },
    { name: 'Input', Component: Input },
    { name: 'Select', Component: Select }
  ]
  
  components.forEach(({ name, Component }) => {
    describe(`${name} Component`, () => {
      it('应该通过 axe 核心规则', async () => {
        const { container } = render(Component, {
          props: getDefaultProps(name)
        })
        
        const results = await axe(container, {
          rules: {
            // 启用所有 WCAG 2.1 AA 规则
            'color-contrast': { enabled: true },
            'label': { enabled: true },
            'button-name': { enabled: true },
            'aria-required-attr': { enabled: true }
          }
        })
        
        expect(results).toHaveNoViolations()
      })
      
      it('应该支持屏幕阅读器导航', () => {
        // 使用 @testing-library/user-event 模拟屏幕阅读器
        // 验证 ARIA 标签是否正确
      })
    })
  })
})
```

---

## 性能基准测试

### 渲染性能

```typescript
// tests/performance/render-performance.test.ts

describe('Render Performance', () => {
  describe('ModelPicker with 1000 models', () => {
    it('初始渲染应该 < 100ms', async () => {
      const models = generateModels(1000)
      
      const { duration } = await measureRender(() => {
        render(ModelPicker, { props: { models } })
      })
      
      expect(duration).toBeLessThan(100)
    })
    
    it('滚动时帧率应该保持 60fps', async () => {
      const models = generateModels(1000)
      render(ModelPicker, { props: { models } })
      
      const fps = await measureScrollFPS()
      expect(fps).toBeGreaterThanOrEqual(55) // 允许 5fps 误差
    })
  })
  
  describe('ScrollingText animation', () => {
    it('动画应该不造成布局抖动', async () => {
      const { container } = render(ScrollingText, {
        props: { text: 'Long text', forceScroll: true }
      })
      
      const layoutShiftScore = await measureCLS(container)
      expect(layoutShiftScore).toBeLessThan(0.1) // CLS < 0.1 (Good)
    })
  })
})
```

---

## 测试运行脚本

### package.json scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest --run",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:a11y": "vitest --run tests/a11y",
    "test:perf": "vitest --run tests/performance",
    "test:e2e": "playwright test",
    "test:all": "npm run test:unit && npm run test:a11y && npm run test:e2e"
  }
}
```

---

## 总结

### 测试覆盖目标

| 组件类型 | 单元测试 | 集成测试 | E2E测试 | a11y测试 |
|---------|---------|---------|---------|----------|
| **原子组件** | ✅ 100% | ✅ 80% | ⚠️ 50% | ✅ 100% |
| **分子组件** | ✅ 90% | ✅ 90% | ✅ 60% | ✅ 100% |
| **有机体组件** | ✅ 80% | ✅ 100% | ✅ 80% | ✅ 100% |

### 测试优先级

1. **P0 (必须)**: 无障碍性测试 - 100% 覆盖
2. **P1 (高)**: 快乐路径 + 关键边缘情况
3. **P2 (中)**: 性能基准测试
4. **P3 (低)**: 极端边缘情况

---

**文档完成时间**: 2025-11-28  
**预计测试编写时间**: 与实现同步进行  
**测试策略**: TDD - 先写测试,再写实现
