# Starverse 命名与大小写约定（精简版）

## 通用
- 变量、函数、方法：`camelCase`
- 类、组件（包括 Vue/React/服务）：`PascalCase`
- 只有常量、配置、枚举项才使用 `UPPER_SNAKE_CASE`
- provider、model、role 这类字符串 ID 不直接写字面量；统一定义在常量里，通过导出的类型暴露，避免手写 `'Openrouter'` 这类易出错的值
- 项目里尽量把“意图明确”的名称写清楚，避免 `data`, `info`, `thing` 这种模糊词

## Provider 相关专用约定
- 对外展示的 provider 名称（UI/文案/提示词）保持 `OpenRouter` 这种 PascalCase 写法
- 运行时 providerId（用于 capability、路由、存库等）统一为 `'openrouter'` 这样全小写的字面量
- 环境变量前缀：`OPENROUTER_...`、`OPENAI_...`、`ANTHROPIC_...` 等，确保明确归属
- 任一 Provider 相关代码中都必须通过 `PROVIDERS.OPENROUTER` 访问 ID，禁止手动写 `'openrouter'`、`'Openrouter'` 等
- Provider 名称变更后只需维护一处常量，TypeScript 会自动捕捉到其他地方的类型错误

## 提示词与 Agent 参考
- 所有 Agent 提示词都要引用本页的 “命名与大小写” 规则，确保 AI 在统一规则宇宙中工作
- 如果提示词中需要 provider ID、常量字段，直接引用 `PROVIDERS` 对象或 `ProviderId` 类型；不允许在 prompt 里写混乱的大小写
- 任何新的约定都应同步更新本页，保持文档的“单一真相”

## 参考实现（TypeScript）
- 见 `src/constants/providers.ts`，用 `as const` + 字面量联合生成“单一真相”，让 TypeScript 替我们锁住 ID 值
