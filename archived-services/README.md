# Archived Services

本目录包含已被 TypeScript 版本替代的旧服务实现文件。

## 文件列表

### OpenRouterService.js
- **原路径**: `src/services/providers/OpenRouterService.js`
- **替代文件**: `src/services/providers/OpenRouterService.ts`
- **归档时间**: 2025-12-10
- **归档原因**: 已完成 TypeScript 迁移，所有功能已在 `.ts` 版本中实现

#### 迁移的功能
- ✅ `listAvailableModels()` - 获取可用模型列表
- ✅ `streamChatResponse()` - 流式聊天响应
- ✅ `supportsVision()` - 视觉支持检测
- ✅ `getModelParameters()` - 获取模型参数（新增到 TS 版本）

#### Feature Flag 备用方案
当前 `OpenRouterService.ts` 中有 Feature Flag (`USE_NEW_IMPLEMENTATION`)，当设置为 `false` 时会降级到此归档文件。
在完全确认 TypeScript 实现稳定后，可以：
1. 将 Feature Flag 设置为 `true`
2. 删除降级逻辑
3. 删除此归档文件

## 注意事项

⚠️ **请勿修改此目录中的文件**，这些文件仅作为备份和参考用途。所有新的开发和修改应在 TypeScript 版本中进行。

## 相关文档

- [类型系统迁移记录](../docs/ARCHITECTURE_REVIEW.md)
- [OpenRouter 集成文档](../docs/architecture/OPENROUTER_INTEGRATION_SUMMARY.md)
