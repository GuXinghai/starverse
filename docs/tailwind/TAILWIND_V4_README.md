# Tailwind CSS v4 配置文档索引

> **项目**: Starverse  
> **Tailwind 版本**: v4.1.16  
> **最后更新**: 2025-11-29

---

## 📚 文档导航

### 🚀 快速开始
- **[快速参考](./TAILWIND_V4_QUICK_REFERENCE.md)** ⭐ 推荐首读
  - 语法速查表
  - 常见问题 FAQ
  - 命令速查

### 📖 完整指南
- **[迁移指南](../archive/migrations/TAILWIND_V4_MIGRATION.md)**
  - v3 到 v4 的完整迁移步骤
  - 配置方式对比
  - 渐进式迁移策略

- **[验证报告](../archive/migrations/TAILWIND_V4_VERIFICATION.md)**
  - 功能验证结果
  - 配置文件检查
  - 测试清单

- **[总结文档](../archive/migrations/TAILWIND_V4_SUMMARY.md)**
  - 验证成果汇总
  - 文档产出列表
  - 后续建议

### 🤖 AI 助手配置
- **[AI Prompt 模板](./TAILWIND_V4_AI_PROMPT.md)** 🔥 重要
  - ChatGPT/Claude/Gemini 对话初始化 Prompt
  - AI 纠正话术
  - 常见错误处理

### 📁 项目规则文件
- **[.cursorrules](../../.cursorrules)** - Cursor IDE 规则
- **[.windsurfrules](../../.windsurfrules)** - Windsurf IDE 规则
- **[copilot-instructions.md](../../.github/copilot-instructions.md)** - GitHub Copilot 指南（已更新）

### 💡 示例代码
- **[tailwind-v4-theme.css](../../src/assets/tailwind-v4-theme.css)**
  - `@theme` 指令完整示例
  - 280+ 行带注释的配置

- **TailwindV4Demo.vue**（文件已归档，内容已合并至主代码库）
  - 可视化功能演示组件
  - 所有特性的实际应用

---

## 🎯 根据场景选择文档

### 场景 1: 我是新加入的开发者
1. 阅读 **[快速参考](./TAILWIND_V4_QUICK_REFERENCE.md)** (5 分钟)
2. 查看 **[.cursorrules](../../.cursorrules)** 了解项目规则 (3 分钟)
3. 如果使用 AI 助手，复制 **[AI Prompt](./TAILWIND_V4_AI_PROMPT.md)** (2 分钟)

**总计**: 10 分钟即可上手

---

### 场景 2: 我需要配置 AI 助手
1. 如果使用 Cursor/Windsurf，无需操作（自动读取 `.cursorrules`）
2. 如果使用 ChatGPT/Claude/Gemini，使用 **[AI Prompt 模板](./TAILWIND_V4_AI_PROMPT.md)**
3. 如果使用 VS Code Copilot，查看 **[copilot-instructions.md](../../.github/copilot-instructions.md)**

---

