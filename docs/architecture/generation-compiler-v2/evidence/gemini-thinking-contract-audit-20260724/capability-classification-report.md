# Gemini GenerateContent Thinking capability classification

本表由 `src/next/provider/gemini/geminiThinkingPolicy.ts` 对本地 v1beta 原始审计 fixture 重新解析生成；不重新请求 Models API，不把本表当作新的 REST 原始证据。

- Fixture: `model-audit.json`，筛选 `supportedGenerationMethods` 包含 `generateContent` 的模型
- 原始证据时间：2026-07-23T20:33:38.645Z
- 数量：41 个 GenerateContent；supported 31；unsupported 10；level 8；budget 4；default-only 19
- 判定：只有原始 own-property `thinking === true` 才是 supported；missing 不等于 false

## 逐模型分类

| modelId | thinkingOwnProperty | thinkingRawValue/type | thinkingSupported | controlKind | matchedRule | defaultDisplay | allowedLevels | budgetRange | allowOff | allowDynamic |
|---|---:|---|---|---|---|---|---|---|---:|---:|
| antigravity-preview-05-2026 | false | missing | unsupported | — | — | — | — | — | false | false |
| deep-research-max-preview-04-2026 | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| deep-research-preview-04-2026 | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| deep-research-pro-preview-12-2025 | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-2.0-flash | false | missing | unsupported | — | — | — | — | — | false | false |
| gemini-2.0-flash-001 | false | missing | unsupported | — | — | — | — | — | false | false |
| gemini-2.0-flash-lite | false | missing | unsupported | — | — | — | — | — | false | false |
| gemini-2.0-flash-lite-001 | false | missing | unsupported | — | — | — | — | — | false | false |
| gemini-2.5-computer-use-preview-10-2025 | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-2.5-flash | true | true (boolean) | supported | budget | gemini-2.5-flash | Default (dynamic) | — | 1..24576 | true | true |
| gemini-2.5-flash-image | false | missing | unsupported | — | — | — | — | — | false | false |
| gemini-2.5-flash-lite | true | true (boolean) | supported | budget | gemini-2.5-flash-lite | Default (off) | — | 512..24576 | true | true |
| gemini-2.5-flash-preview-tts | false | missing | unsupported | — | — | — | — | — | false | false |
| gemini-2.5-pro | true | true (boolean) | supported | budget | gemini-2.5-pro | Default (dynamic) | — | 128..32768 | false | true |
| gemini-2.5-pro-preview-tts | false | missing | unsupported | — | — | — | — | — | false | false |
| gemini-3-flash-preview | true | true (boolean) | supported | level | gemini-3-flash | Default (high) | minimal, low, medium, high | — | false | false |
| gemini-3-pro-image | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-3-pro-image-preview | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-3-pro-preview | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-3.1-flash-image | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-3.1-flash-image-preview | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-3.1-flash-lite | true | true (boolean) | supported | level | gemini-3.1-flash-lite | Default (minimal) | minimal, low, medium, high | — | false | false |
| gemini-3.1-flash-lite-image | true | true (boolean) | supported | level | gemini-3.1-flash-lite-image | Default (minimal) | minimal, high | — | false | false |
| gemini-3.1-flash-lite-preview | true | true (boolean) | supported | level | gemini-3.1-flash-lite | Default (minimal) | minimal, low, medium, high | — | false | false |
| gemini-3.1-flash-tts-preview | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-3.1-pro-preview | true | true (boolean) | supported | level | gemini-3.1-pro | Default (high) | low, medium, high | — | false | false |
| gemini-3.1-pro-preview-customtools | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-3.5-flash | true | true (boolean) | supported | level | gemini-3.5-flash | Default (medium) | minimal, low, medium, high | — | false | false |
| gemini-3.5-flash-lite | true | true (boolean) | supported | level | gemini-3.5-flash-lite | Default (minimal) | minimal, low, medium, high | — | false | false |
| gemini-3.6-flash | true | true (boolean) | supported | level | gemini-3.6-flash | Default (medium) | minimal, low, medium, high | — | false | false |
| gemini-flash-latest | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-flash-lite-latest | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-omni-flash-preview | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-pro-latest | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-robotics-er-1.5-preview | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemini-robotics-er-1.6-preview | true | true (boolean) | supported | budget | gemini-robotics-er-1.6 | Default (dynamic) | — | 1..24576 | true | true |
| gemma-4-26b-a4b-it | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| gemma-4-31b-it | true | true (boolean) | supported | default-only | — | — | — | — | false | false |
| lyria-3-clip-preview | false | missing | unsupported | — | — | — | — | — | false | false |
| lyria-3-pro-preview | false | missing | unsupported | — | — | — | — | — | false | false |
| nano-banana-pro-preview | true | true (boolean) | supported | default-only | — | — | — | — | false | false |

## default-only

- `deep-research-max-preview-04-2026`
- `deep-research-preview-04-2026`
- `deep-research-pro-preview-12-2025`
- `gemini-2.5-computer-use-preview-10-2025`
- `gemini-3-pro-image`
- `gemini-3-pro-image-preview`
- `gemini-3-pro-preview`
- `gemini-3.1-flash-image`
- `gemini-3.1-flash-image-preview`
- `gemini-3.1-flash-tts-preview`
- `gemini-3.1-pro-preview-customtools`
- `gemini-flash-latest`
- `gemini-flash-lite-latest`
- `gemini-omni-flash-preview`
- `gemini-pro-latest`
- `gemini-robotics-er-1.5-preview`
- `gemma-4-26b-a4b-it`
- `gemma-4-31b-it`
- `nano-banana-pro-preview`

## 说明

- `dynamic` 只出现在 budget 模型的离散哨兵能力中；level 模型的 dynamic 行为由 `highIsDynamic` 表达，不构造 `thinkingLevel: "dynamic"`。
- 本表的 `defaultDisplay` 只描述 UI 文案；Default 在 snapshot 中保持 unset，并在 prepared request 中省略 `thinkingLevel` / `thinkingBudget`。
- 未映射但原始 `thinking === true` 的模型保持 `default-only`，不会按相似模型继承控制矩阵。

