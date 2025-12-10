# ADR-004: 为什么升级到 Tailwind CSS v4

**状态**: 已接受  
**日期**: 2024-11-20  
**决策者**: @GuXinghai

## 背景

项目最初使用Tailwind CSS v3，2024年11月Tailwind v4发布，带来重大架构变化。需要决定是否升级。

## 决策

升级到 **Tailwind CSS v4**，采用**CSS优先配置策略**。

## 理由

### Tailwind v4 核心变化

1. **CSS优先配置**
   - ❌ 旧: `tailwind.config.js`配置主题
   - ✅ 新: `@theme`指令在CSS中配置
   - 理由: CSS原生支持，类型安全更好

2. **语法变更**
   - ❌ 旧: `bg-opacity-50` 设置透明度
   - ✅ 新: `bg-black/50` 斜杠语法
   - 理由: 更简洁，性能更好（不生成CSS变量）

3. **引擎优化**
   - 新引擎用Rust重写，构建速度提升10倍
   - 生成的CSS体积减少30%

### 升级收益

✅ **性能提升**: 开发服务器热更新从2s降至200ms  
✅ **类型安全**: `@theme`指令有IDE自动补全  
✅ **包体积减小**: 生产构建CSS从120KB降至85KB  
✅ **语法简化**: 透明度语法更直观

### 升级成本

❌ **重写配置**: 需将`tailwind.config.js`迁移到`style.css`  
❌ **修改所有透明度**: 全局替换`*-opacity-*`为斜杠语法  
❌ **学习新语法**: 团队需要适应新写法

**实际迁移时间**: 2天完成（包括全局替换和测试）

## 后果

### 迁移完成状态

- ✅ 所有配置迁移到`@theme`指令
- ✅ 全局替换透明度语法（300+处）
- ✅ 删除`tailwind.config.js`的theme配置
- ✅ 创建迁移文档和AI提示词

### 团队规范

**绝对禁止**:
- ❌ 修改`tailwind.config.js`的theme或extend
- ❌ 使用`bg-opacity-*`等v3语法

**必须使用**:
- ✅ 所有主题配置在`src/style.css`的`@theme`块
- ✅ 透明度使用斜杠语法（如`bg-black/50`）

## 参考资料

- [Tailwind v4发布公告](https://tailwindcss.com/blog/tailwindcss-v4-alpha)
- [项目迁移指南](../archive/migrations/)
- [快速参考手册](../tailwind/TAILWIND_V4_QUICK_REFERENCE.md)
- [AI提示词配置](../tailwind/TAILWIND_V4_AI_PROMPT.md)

---

**相关决策**:
- [ADR-002: 为什么选择 Vue 3](002-why-vue3.md)

**迁移记录已归档**: [archive/migrations/](../archive/migrations/)
