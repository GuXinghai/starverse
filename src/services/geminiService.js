import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * 获取可用的聊天模型列表
 * 使用 Google Generative AI REST API
 * @param {string} apiKey - Google AI Studio API Key
 * @returns {Promise<string[]>} - 返回一个包含模型名称的字符串数组
 */
export async function listAvailableModels(apiKey) {
  console.log('=== geminiService: 开始获取模型列表 ===')
  console.log('1. API Key 长度:', apiKey ? apiKey.length : '未提供')
  console.log('1. API Key 前10个字符:', apiKey ? apiKey.substring(0, 10) + '...' : '无')
  
  try {
    console.log('2. 使用 REST API 获取模型列表...')
    
    // 使用 Google Generative Language REST API
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    console.log('2. 请求 URL:', url.replace(apiKey, 'API_KEY_HIDDEN'))
    
    console.log('3. 正在发送 HTTP 请求...')
    const response = await fetch(url)
    console.log('3. ✓ 收到响应，状态码:', response.status)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('3. ✗ API 请求失败，状态:', response.status)
      console.error('3. 错误响应:', errorText)
      throw new Error(`API 请求失败: ${response.status} - ${errorText}`)
    }
    
    console.log('4. 正在解析 JSON 响应...')
    const data = await response.json()
    console.log('4. ✓ JSON 解析成功')
    console.log('4. 响应数据结构:', Object.keys(data))
    console.log('4. 模型数量:', data.models ? data.models.length : 0)
    
    const chatModels = []
    console.log('5. 开始筛选支持 generateContent 的模型...')
    
    if (data.models && Array.isArray(data.models)) {
      for (const m of data.models) {
        console.log('   - 检查模型:', m.name)
        console.log('     显示名称:', m.displayName)
        console.log('     支持的方法:', m.supportedGenerationMethods)
        
        // 筛选出支持 generateContent 的模型
        if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
          console.log('     ✓ 该模型支持 generateContent，已添加')
          chatModels.push(m.name)
        } else {
          console.log('     ✗ 该模型不支持 generateContent，已跳过')
        }
      }
    } else {
      console.warn('5. ⚠️ 响应中没有 models 数组')
    }

    console.log('6. ✓ 筛选完成！')
    console.log('6. 最终聊天模型列表:', chatModels)
    console.log('6. 聊天模型数量:', chatModels.length)
    console.log('=== geminiService: 模型列表获取完成 ===')
    
    return chatModels
  } catch (error) {
    console.error('❌ geminiService: 获取模型列表时发生严重错误！')
    console.error('错误类型:', error.name)
    console.error('错误消息:', error.message)
    console.error('完整错误对象:', error)
    console.error('错误堆栈:', error.stack)
    throw error
  }
}

/**
 * 使用指定模型开启一个聊天会话
 * @param {string} apiKey - Gemini API Key
 * @param {Array} history - 聊天历史数组，格式: [{ role: 'user' | 'model', text: '内容' }]
 * @param {string} modelName - 要使用的模型名称
 * @returns {Promise<any>} - 返回一个聊天会话对象
 */
export async function startChatWithGemini(apiKey, history, modelName) {
  console.log('geminiService: 开始创建聊天会话，使用模型:', modelName)
  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: modelName })

    const chat = model.startChat({
      history: history.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      })),
      generationConfig: {
        maxOutputTokens: 2048, // 可选：最大输出 token 数
      },
    })
    
    console.log('geminiService: 聊天会话创建成功')
    return chat
  } catch (error) {
    console.error('geminiService: 开启聊天会话时出错！', error)
    throw error
  }
}

/**
 * 使用指定模型发起流式聊天
 * @param {string} apiKey - Gemini API Key
 * @param {Array} history - 聊天历史数组，格式: [{ role: 'user' | 'model', text: '内容' }]
 * @param {string} modelName - 要使用的模型名称
 * @param {string} userMessage - 用户最新一条消息
 * @param {AbortSignal} [signal] - 可选的中止信号，用于取消请求
 * @returns {AsyncIterable} - 返回流式结果的异步迭代器
 */
export async function streamChatWithGemini(apiKey, history, modelName, userMessage, signal = null) {
  console.log('geminiService: 开始流式聊天，使用模型:', modelName)
  console.log('geminiService: 是否提供中止信号:', signal ? '是' : '否')

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
      console.log('geminiService: 使用 AbortSignal 发起请求')
      // Google AI SDK 的正确方式：将 signal 作为 requestOptions 传递
      result = await model.generateContentStream(
        { contents },
        { signal }
      )
    } else {
      result = await model.generateContentStream({ contents })
    }

    console.log('geminiService: 已获取流式响应对象，准备返回 stream')
    return result.stream
  } catch (error) {
    // 检查是否是中止错误
    if (error.name === 'AbortError') {
      console.log('geminiService: 流式请求已被用户中止')
    } else {
      console.error('geminiService: 流式聊天过程中出错！', error)
    }
    throw error
  }
}

/**
 * 发送消息并获取回复
 * 
 * @param {Object} chat - startChatWithGemini 返回的聊天会话对象
 * @param {string} message - 用户消息
 * @returns {Promise<string>} AI 的回复文本
 */
export async function sendMessage(chat, message) {
  try {
    const result = await chat.sendMessage(message)
    const response = await result.response
    return response.text()
  } catch (error) {
    console.error('发送消息失败:', error)
    throw error
  }
}

/**
 * 流式发送消息（支持实时显示回复）
 * 
 * @param {Object} chat - 聊天会话对象
 * @param {string} message - 用户消息
 * @param {Function} onChunk - 接收到文本块时的回调函数
 * @returns {Promise<string>} 完整的回复文本
 */
export async function sendMessageStream(chat, message, onChunk) {
  try {
    const result = await chat.sendMessageStream(message)
    let fullText = ''
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text()
      fullText += chunkText
      if (onChunk) {
        onChunk(chunkText)
      }
    }
    
    return fullText
  } catch (error) {
    console.error('流式发送消息失败:', error)
    throw error
  }
}
