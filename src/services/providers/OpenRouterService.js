/**
 * OpenRouter AI Provider
 * 实现统一的 AI 服务接口
 * OpenRouter 使用 OpenAI 兼容的 API 格式
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export const OpenRouterService = {
  /**
   * 获取可用的 OpenRouter 模型列表（完整元数据）
   * @param {string} apiKey - OpenRouter API Key
   * @param {string} baseUrl - OpenRouter Base URL (可选)
   * @returns {Promise<Array<Object>>} - 返回模型对象数组，包含完整元数据
   */
  async listAvailableModels(apiKey, baseUrl = OPENROUTER_BASE_URL) {
    console.log('=== OpenRouterService: 开始获取模型列表 ===')
    console.log('1. API Key 长度:', apiKey ? apiKey.length : '未提供')
    console.log('2. Base URL:', baseUrl)
    
    try {
      const url = `${baseUrl}/models`
      console.log('3. 请求 URL:', url)
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
          'X-Title': 'Starverse'
        }
      })
      
      console.log('4. ✓ 收到响应，状态码:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('4. ✗ API 请求失败，状态:', response.status)
        console.error('4. 错误响应:', errorText)
        throw new Error(`OpenRouter API 请求失败: ${response.status} - ${errorText}`)
      }
      
      const data = await response.json()
      console.log('5. ✓ JSON 解析成功')
      
      // OpenRouter 返回格式: { data: [{ id: 'model-id', name: 'Model Name', ... }] }
      const models = []
      
      if (data.data && Array.isArray(data.data)) {
        console.log('6. 模型总数:', data.data.length)
        
        // 提取完整模型元数据，并过滤掉不适合聊天的模型
        for (const model of data.data) {
          if (model.id) {
            const modelId = model.id
            // 过滤掉嵌入模型、图像生成模型等
            const shouldExclude = 
              modelId.includes('embedding') || 
              modelId.includes('diff') ||
              modelId.includes('stable-diffusion') ||
              modelId.includes('dall-e') ||
              modelId.includes('midjourney') ||
              modelId.includes('whisper') ||
              modelId.includes('tts')
            
            if (!shouldExclude) {
              // 提取模型系列（从 ID 中推断）
              const series = this._extractModelSeries(modelId)
              
              // 构建标准化的模型对象
              const modelObject = {
                id: model.id,
                name: model.name || model.id,
                description: model.description || '',
                context_length: model.context_length || 0,
                pricing: {
                  prompt: parseFloat(model.pricing?.prompt) || 0,
                  completion: parseFloat(model.pricing?.completion) || 0,
                  image: parseFloat(model.pricing?.image) || 0,
                  request: parseFloat(model.pricing?.request) || 0
                },
                top_provider: model.top_provider || {},
                architecture: model.architecture || {},
                // 输入模态性（文本、图像、音频等）
                input_modalities: this._extractInputModalities(model),
                // 模型系列
                series: series,
                // 原始数据保留，便于未来扩展
                _raw: model
              }
              
              models.push(modelObject)
            }
          }
        }
        
        console.log('7. ✓ 过滤后的模型数量:', models.length)
        console.log('7. 前 3 个模型示例:', models.slice(0, 3).map(m => ({
          id: m.id,
          name: m.name,
          context_length: m.context_length,
          series: m.series
        })))
      } else {
        console.warn('6. ⚠️ 响应中没有 data 数组')
      }
      
      console.log('=== OpenRouterService: 模型列表获取完成 ===')
      return models
    } catch (error) {
      console.error('❌ OpenRouterService: 获取模型列表失败！', error)
      throw error
    }
  },

  /**
   * 从模型 ID 中提取模型系列
   * @private
   */
  _extractModelSeries(modelId) {
    const id = modelId.toLowerCase()
    if (id.includes('gpt')) return 'GPT'
    if (id.includes('claude')) return 'Claude'
    if (id.includes('gemini')) return 'Gemini'
    if (id.includes('llama')) return 'Llama'
    if (id.includes('mistral')) return 'Mistral'
    if (id.includes('qwen')) return 'Qwen'
    if (id.includes('deepseek')) return 'DeepSeek'
    if (id.includes('command')) return 'Command'
    if (id.includes('phi')) return 'Phi'
    if (id.includes('mixtral')) return 'Mixtral'
    return 'Other'
  },

  /**
   * 提取输入模态性
   * @private
   */
  _extractInputModalities(model) {
    const modalities = ['text'] // 默认支持文本
    
    // 检查描述或名称中是否包含多模态关键词
    const description = (model.description || '').toLowerCase()
    const name = (model.name || '').toLowerCase()
    const id = (model.id || '').toLowerCase()
    
    const combinedText = `${description} ${name} ${id}`
    
    if (combinedText.includes('vision') || combinedText.includes('image') || combinedText.includes('multimodal')) {
      modalities.push('image')
    }
    
    if (combinedText.includes('audio')) {
      modalities.push('audio')
    }
    
    return modalities
  },

  /**
   * 流式发送消息并获取回复
   * @param {string} apiKey - OpenRouter API Key
   * @param {Array} history - 聊天历史 [{ role: 'user' | 'model', text: '内容' }]
   * @param {string} modelName - 模型 ID (如 'openai/gpt-4o')
   * @param {string} userMessage - 用户消息
   * @param {string} baseUrl - OpenRouter Base URL
   * @param {AbortSignal} [signal] - 可选的中止信号
   * @returns {AsyncIterable} - 流式响应的异步迭代器
   */
  async* streamChatResponse(apiKey, history, modelName, userMessage, baseUrl = OPENROUTER_BASE_URL, signal = null) {
    console.log('OpenRouterService: 开始流式聊天，使用模型:', modelName)
    console.log('OpenRouterService: Base URL:', baseUrl)
    
    try {
      // 转换消息格式：role 从 'model' 转为 'assistant'
      const messages = (history || []).map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.text
      }))
      
      // 添加用户的新消息
      messages.push({
        role: 'user',
        content: userMessage
      })
      
      console.log('OpenRouterService: 消息历史长度:', messages.length)
      
      const url = `${baseUrl}/chat/completions`
      const requestBody = {
        model: modelName,
        messages: messages,
        stream: true
      }
      
      console.log('OpenRouterService: 正在发送请求到:', url)
      
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
          'X-Title': 'Starverse'
        },
        body: JSON.stringify(requestBody)
      }
      
      // 如果提供了中止信号，添加到选项中
      if (signal) {
        fetchOptions.signal = signal
        console.log('OpenRouterService: 已附加 AbortSignal')
      }
      
      const response = await fetch(url, fetchOptions)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('OpenRouterService: API 请求失败，状态:', response.status)
        console.error('OpenRouterService: 错误响应:', errorText)
        
        // 特殊处理速率限制 (429 Too Many Requests)
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const waitTime = retryAfter ? `${retryAfter} 秒` : '一段时间'
          throw new Error(`OpenRouter 速率限制：请求过于频繁，请等待 ${waitTime} 后重试`)
        }
        
        // 特殊处理认证错误 (401/403)
        if (response.status === 401 || response.status === 403) {
          throw new Error('OpenRouter 认证失败：API Key 无效或已过期，请检查设置')
        }
        
        throw new Error(`OpenRouter API 请求失败: ${response.status} - ${errorText}`)
      }
      
      console.log('OpenRouterService: ✓ 收到响应，开始处理流式数据')
      
      // 处理流式响应 (Server-Sent Events)
      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      const MAX_BUFFER_SIZE = 10 * 1024 // 10KB 缓冲区限制
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          console.log('OpenRouterService: 流式响应完成')
          break
        }
        
        // 解码数据块
        buffer += decoder.decode(value, { stream: true })
        
        // 防止恶意超长数据导致内存溢出
        if (buffer.length > MAX_BUFFER_SIZE) {
          console.error('OpenRouterService: 缓冲区超过限制，可能是恶意数据或网络异常')
          throw new Error('SSE 缓冲区溢出，数据异常')
        }
        
        // 按行分割
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整的行
        
        for (const line of lines) {
          const trimmedLine = line.trim()
          
          // 跳过空行和注释
          if (!trimmedLine || trimmedLine.startsWith(':')) {
            continue
          }
          
          // SSE 格式: "data: {...}"
          if (trimmedLine.startsWith('data:')) {
            const jsonStr = trimmedLine.slice(5).trim()
            
            // OpenRouter 发送 "[DONE]" 标记流结束
            if (jsonStr === '[DONE]') {
              console.log('OpenRouterService: 收到 [DONE] 标记')
              return
            }
            
            try {
              const chunk = JSON.parse(jsonStr)
              
              // 提取 content delta
              const delta = chunk.choices?.[0]?.delta
              const content = delta?.content
              
              if (content) {
                yield content
              }
            } catch (parseError) {
              console.warn('OpenRouterService: JSON 解析失败:', parseError.message)
              console.warn('OpenRouterService: 原始数据:', jsonStr)
            }
          }
        }
      }
      
      console.log('OpenRouterService: 流式输出完成')
    } catch (error) {
      // 检查是否是中止错误
      if (error.name === 'AbortError') {
        console.log('OpenRouterService: 流式请求已被用户中止')
      } else {
        console.error('OpenRouterService: 流式聊天出错！', error)
      }
      throw error
    }
  }
}
