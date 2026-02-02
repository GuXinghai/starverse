# UI-Next 移除实施计划

## 概述
完全移除 `ui-next` 模块，将必要资产迁移到共享位置。

---

## 阶段 1: 资产迁移

### 1.1 迁移 useStickToBottom composable
- **源**: `src/ui-next/composables/useStickToBottom.ts`
- **目标**: `src/shared/composables/useStickToBottom.ts`
- **测试**: `src/ui-next/composables/useStickToBottom.test.ts` → `src/shared/composables/useStickToBottom.test.ts`

### 1.2 迁移 openRouterLiveStream 测试文件
- **源**: `src/ui-next/live/openRouterLiveStream.test.ts`
- **目标**: `src/next/live/openRouterLiveStream.test.ts`
- **源**: `src/ui-next/live/openRouterLiveStream.requireParameters.test.ts`
- **目标**: `src/next/live/openRouterLiveStream.requireParameters.test.ts`

---

## 阶段 2: 更新入口文件

### 2.1 简化 App.vue
删除 ui-next 相关代码，直接使用 ui-app。

---

## 阶段 3: 更新 Gate Scripts

### 3.1 删除 tc10-ui-next.mjs
- 从 `package.json` 的 `verify:ssot` 移除引用
- 删除脚本文件

### 3.2 更新 tc13-ui-isolation.mjs
- 从 TARGETS 数组移除 ui-next

### 3.3 更新 tc18-ui-isolation.mjs
- 从 TARGETS 数组移除 ui-next

### 3.4 更新 tc17-ui-guardrails.mjs
- 删除 `assertUiDir('src/ui-next')` 调用

---

## 阶段 4: 更新 ESLint 配置

### 4.1 清理 .eslintrc.cjs
- 删除 `src/ui-next/**` 规则块

---

## 阶段 5: 删除 ui-next 目录

### 5.1 删除整个 src/ui-next 目录

---

## 验证计划

1. **TypeScript 编译**: `npm run type-check`
2. **ESLint**: `npm run lint`
3. **单元测试**: `npm test`
4. **Gate 检查**: `npm run verify:ssot`
5. **开发服务器**: `npm run dev` 确认应用正常启动