### 场景 3: 我遇到了样式问题
1. 检查是否使用了 `*-opacity-*` 类（v4 已废弃）
2. 参考 **[快速参考 - 常见问题](./TAILWIND_V4_QUICK_REFERENCE.md#常见问题)**
3. 查看 **[.cursorrules](../../.cursorrules)** 中的"自我纠正协议"

---

### 场景 4: 我需要深入理解 v4
1. 阅读 **[迁移指南](../archive/migrations/TAILWIND_V4_MIGRATION.md)** 的完整内容
2. 查看 **[验证报告](../archive/migrations/TAILWIND_V4_VERIFICATION.md)** 了解项目配置
3. 研究 **[tailwind-v4-theme.css](../../src/assets/tailwind-v4-theme.css)** 示例代码

---

### 场景 5: 我需要添加自定义主题
1. **不要修改** `tailwind.config.js`
2. 在 `src/style.css` 中使用 `@theme` 指令
3. 参考 **[tailwind-v4-theme.css](../../src/assets/tailwind-v4-theme.css)** 的示例

```css
@theme {
  --color-brand: #3b82f6;
  --spacing-custom: 5rem;
}
```

---

## ⚠️ 最常见的错误

### 错误 #1: 使用独立的透明度类（90% 的问题）

```html
<!-- ❌ 错误 (v3 语法 - 在 v4 中不工作) -->
<div class="bg-black bg-opacity-50">

<!-- ✅ 正确 (v4 斜杠语法) -->
<div class="bg-black/50">
```

**为什么**: v4 不再生成 `--tw-bg-opacity` CSS 变量

---

### 错误 #2: 修改 tailwind.config.js 添加主题

```javascript
// ❌ 不推荐 (v3 做法)
export default {
  theme: {
    extend: {
      colors: { brand: '#3b82f6' }
    }
  }
}
```

```css
/* ✅ 推荐 (v4 做法) */
@theme {
  --color-brand: #3b82f6;
}
```

---

### 错误 #3: 使用旧的 CSS 导入语法

```css
/* ❌ 旧语法 (v3) */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ✅ 新语法 (v4 - 项目已使用) */
@import "tailwindcss";
```

---

## 🔧 快速命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 验证 Tailwind 配置
npx tailwindcss --help

# 查看项目规则
cat .cursorrules

# 清理并重启
npm run dev:clean
```

---

## 📊 项目配置概览

| 配置项 | 文件位置 | 状态 |
|-------|---------|------|
| PostCSS 配置 | `postcss.config.js` | ✅ 使用 v4 插件 |
| CSS 入口 | `src/style.css` | ✅ 使用新语法 |
| 传统配置 | `tailwind.config.js` | ✅ 兼容保留 |
| @theme 示例 | `src/assets/tailwind-v4-theme.css` | ✅ 可选启用 |
| Cursor 规则 | `.cursorrules` | ✅ 已配置 |
| Windsurf 规则 | `.windsurfrules` | ✅ 已配置 |
| Copilot 指南 | `.github/copilot-instructions.md` | ✅ 已更新 |

---

## 🎓 学习路径

### 初级（必须掌握）
- [x] 斜杠语法替代 `*-opacity-*`
- [x] 使用 `@import "tailwindcss"`
- [x] 了解项目自定义颜色

### 中级（推荐掌握）
- [ ] `@theme` 指令的使用
- [ ] CSS 变量与任意值
- [ ] 响应式主题配置

### 高级（深入理解）
- [ ] v4 引擎工作原理
- [ ] 性能优化技巧
- [ ] 自定义插件开发

---

## 🔗 外部资源

- [Tailwind CSS v4 官方文档](https://tailwindcss.com/docs/v4-beta)
- [升级指南](https://tailwindcss.com/docs/upgrade-guide)
- [@theme 指令文档](https://tailwindcss.com/docs/theme)
- [GitHub 讨论区](https://github.com/tailwindlabs/tailwindcss/discussions)

---

## 📝 文档更新日志

| 日期 | 文档 | 变更 |
|------|------|------|
| 2025-11-29 | 所有文档 | 初始创建，完整 v4 配置 |
| 2025-11-29 | `.cursorrules` | AI 规则文件创建 |
| 2025-11-29 | `copilot-instructions.md` | 添加 v4 语法警告 |

---

## 💡 贡献指南

如果发现文档问题或有改进建议：

1. 检查 [TAILWIND_V4_SUMMARY.md](../archive/migrations/TAILWIND_V4_SUMMARY.md) 是否已记录
2. 更新相关文档
3. 在文档末尾添加更新日期

---

## 📞 获取帮助

如果遇到问题：

1. **语法错误**: 查看 [快速参考 - 常见问题](./TAILWIND_V4_QUICK_REFERENCE.md#常见问题)
2. **配置问题**: 查看 [验证报告](../archive/migrations/TAILWIND_V4_VERIFICATION.md)
3. **AI 生成错误代码**: 使用 [AI Prompt 模板](./TAILWIND_V4_AI_PROMPT.md) 纠正
4. **深入理解**: 阅读 [迁移指南](../archive/migrations/TAILWIND_V4_MIGRATION.md)

---

**维护者**: GitHub Copilot  
**项目**: Starverse  
**版本**: v0.0.0
