# Tailwind CSS v4 对话初始化 Prompt

在与 AI 助手（ChatGPT、Claude、Gemini 等）开始编写代码前，将以下内容作为**系统提示**发送，确保 AI 理解 v4 语法规则。

---

## 🎯 推荐 Prompt（中文版）

```
我正在使用 Tailwind CSS v4.1.16 开发 Starverse 项目。

请注意，v4 已经废弃了所有独立的透明度类（如 bg-opacity-*、text-opacity-* 等）。

在接下来的代码生成中，请严格遵守以下规则：

1. **绝对不要使用 bg-opacity、text-opacity 或 border-opacity**
   - ❌ 错误：bg-black bg-opacity-50
   - ✅ 正确：bg-black/50

2. **所有透明度必须使用斜杠语法**
   - 颜色/透明度：bg-white/10、text-black/50、border-red-500/30

3. **技术原因**：Tailwind v4 引擎不再生成 --tw-bg-opacity 等 CSS 变量，因此旧写法在物理上是无效的，不仅仅是风格问题。

4. **配置优先级**：
   - 禁止修改 tailwind.config.js 添加新主题
   - 优先使用 CSS @theme 指令或任意值
   - 使用 @import "tailwindcss" 而非 @tailwind 指令

5. **自我检查**：如果你发现自己在写 bg-opacity 或类似代码，请立即自我纠正为 /alpha 写法。

项目已配置的自定义颜色：
- primary-{50~900}、secondary-{50~900}
- success-{50~700}、warning-{50~700}、danger-{50~700}

使用示例：
<button class="bg-primary-500/90 hover:bg-primary-600/90 text-white/95">按钮</button>

请确认你理解了这些规则，然后我们开始编码。
```

---

## 🌐 Recommended Prompt (English Version)

```
I'm working on the Starverse project using Tailwind CSS v4.1.16.

Please note that v4 has deprecated all separate opacity utility classes (like bg-opacity-*, text-opacity-*, etc.).

For all code generation, you MUST strictly follow these rules:

1. **NEVER use bg-opacity, text-opacity, or border-opacity**
   - ❌ Wrong: bg-black bg-opacity-50
   - ✅ Correct: bg-black/50

2. **ALL transparency must use slash syntax**
   - Color/opacity: bg-white/10, text-black/50, border-red-500/30

3. **Technical reason**: Tailwind v4 engine no longer generates --tw-bg-opacity and similar CSS variables. Using old syntax will physically fail - this is not just a style preference.

4. **Configuration priority**:
   - Do NOT modify tailwind.config.js for new themes
   - Prefer CSS @theme directive or arbitrary values
   - Use @import "tailwindcss" instead of @tailwind directives

5. **Self-check**: If you find yourself writing bg-opacity or similar, immediately self-correct to /alpha syntax.

Project's custom colors:
- primary-{50~900}, secondary-{50~900}
- success-{50~700}, warning-{50~700}, danger-{50~700}

Example usage:
<button class="bg-primary-500/90 hover:bg-primary-600/90 text-white/95">Button</button>

Please confirm you understand these rules, and we can start coding.
```

---

## 📝 使用场景

### 场景 1: ChatGPT / Claude / Gemini (网页对话)
1. 复制上述 Prompt
2. 在开始编码对话时作为第一条消息发送
3. 等待 AI 确认理解后再提出具体需求

### 场景 2: GitHub Copilot Chat (VS Code)
1. 在 VS Code 中打开 Copilot Chat
2. 使用 `/workspace` 命令时，Copilot 会自动读取 `.cursorrules`
3. 如果仍然生成错误代码，复制本 Prompt 手动发送

### 场景 3: Cursor / Windsurf (IDE 集成)
1. 这些工具会自动读取 `.cursorrules` / `.windsurfrules`
2. 通常无需手动发送 Prompt
3. 如果 AI 犯错，可以回复："请遵守项目的 Tailwind v4 规则"

---

## 🔍 验证 AI 是否理解

发送 Prompt 后，可以用以下测试问题验证：

**测试问题**:
```
请写一个半透明的黑色遮罩层，透明度为 50%。
```

**期望回答**:
```html
<div class="bg-black/50">遮罩层</div>
```

**错误回答（立即纠正）**:
```html
<div class="bg-black bg-opacity-50">遮罩层</div>  <!-- ❌ v3 语法 -->
```

---

## 🛠️ 常见纠正话术

如果 AI 仍然生成 v3 语法，使用以下话术纠正：

### 中文纠正
```
你刚才使用了 bg-opacity-*，这在 Tailwind v4 中已经被废弃。
请将所有 *-opacity-* 类改为斜杠语法（例如 bg-black/50）。

技术原因：v4 不再生成 --tw-bg-opacity CSS 变量，旧语法会导致样式失效。
```

### English Correction
```
You just used bg-opacity-*, which is deprecated in Tailwind v4.
Please change all *-opacity-* classes to slash syntax (e.g., bg-black/50).

Technical reason: v4 no longer generates --tw-bg-opacity CSS variables, so old syntax will fail.
```

---

## 📚 相关资源

- 项目规则文件: `.cursorrules` / `.windsurfrules`
- 开发指南: `.github/copilot-instructions.md`
- 完整文档: `docs/TAILWIND_V4_MIGRATION.md`
- 快速参考: `docs/TAILWIND_V4_QUICK_REFERENCE.md`

---

## 💡 提示技巧

### 强化记忆
如果 AI 在长对话中忘记规则，可以简短提醒：
```
提醒：使用 v4 斜杠语法，不要用 *-opacity-*。
```

### 代码审查模式
让 AI 帮你检查现有代码：
```
请检查以下代码中是否有 Tailwind v3 语法，如果有请修正为 v4 语法。
```

---

**最后更新**: 2025-11-29  
**适用项目**: Starverse  
**AI 助手**: ChatGPT, Claude, Gemini, Copilot, Cursor, Windsurf
