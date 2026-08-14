# 图像生成功能检查与调试指南

## 1. 功能现状概览

### UI 层 (UI Layer)
- **状态**: ✅ 完善 (已修复状态误判 Bug)
- **组件**: `ChatView.vue` 集成了 `useImageGeneration` Composable。
- **功能**: 
  - 提供图像生成开关按钮。
  - 支持长宽比 (Aspect Ratio) 选择 (1:1, 16:9, 9:16 等)。
  - 按钮显示逻辑依赖于 `modelSupportsImageOutput`。
- **修复记录**: 
  - 之前 `ChatView.vue` 错误地将对话生命周期状态 (`draft`, `active`) 传给 `useImageGeneration`，导致系统误判为 "生成中" 而禁止切换开关。
  - 现已修正为传递真实的生成状态 (`idle` / `generating`)。

### 状态管理 (State Management)
- **状态**: ✅ 完善
- **模块**: `useImageGeneration.ts`
- **逻辑**: 
  - 管理 `imageGenerationEnabled` 和 `imageAspectRatioIndex`。
  - 通过 `modelSupportsImageOutput` 计算属性控制 UI 显示。
  - 仅允许在支持 `image` 输出模态的模型上启用。

### 服务层 (Service Layer)

#### OpenRouter Service
- **状态**: ⚠️ 部分完善
- **支持**: 
  - 代码中已包含将 `imageConfig` (如 `aspect_ratio`) 转换为 `requestBody.image_config` 的逻辑。
  - 支持流式接收 `image` 类型的 chunk。
- **限制**: 
  - `listAvailableModels` 方法目前**主动过滤**了 `dall-e`, `stable-diffusion`, `midjourney` 等专用图像生成模型。
  - 用户只能通过支持多模态（文本+图像生成）的模型（如 Gemini via OpenRouter）来使用此功能。

#### Gemini Service (Google SDK)
- **状态**: ❌ 未完善
- **限制**: 
  - `streamChatResponse` 方法虽然接收 `imageConfig` 参数，但**未传递**给 Google Generative AI SDK。
  - Google SDK 的 `generateContentStream` 主要用于文本生成，图像生成通常需要使用 Imagen 模型或特定的 API 调用方式。
  - 目前 Gemini Service 仅支持视觉**输入** (Vision Input)，不支持图像**输出** (Image Output)。

## 2. 调试日志 (已添加)

为了帮助排查问题，已在以下位置添加了调试日志：

1.  **`src/services/providers/GeminiService.js`**:
    - 在 `streamChatResponse` 中添加了检查：如果收到 `imageConfig`，会打印警告 `GeminiService: 收到 imageConfig 但当前实现尚未支持图像生成参数`。

2.  **`src/services/providers/OpenRouterService.js`**:
    - 在 `listAvailableModels` 中添加了日志：`OpenRouterService: 排除图像生成模型: [modelId]`，用于确认哪些模型被隐藏。
    - 确认已存在日志：`OpenRouterService: 请求 image_config = ...`，用于验证请求参数。

3.  **`src/composables/useImageGeneration.ts`**:
    - 现有的 `console.log` 详细记录了 `canShowImageGenerationButton` 的计算过程和 `toggleImageGeneration` 的状态变化。

## 3. 如何测试图像生成

1.  **使用 OpenRouter**:
    - 确保 API Key 有效。
    - 选择一个支持图像生成的模型（目前由于过滤规则，可能很难找到，除非使用 `google/gemini-pro-vision` 等且 OpenRouter 声明其支持 image output）。
    - 如果需要测试 DALL-E，需修改 `OpenRouterService.js` 中的过滤逻辑，移除对 `dall-e` 的过滤。

2.  **观察控制台**:
    - 打开开发者工具 (F12)。
    - 搜索 `[ImageGen]` 查看 UI 状态日志。
    - 搜索 `OpenRouterService` 查看请求参数日志。

## 4. 建议改进

1.  **OpenRouterService**: 
    - 考虑放开对 `dall-e` 等模型的过滤，或者创建一个专门的 "图像生成" 模式。
    - 验证 OpenRouter 对 Gemini 模型的 `output_modalities` 返回值是否包含 `image`。

2.  **GeminiService**:
    - 如果需要支持原生 Gemini 图像生成，需调研 Google AI Studio 的 Imagen API 集成方式，可能需要独立的 Service 方法。

3.  **UI**:
    - 当用户选择不支持图像生成的模型时，提供更明确的提示（目前是隐藏按钮或显示 Tooltip）。
