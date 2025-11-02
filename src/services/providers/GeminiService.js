/**
 * Gemini AI Provider
 * 实现统一的 AI 服务接口
 */

import { GoogleGenerativeAI } from '@google/generative-ai'

export const GeminiService = {
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
   * @param {string} apiKey - Gemini API Key
   * @param {Array} history - 聊天历史 [{ role: 'user' | 'model', text: '内容' }]
   * @param {string} modelName - 模型名称
   * @param {string} userMessage - 用户消息
   * @param {AbortSignal} [signal] - 可选的中止信号
   * @returns {AsyncIterable} - 流式响应的异步迭代器
   */
  async* streamChatResponse(apiKey, history, modelName, userMessage, signal = null) {
    console.log('GeminiService: 开始流式聊天，使用模型:', modelName)
    
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: modelName })

      const formattedHistory = (history || []).map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }))

      // 构建请求内容
      const contents = [
        ...formattedHistory,
        {
          role: 'user',
          parts: [{ text: userMessage }]
        }
      ]

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
