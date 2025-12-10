/**
 * Gemini AI Provider
 * 实现统一的 AI 服务接口
 * 
 * ========== 核心功能 ==========
 * 1. 封装 Google Generative AI SDK
 * 2. 支持多模态输入（文本 + 图片）
 * 3. 流式响应生成 (Server-Sent Events)
 * 4. 中断控制 (AbortSignal)
 * 
 * ========== 多模态支持 ==========
 * 数据格式转换:
 *   应用内部格式 (Message.parts):
 *     { type: 'text', text: '...' }
 *     { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
 *   
 *   ↓ 转换
 *   
 *   Google SDK 格式:
 *     { text: '...' }
 *     { inlineData: { mimeType: 'image/jpeg', data: 'BASE64_STRING' } }
 * 
 * ========== 流式处理 ==========
 * 使用 generateContentStream 方法:
 * - 逐块返回 AI 生成的文本
 * - 支持实时显示和中断
 * - 每个 chunk 包含部分生成的文本
 * 
 * ========== 错误处理 ==========
 * 常见错误类型:
 * - RESOURCE_EXHAUSTED / 429: 速率限制
 * - API_KEY_INVALID / 401: API Key 无效
 * - AbortError: 用户中断
 * 
 * @module services/providers/GeminiService
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { extractTextFromMessage } from '../../types/chat'

export const GeminiService = {
  /**
   * 检查模型是否支持视觉/图像输入
   * Gemini 的大多数模型都支持视觉
   * @param {string} modelId - 模型 ID
   * @returns {boolean} 是否支持视觉
   */
  supportsVision(modelId) {
    if (!modelId) return false
    // Gemini 1.5+ 和 2.0+ 系列都支持视觉
    // 仅 gemini-pro (1.0) 不支持图像
    return !modelId.match(/^gemini-pro$|^models\/gemini-pro$/i)
  },

  /**
   * 检查模型是否支持图像输入 (基于 input_modalities)
   * @param {Object} model - 模型对象
   * @returns {boolean}
   */
  supportsImage(model) {
    if (!model || !model.input_modalities || !Array.isArray(model.input_modalities)) {
      return false
    }
    const modalities = model.input_modalities.map(m => String(m).toLowerCase())
    return modalities.includes('image') || modalities.includes('vision') || modalities.includes('multimodal')
  },

  /**
   * 检查模型是否支持文件输入 (基于 input_modalities)
   * @param {Object} model - 模型对象
   * @returns {boolean}
   */
  supportsFileInput(model) {
    if (!model || !model.input_modalities || !Array.isArray(model.input_modalities)) {
      return false
    }
    const modalities = model.input_modalities.map(m => String(m).toLowerCase())
    return modalities.includes('file') || modalities.includes('document') || modalities.includes('pdf')
  },

  /**
   * 获取可用的 Gemini 模型列表
   * 
   * 使用 Google Generative Language REST API 查询所有可用模型。
   * 
   * API 端点: https://generativelanguage.googleapis.com/v1beta/models
   * 
   * 筛选规则:
   * - 只返回支持 'generateContent' 方法的模型
   * - 排除嵌入 (embedding) 和调谐 (tuning) 模型
   * 
   * @param {string} apiKey - Google AI Studio API Key
   * @returns {Promise<string[]>} - 模型名称数组 (models/gemini-xxx 格式)
   * @throws {Error} API 请求失败或 API Key 无效
   * 
   * @example
   * const models = await GeminiService.listAvailableModels(apiKey)
   * // ['models/gemini-2.0-flash-exp', 'models/gemini-1.5-pro', ...]
   */
  async listAvailableModels(apiKey) {
    console.log('=== GeminiService: 开始获取模型列表 ===')
    console.log('1. API Key 长度:', apiKey ? apiKey.length : '未提供')
    
    try {
      // 使用 Google Generative Language REST API
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      console.log('2. 请求 URL:', url.replace(apiKey, 'API_KEY_HIDDEN'))
      
      const response = await fetch(url)
      console.log('3. ✓ 收到响应，状态码:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('3. ✗ API 请求失败，状态:', response.status)
        console.error('3. 错误响应:', errorText)
        throw new Error(`API 请求失败: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log('4. ✓ JSON 解析成功，模型数量:', data.models ? data.models.length : 0)
      
      const chatModels = []
      
      if (data.models && Array.isArray(data.models)) {
        for (const m of data.models) {
          // 筛选出支持 generateContent 的模型
          if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
            console.log('   ✓ 添加模型:', m.name)
            chatModels.push(m.name)
          }
        }
      }

      console.log('5. ✓ 最终聊天模型列表:', chatModels)
      console.log('=== GeminiService: 模型列表获取完成 ===')
      
      return chatModels
    } catch (error) {
      console.error('❌ GeminiService: 获取模型列表失败！', error)
      throw error
    }
  },

  /**
   * 流式发送消息并获取回复
   * 
   * ========== 流式处理 ==========
   * 使用 generateContentStream 方法逐块返回 AI 生成的文本：
   * 1. 创建 Google Generative AI 实例
   * 2. 转换消息历史为 Google SDK 格式
   * 3. 调用 generateContentStream 启动流式生成
   * 4. 使用 for await...of 逐块 yield 文本
   * 
   * ========== 多模态支持 ==========
   * 消息历史转换:
   * - 检查每条消息的 parts 数组
   * - 文本 part: { type: 'text' } → { text: '...' }
   * - 图片 part: { type: 'image_url' } → { inlineData: { mimeType, data } }
   * - 图片解析: data:image/jpeg;base64,XXX → { mimeType: 'image/jpeg', data: 'XXX' }
   * 
   * ========== 中断控制 ==========
   * 支持 AbortSignal:
   * - 用户可以中断正在进行的生成
   * - signal.abort() 触发 AbortError
   * - 捕获 AbortError 并记录日志，不弹出错误提示
   * 
   * ========== 错误处理 ==========
   * 速率限制 (429 / RESOURCE_EXHAUSTED):
   * - 检测错误消息中的关键词
   * - 抛出友好的中文错误信息
   * 
   * 认证错误 (401 / API_KEY_INVALID):
   * - 提示用户检查 API Key 配置
   * 
   * 其他错误:
   * - 记录详细日志并抛出
   * 
   * @param {string} apiKey - Gemini API Key
   * @param {Array} history - 聊天历史（多模态 Message[]）
   * @param {string} modelName - 模型名称
   * @param {string} userMessage - 用户消息文本（空字符串时不添加新消息）
   * @param {Object} [options] - 可选参数
   * @param {AbortSignal} [options.signal] - 中止信号
   * @returns {AsyncIterable<string>} - 流式响应的异步迭代器
   * @throws {Error} API 请求失败或认证错误
   * 
   * 🔧 特殊处理:
   * - userMessage 为空时，只使用历史消息（用于重新生成）
   * - parts 数组为空时，回退到 extractTextFromMessage
   * 
   * @example
   * for await (const text of GeminiService.streamChatResponse(apiKey, history, model, message, { signal })) {
   *   console.log(text)  // 逐块输出
   * }
   */
  async* streamChatResponse(apiKey, history, modelName, userMessage, options = {}) {
    console.log('GeminiService: 开始流式聊天，使用模型:', modelName)
    const signal = options?.signal ?? null
    
    // 🔍 DEBUG: 检查图像生成配置
    if (options?.imageConfig) {
      console.warn('GeminiService: 收到 imageConfig 但当前实现尚未支持图像生成参数', options.imageConfig)
    }
    
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: modelName })

      // 转换历史消息：Message[] → Google SDK 格式
      const formattedHistory = (history || []).map((msg) => {
        let parts = []
        
        // 如果消息有 parts 数组，转换每个 part
        if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
          parts = msg.parts.map(part => {
            if (part.type === 'text') {
              // 文本 part
              return { text: part.text }
            } else if (part.type === 'image_url') {
              // 图像 part：转换 data URI 为 Google SDK 格式
              // data:image/jpeg;base64,XXXXX → { inlineData: { mimeType: 'image/jpeg', data: 'XXXXX' } }
              const dataUri = part.image_url.url
              const matches = dataUri.match(/^data:(image\/[a-z]+);base64,(.+)$/i)
              
              if (matches) {
                return {
                  inlineData: {
                    mimeType: matches[1],  // 'image/jpeg', 'image/png', etc.
                    data: matches[2]        // base64 字符串（不含前缀）
                  }
                }
              } else {
                console.warn('⚠️ 无效的图像 data URI 格式:', dataUri.substring(0, 50))
                return null
              }
            }
            return null
          }).filter(Boolean)
        } else {
          // 回退：纯文本消息
          parts = [{ text: extractTextFromMessage(msg) }]
        }
        
        return {
          role: msg.role,
          parts
        }
      })

      // 构建请求内容
      // 🔧 修复：只有当 userMessage 有实际内容时才添加新的用户消息
      // 重新生成回复时，userMessage 为空字符串，不应添加
      let contents
      if (userMessage && userMessage.trim()) {
        contents = [
          ...formattedHistory,
          {
            role: 'user',
            parts: [{ text: userMessage }]
          }
        ]
        console.log('GeminiService: 添加新用户消息:', userMessage.substring(0, 50))
      } else {
        contents = formattedHistory
        console.log('GeminiService: 未添加新用户消息（使用历史记录）')
      }

      console.log('GeminiService: 最终请求包含', contents.length, '条消息')

      // 根据是否有 signal 来调用不同的方法
      let result
      if (signal) {
        console.log('GeminiService: 使用 AbortSignal 发起请求')
        result = await model.generateContentStream(
          { contents },
          { signal }
        )
      } else {
        result = await model.generateContentStream({ contents })
      }

      console.log('GeminiService: 已获取流式响应对象，开始输出 tokens')
      
      // 逐块返回文本
      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) {
          yield text
        }
      }
      
      console.log('GeminiService: 流式响应完成')

      // 流结束后获取 usage
      const finalResponse = await result.response
      if (finalResponse.usageMetadata) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: finalResponse.usageMetadata.promptTokenCount,
            completionTokens: finalResponse.usageMetadata.candidatesTokenCount,
            totalTokens: finalResponse.usageMetadata.totalTokenCount
          }
        }
      }
    } catch (error) {
      // ========== 错误分类处理 ==========
      
      // 中断错误：用户主动取消
      if (error.name === 'AbortError') {
        console.log('GeminiService: 流式请求已被用户中止')
      } else {
        const errorMessage = error.message || String(error)
        
        // 速率限制错误 (429 / RESOURCE_EXHAUSTED)
        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          console.error('GeminiService: 速率限制错误')
          throw new Error('Gemini 速率限制：请求过于频繁，请稍后重试')
        }
        
        // 认证错误 (401 / API_KEY_INVALID)
        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('401')) {
          throw new Error('Gemini 认证失败：API Key 无效，请检查设置')
        }
        
        console.error('GeminiService: 流式聊天出错！', error)
      }
      throw error
    }
  }
}
