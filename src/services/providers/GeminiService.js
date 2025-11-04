/**
 * Gemini AI Provider
 * 实现统一的 AI 服务接口
 * 
 * 🔄 多模态支持：
 * - Gemini 模型天然支持多模态
 * - 自动转换图像 data URI 为 Google SDK 的 inlineData 格式
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
   * 获取可用的 Gemini 模型列表
   * @param {string} apiKey - Google AI Studio API Key
   * @returns {Promise<string[]>} - 返回模型名称数组
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
   * 🔄 多模态支持：
   * - 接受包含 parts 数组的消息历史
   * - 自动转换图像 data URI 为 Google SDK 格式
   * - 支持文本和图像混合内容
   * 
   * @param {string} apiKey - Gemini API Key
   * @param {Array} history - 聊天历史（多模态 Message[]）
   * @param {string} modelName - 模型名称
   * @param {string} userMessage - 用户消息文本
   * @param {AbortSignal} [signal] - 可选的中止信号
   * @returns {AsyncIterable} - 流式响应的异步迭代器
   */
  async* streamChatResponse(apiKey, history, modelName, userMessage, options = {}) {
    console.log('GeminiService: 开始流式聊天，使用模型:', modelName)
    const signal = options?.signal ?? null
    
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
    } catch (error) {
      // 检查是否是中止错误
      if (error.name === 'AbortError') {
        console.log('GeminiService: 流式请求已被用户中止')
      } else {
        // 检查是否是速率限制错误 (Gemini 返回 429 或 RESOURCE_EXHAUSTED)
        const errorMessage = error.message || String(error)
        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
          console.error('GeminiService: 速率限制错误')
          throw new Error('Gemini 速率限制：请求过于频繁，请稍后重试')
        }
        
        // 检查是否是认证错误
        if (errorMessage.includes('API_KEY_INVALID') || errorMessage.includes('401')) {
          throw new Error('Gemini 认证失败：API Key 无效，请检查设置')
        }
        
        console.error('GeminiService: 流式聊天出错！', error)
      }
      throw error
    }
  }
}
