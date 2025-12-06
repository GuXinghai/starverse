/**
 * OpenRouter AI Provider Service
 * 
 * 功能概述：
 * - 实现统一的 AI 服务接口，遵循 OpenAI 兼容的 API 格式
 * - 支持流式聊天响应（SSE - Server-Sent Events）
 * - 支持多模态输入（文本 + 图像）
 * - 支持推理过程可视化（reasoning）
 * - 支持 Web 搜索增强
 * - 完整的错误处理和重试机制
 * 
 * 🔄 多模态支持：
 * - 支持发送包含图像的消息（Base64 或 URL）
 * - 自动检测模型是否支持视觉功能
 * - 支持自定义图像宽高比配置
 * 
 * 🧠 推理过程支持：
 * - 实时流式推理文本展示（delta.reasoning）
 * - 结构化推理数据保存（reasoning_details）
 * - 推理摘要生成（reasoning_summary）
 * 
 * 🎯 统一生成参数架构 (Phase 2):
 * - 使用 buildOpenRouterRequest() 统一构建请求参数
 * - 自动过滤不支持的采样参数（基于 model.supported_parameters）
 * - 推理参数通过 openrouterReasoningAdapter 处理
 */

import { extractTextFromMessage } from '../../types/chat'
import { buildOpenRouterRequest } from './generationAdapter'
import { PROVIDERS } from '../../constants/providers'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/**
 * 已知支持视觉/图像输入的模型 ID 模式
 * 这些模型可以处理包含图像的多模态请求
 */
const VISION_MODEL_PATTERNS = [
  // OpenAI
  /gpt-4.*vision/i,
  /gpt-4o/i,
  /gpt-4-turbo/i,
  /gpt-5/i,  // GPT-5 系列都支持多模态
  /gpt.*image/i,  // 包含 "image" 关键字的 GPT 模型
  
  // Google
  /gemini.*pro.*vision/i,
  /gemini-1\.5-pro/i,
  /gemini-1\.5-flash/i,
  /gemini-2\.0-flash/i,
  /gemini.*exp.*1206/i,
  
  // Anthropic
  /claude-3/i,
  
  // Others
  /llava/i,
  /vision/i,
  /image/i  // 通用的图像处理模型
]

const SUPPORTED_IMAGE_ASPECT_RATIOS = new Set([
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9'
])

/**
 * 深拷贝对象（优先使用原生 structuredClone）
 * 
 * 拷贝策略（按优先级）：
 * 1. structuredClone - 原生深拷贝，性能最佳，支持循环引用
 * 2. JSON 序列化 - 兼容性回退，但无法处理函数、undefined、循环引用
 * 3. 浅拷贝 - 最后的保护措施，避免抛出错误
 * 
 * @param {*} value - 要拷贝的值
 * @returns {*} 拷贝后的值
 */
function clonePlain(value) {
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value)
    }
  } catch (error) {
    // structuredClone 可能因数据类型不支持而失败，降级到 JSON 序列化
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch (parseError) {
    // JSON 序列化失败时（如循环引用），使用浅拷贝避免错误
    if (value && typeof value === 'object') {
      return { ...value }
    }
    return value
  }
}

/**
 * 【已弃用】创建推理数据聚合器
 * 现已改为流式推理输出，此函数保留用于参考
 * @deprecated 使用流式 reasoning_detail 和 reasoning_summary 块代替
 */
/*
function createReasoningAggregator() {
  const rawDetails = []
  let textBuilder = ''
  let summaryText = null

  const addText = (value) => {
    if (typeof value === 'string' && value.length > 0) {
      textBuilder += value
    }
  }

  const addDetail = (detail) => {
    if (!detail || typeof detail !== 'object') {
      return
    }
    const cloned = clonePlain(detail)
    rawDetails.push(cloned)

    if (typeof cloned.text === 'string' && cloned.type === 'reasoning.text') {
      addText(cloned.text)
    }
    if (typeof cloned.summary === 'string' && cloned.type === 'reasoning.summary' && !summaryText) {
      summaryText = cloned.summary
    }
  }

  const ingestReasoningValue = (value) => {
    if (!value) return
    if (typeof value === 'string') {
      addText(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(addDetail)
      return
    }
    if (typeof value === 'object') {
      if (Array.isArray(value.reasoning_details)) {
        value.reasoning_details.forEach(addDetail)
      }
      if (typeof value.text === 'string') {
        addText(value.text)
      }
      if (typeof value.summary === 'string' && !summaryText) {
        summaryText = value.summary
      }
    }
  }

  const ingestChoice = (choice) => {
    if (!choice || typeof choice !== 'object') {
      return
    }
    if (choice.delta) {
      if (Array.isArray(choice.delta.reasoning_details)) {
        choice.delta.reasoning_details.forEach(addDetail)
      }
      if (choice.delta.reasoning !== undefined) {
        ingestReasoningValue(choice.delta.reasoning)
      }
    }
    if (choice.message) {
      if (Array.isArray(choice.message.reasoning_details)) {
        choice.message.reasoning_details.forEach(addDetail)
      }
      if (choice.message.reasoning !== undefined) {
        ingestReasoningValue(choice.message.reasoning)
      }
    }
  }

  const ingestChunk = (chunk) => {
    if (!chunk || typeof chunk !== 'object') {
      return
    }
    const choices = Array.isArray(chunk.choices) ? chunk.choices : []
    const choiceContainsReasoning = choices.some(choice => {
      if (!choice || typeof choice !== 'object') {
        return false
      }
      const delta = choice.delta
      const message = choice.message
      return Boolean(
        (delta && (delta.reasoning !== undefined || Array.isArray(delta.reasoning_details))) ||
        (message && (message.reasoning !== undefined || Array.isArray(message.reasoning_details)))
      )
    })

    if (Array.isArray(chunk.reasoning_details) && !choiceContainsReasoning) {
      chunk.reasoning_details.forEach(addDetail)
    }
    if (chunk.reasoning !== undefined && !choiceContainsReasoning) {
      ingestReasoningValue(chunk.reasoning)
    }
    if (choices.length > 0) {
      choices.forEach(ingestChoice)
    }
  }

  const hasData = () => rawDetails.length > 0 || textBuilder.length > 0 || summaryText !== null

  const buildSanitizedDetails = () => rawDetails.map(detail => {
    const sanitized = {
      type: detail.type
    }
    if ('text' in detail && typeof detail.text === 'string') {
      sanitized.text = detail.text
    }
    if ('summary' in detail && typeof detail.summary === 'string') {
      sanitized.summary = detail.summary
    }
    if ('data' in detail && typeof detail.data === 'string') {
      sanitized.data = detail.data
    }
    if ('format' in detail && typeof detail.format === 'string') {
      sanitized.format = detail.format
    }
    if (Object.prototype.hasOwnProperty.call(detail, 'id')) {
      sanitized.id = detail.id ?? null
    }
    if (typeof detail.index === 'number') {
      sanitized.index = detail.index
    }
    if (detail.signature !== undefined) {
      sanitized.signature = detail.signature
    }
    return sanitized
  })

  const finalize = () => {
    if (!hasData()) {
      return null
    }

    const text = textBuilder.length > 0
      ? textBuilder.trim()
      : undefined

    return {
      text,
      summary: summaryText || undefined,
      details: buildSanitizedDetails(),
      rawDetails: rawDetails
    }
  }

  return {
    ingestChunk,
    finalize,
    hasData
  }
}
*/

/**
 * 安全提取 reasoning_details 用于上下文复用
 * 
 * 设计原则：
 * 1. 仅包含必要的结构化数据，不传递冗余内容
 * 2. 限制单个 detail 的大小以控制 payload 体积
 * 3. 过滤掉加密/隐藏的推理内容
 * 4. 保留关键字段：type, format, text, summary
 * 
 * @param {Object} reasoning - 推理元数据
 * @param {Object} options - 配置选项
 * @param {number} options.maxDetailSize - 单个 detail 的最大字符数 (默认 2000)
 * @param {number} options.maxTotalSize - 总大小限制 (默认 10000)
 * @returns {Array|null} - 过滤后的 reasoning_details 数组
 */
function extractReasoningDetailsForReuse(reasoning, options = {}) {
  if (!reasoning || typeof reasoning !== 'object') {
    return null
  }

  // 如果推理内容被加密/隐藏，不应回传
  if (reasoning.excluded === true) {
    console.log('[REASONING_REUSE] 推理内容已加密，跳过复用')
    return null
  }

  const maxDetailSize = options.maxDetailSize || 2000
  const maxTotalSize = options.maxTotalSize || 10000

  // 优先使用 details（已清洗），备选 rawDetails
  const sourceDetails = Array.isArray(reasoning.details) && reasoning.details.length > 0
    ? reasoning.details
    : (Array.isArray(reasoning.rawDetails) ? reasoning.rawDetails : [])

  if (sourceDetails.length === 0) {
    return null
  }

  let totalSize = 0
  const sanitizedDetails = []

  for (const detail of sourceDetails) {
    if (!detail || typeof detail !== 'object') {
      continue
    }

    // 提取关键字段
    const sanitized = {}
    
    if (typeof detail.type === 'string' && detail.type) {
      sanitized.type = detail.type
    }
    
    if (typeof detail.format === 'string' && detail.format) {
      sanitized.format = detail.format
    }
    
    // 限制 text 大小
    if (typeof detail.text === 'string' && detail.text) {
      const truncatedText = detail.text.length > maxDetailSize
        ? detail.text.substring(0, maxDetailSize) + '...'
        : detail.text
      sanitized.text = truncatedText
      totalSize += truncatedText.length
    }
    
    // 限制 summary 大小
    if (typeof detail.summary === 'string' && detail.summary) {
      const truncatedSummary = detail.summary.length > maxDetailSize
        ? detail.summary.substring(0, maxDetailSize) + '...'
        : detail.summary
      sanitized.summary = truncatedSummary
      totalSize += truncatedSummary.length
    }

    // 检查总大小限制
    if (totalSize > maxTotalSize) {
      console.log(`[REASONING_REUSE] 超过总大小限制 (${totalSize}/${maxTotalSize})，停止添加 details`)
      break
    }

    // 只添加非空 detail
    if (Object.keys(sanitized).length > 1) { // 至少有 type + 其他字段
      sanitizedDetails.push(sanitized)
    }
  }

  if (sanitizedDetails.length === 0) {
    return null
  }

  console.log(`[REASONING_REUSE] 提取了 ${sanitizedDetails.length} 个 reasoning details，总大小: ${totalSize} 字符`)
  return sanitizedDetails
}

/**
 * 检查模型是否支持推理功能
 * 
 * 检测规则：
 * - 模型 ID 包含 reasoning 关键词
 * - 常见推理模型：o1, o3, qwq, deepseek, thinking 等
 * 
 * @param {string} modelId - 模型 ID
 * @returns {boolean} - 是否支持推理
 */
function supportsReasoning(modelId) {
  if (!modelId || typeof modelId !== 'string') {
    return false
  }

  const lowerModelId = modelId.toLowerCase()
  const reasoningKeywords = [
    'o1', 'o3', 'o4',
    'reasoning',
    'r1',
    'qwq',
    'think',
    'deepseek',
    'sonnet-thinking',
    'brainstorm',
    'logic'
  ]

  return reasoningKeywords.some(keyword => lowerModelId.includes(keyword))
}

/**
 * 检查视觉/图像输入支持
 * @param {string} modelId - 模型 ID
 * @returns {boolean} 是否支持视觉
 */
function supportsVision(modelId) {
  if (!modelId) return false
  return VISION_MODEL_PATTERNS.some(pattern => pattern.test(modelId))
}

/**
 * 验证 OpenRouter 请求体格式
 * 
 * 确保请求符合 OpenRouter API 规范：
 * - messages 必须是非空数组
 * - 每条消息的 content 必须是非空数组
 * - content 项必须有 type 字段
 * - image_url 类型必须包含有效的 URL
 * - image_config 格式必须正确
 * 
 * @param {Object} body - 请求体对象
 * @throws {Error} 当格式不符合规范时抛出详细错误
 */
function validateOpenRouterRequestBody(body) {
  if (!body || typeof body !== 'object') throw new Error('请求体为空或格式不正确')
  if (!Array.isArray(body.messages)) throw new Error('请求体缺少 messages 数组')

  for (const [i, msg] of body.messages.entries()) {
    if (!msg || typeof msg !== 'object') throw new Error(`messages[${i}] 必须是对象`)

    if (!Array.isArray(msg.content) || msg.content.length === 0) {
      throw new Error(`messages[${i}].content 必须为非空数组`)
    }

    for (const [j, part] of msg.content.entries()) {
      if (!part || typeof part !== 'object') throw new Error(`messages[${i}].content[${j}] 必须是对象`)
      if (!part.type || typeof part.type !== 'string') throw new Error(`messages[${i}].content[${j}].type 缺失或无效`)

      if (part.type === 'image_url') {
        const url = part.image_url && part.image_url.url
        if (!url || typeof url !== 'string') throw new Error(`messages[${i}].content[${j}].image_url.url 缺失或无效`)
        const lower = url.toLowerCase()
        if (!(lower.startsWith('data:image/') || lower.startsWith('http://') || lower.startsWith('https://'))) {
          throw new Error(`messages[${i}].content[${j}].image_url.url 必须是 data:image/ 或 http(s):// 开头`)
        }
      }
    }
  }

  if (body.image_config !== undefined) {
    if (!body.image_config || typeof body.image_config !== 'object') {
      throw new Error('image_config 必须是对象')
    }
    const aspectRatio = body.image_config.aspect_ratio
    if (aspectRatio !== undefined && typeof aspectRatio !== 'string') {
      throw new Error('image_config.aspect_ratio 必须是字符串')
    }
  }
}

function resolveReasoningPreference(resolvedConfig) {
  if (!resolvedConfig) return null
  return {
    visibility: resolvedConfig.showReasoningContent ? 'visible' : 'hidden',
    effort: resolvedConfig.effort || 'medium',
    maxTokens: resolvedConfig.maxReasoningTokens ?? null,
    mode: resolvedConfig.controlMode || 'effort',
  }
}

function deriveReasoningPayloadFromRequest(body) {
  if (!body || typeof body !== 'object') return null
  const reasoning = {}
  if (body.reasoning && typeof body.reasoning === 'object') {
    Object.assign(reasoning, body.reasoning)
  }
  if (body.include_reasoning !== undefined) {
    reasoning.include_reasoning = body.include_reasoning
  }
  if (body.max_tokens !== undefined && reasoning.max_tokens === undefined) {
    reasoning.max_tokens = body.max_tokens
  }
  return Object.keys(reasoning).length > 0 ? reasoning : null
}


export const OpenRouterService = {
  /**
   * 检查模型是否支持视觉/图像输入
   * @param {string} modelId - 模型 ID
   * @returns {boolean} 是否支持视觉
   */
  supportsVision,

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
            
            if (shouldExclude) {
              // 🔍 DEBUG: 记录被排除的模型，以便调试图像生成支持
              if (modelId.includes('dall-e') || modelId.includes('stable-diffusion') || modelId.includes('midjourney')) {
                console.log('OpenRouterService: 排除图像生成模型:', modelId)
              }
            }
            
            if (!shouldExclude) {
              // 提取模型系列（从 ID 中推断）
              const series = this._extractModelSeries(modelId)
              
              // 解析价格：OpenRouter 返回的是每个 token 的价格（字符串），需要转换为每百万 tokens 的价格
              const parsePricePerMillion = (priceStr) => {
                if (!priceStr) return 0
                const pricePerToken = parseFloat(priceStr)
                if (isNaN(pricePerToken)) return 0
                // 转换为每百万 tokens 的价格
                return pricePerToken * 1000000
              }
              
              // 构建标准化的模型对象
              const modelObject = {
                id: model.id,
                name: model.name || model.id,
                description: model.description || '',
                context_length: model.context_length || 0,
                pricing: {
                  prompt: parsePricePerMillion(model.pricing?.prompt),
                  completion: parsePricePerMillion(model.pricing?.completion),
                  image: parsePricePerMillion(model.pricing?.image),
                  request: parsePricePerMillion(model.pricing?.request)
                },
                top_provider: model.top_provider || {},
                architecture: model.architecture || {},
                // 直接使用 API 返回的模态数据
                input_modalities: model.architecture?.input_modalities || ['text'],
                output_modalities: model.architecture?.output_modalities || ['text'],
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
          series: m.series,
          pricing: m.pricing
        })))
        
        // 打印所有 DeepSeek 模型信息
        const deepseekModels = models.filter(m => m.id.toLowerCase().includes('deepseek'))
        console.log('📊 DeepSeek 模型信息 (共 ' + deepseekModels.length + ' 个):')
        deepseekModels.forEach(m => {
          console.log('---')
          console.log('ID:', m.id)
          console.log('名称:', m.name)
          console.log('输入模态:', m.input_modalities)
          console.log('输出模态:', m.output_modalities)
          console.log('原始 architecture.input_modalities:', m._raw?.architecture?.input_modalities)
          console.log('原始 architecture.modality:', m._raw?.architecture?.modality)
        })
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
   * 获取模型支持的参数列表
   * 
   * @param {string} apiKey - OpenRouter API Key
   * @param {string} modelId - 完整的模型 ID (如 'openai/gpt-4o')
   * @param {string} baseUrl - OpenRouter Base URL (可选)
   * @param {string} provider - 可选的 provider 参数
   * @returns {Promise<Object>} - 返回包含 supported_parameters 数组的对象
   * 
   * @example
   * const info = await getModelParameters(apiKey, 'openai/gpt-4o')
   * // 返回: { model: 'openai/gpt-4o', supported_parameters: ['temperature', 'top_p', ...] }
   */
  async getModelParameters(apiKey, modelId, baseUrl = OPENROUTER_BASE_URL, provider = null) {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('modelId 必须是有效的字符串')
    }

    // 拆分模型 ID 为 author 和 slug
    // 例如: 'openai/gpt-4o' -> author='openai', slug='gpt-4o'
    const parts = modelId.split('/')
    if (parts.length !== 2) {
      throw new Error(`无效的模型 ID 格式: ${modelId}，期望格式为 'author/slug'`)
    }

    const [author, slug] = parts

    try {
      // 构建 URL
      let url = `${baseUrl}/parameters/${encodeURIComponent(author)}/${encodeURIComponent(slug)}`
      if (provider) {
        url += `?provider=${encodeURIComponent(provider)}`
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
          'X-Title': 'Starverse'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`OpenRouterService: 获取模型参数失败，状态: ${response.status}`)
        console.error('OpenRouterService: 错误响应:', errorText)
        throw new Error(`获取模型参数失败: ${response.status} - ${errorText}`)
      }

      const data = await response.json()

      // 返回格式: { data: { model: 'openai/gpt-4o', supported_parameters: [...] } }
      if (data.data) {
        return data.data
      }

      // 向后兼容：如果直接返回了参数列表
      return data
    } catch (error) {
      console.error('OpenRouterService: 获取模型参数时出错', error)
      throw error
    }
  },

  /**
   * 验证将要发送给 OpenRouter 的 requestBody 格式
   * - 每条 message 必须有 content 且为非空数组
   * - 每个 content 项必须有 type
   * - 如果 type === 'image_url'，必须有 image_url.url，且为 data: 或 http(s) URL
   */
  _validateRequestBody: null, // 占位，下面会定义独立函数并在 module 中使用

  /**
   * 从模型 ID 中提取模型系列
   * @private
   */
  _extractModelSeries(modelId) {
    const id = modelId.toLowerCase()
    
    // 检查提供商前缀
    if (id.includes('openai/') || id.includes('gpt')) return 'GPT'
    if (id.includes('anthropic/') || id.includes('claude')) return 'Claude'
    if (id.includes('google/') || id.includes('gemini')) return 'Gemini'
    if (id.includes('meta-llama/') || id.includes('llama')) return 'Llama'
    if (id.includes('mistralai/') || id.includes('mistral')) return 'Mistral'
    if (id.includes('qwen')) return 'Qwen'
    if (id.includes('deepseek')) return 'DeepSeek'
    if (id.includes('cohere/') || id.includes('command')) return 'Command'
    if (id.includes('microsoft/') || id.includes('phi')) return 'Phi'
    if (id.includes('mixtral')) return 'Mixtral'
    
    return 'Other'
  },

  /**
   * 流式发送消息并获取回复
   * 
   * 🔄 多模态支持：
   * - 接受包含 parts 数组的消息历史
   * - 自动检测并转换图像内容
   * - 仅在支持视觉的模型上发送图像
   * 
   * @param {string} apiKey - OpenRouter API Key
   * @param {Array} history - 聊天历史（多模态 Message[]）
   * @param {string} modelName - 模型 ID (如 'openai/gpt-4o')
   * @param {string} userMessage - 用户消息文本
   * @param {string} baseUrl - OpenRouter Base URL
   * @param {AbortSignal} [signal] - 可选的中止信号
   * @returns {AsyncIterable} - 流式响应的异步迭代器
   */
  async* streamChatResponse(apiKey, history, modelName, userMessage, baseUrl = OPENROUTER_BASE_URL, options = {}) {
    console.log('OpenRouterService: 开始流式聊天，使用模型:', modelName)
    console.log('OpenRouterService: Base URL:', baseUrl)
  let signal = null
  let webSearch = null
  let requestedModalities = null
  let imageConfig = null
  let generationConfig = null
  let resolvedReasoningConfig = null
  let pdfEngine = null
  let includeUsage = true
  let streaming = true
  let modelCapability = null  // 🎯 Phase 2: 模型能力对象
  let systemInstruction = null

    if (options && typeof options === 'object') {
      if ('signal' in options) {
        signal = options.signal ?? null
      }
      if ('webSearch' in options) {
        webSearch = options.webSearch
      }
      if ('modelCapability' in options) {
        modelCapability = options.modelCapability ?? null
      }
      if ('generationConfig' in options) {
        generationConfig = options.generationConfig ?? null
      }
      if ('resolvedReasoningConfig' in options) {
        resolvedReasoningConfig = options.resolvedReasoningConfig ?? null
      }
      if ('requestedModalities' in options) {
        const rawModalities = options.requestedModalities
        if (Array.isArray(rawModalities)) {
          const cleaned = rawModalities
            .map(mod => (typeof mod === 'string' ? mod.trim().toLowerCase() : ''))
            .filter(Boolean)

          if (cleaned.length > 0) {
            const normalized = cleaned.map(mod => {
              if (mod === 'vision' || mod === 'multimodal') {
                return 'image'
              }
              return mod
            })
            requestedModalities = Array.from(new Set(normalized))
          }
        }
      }
      if ('imageConfig' in options) {
        const rawConfig = options.imageConfig
        if (rawConfig && typeof rawConfig === 'object') {
          const aspectRaw = typeof rawConfig.aspect_ratio === 'string' ? rawConfig.aspect_ratio.trim() : ''
          if (aspectRaw) {
              const normalizedAspect = aspectRaw.replace(/\s+/g, '') // Normalize aspect ratio by removing whitespace
            if (SUPPORTED_IMAGE_ASPECT_RATIOS.has(normalizedAspect)) {
              imageConfig = { aspect_ratio: normalizedAspect }
            } else {
              console.warn('OpenRouterService: 忽略不受支持的 aspect_ratio 值', aspectRaw)
            }
          }
        }
      }
      if ('pdfEngine' in options) {
        const rawEngine = options.pdfEngine
        if (typeof rawEngine === 'string' && rawEngine.trim()) {
          pdfEngine = rawEngine.trim()
        }
      }
      if ('systemInstruction' in options) {
        const rawSystem = options.systemInstruction
        if (typeof rawSystem === 'string' && rawSystem.trim()) {
          systemInstruction = rawSystem.trim()
        }
      }
      if ('usage' in options) {
        const usageFlag = options.usage
        if (typeof usageFlag === 'boolean') {
          includeUsage = usageFlag
        } else if (usageFlag && typeof usageFlag === 'object' && 'include' in usageFlag) {
          includeUsage = usageFlag.include !== false
        }
      }
      if ('stream' in options) {
        streaming = options.stream !== false
      }
    } else if (options) {
      signal = options
    }

    if (!resolvedReasoningConfig && generationConfig && generationConfig.reasoning) {
      resolvedReasoningConfig = generationConfig.reasoning
    }

    const canUseReasoning =
      (modelCapability && modelCapability.reasoning && modelCapability.reasoning.supportsReasoningParam === true)
        ? true
        : supportsReasoning(modelName)
    
    try {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 📝 转换消息格式：内部格式 → OpenRouter API 格式
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 注意：此处不检查模型视觉能力，因为前端在上传图片时已验证
      // 如果消息中包含图片，说明用户已确认当前模型支持多模态输入
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const messages = (history || []).map(msg => {
        // 期望输入历史为 OpenAI 语义：'user' | 'assistant' | 'tool' | 'system'
        const role = msg.role

        let contentBlocks = []
        if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
          contentBlocks = msg.parts
            .map(part => {
              if (part.type === 'text') {
                return {
                  type: 'text',
                  text: part.text || ''
                }
              }
              if (part.type === 'image_url') {
                const imageUrl = part.image_url.url
                return {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                    detail: 'auto'
                  }
                }
              }
              if (part.type === 'file') {
                // 处理文件类型（如 PDF）
                return {
                  type: 'file',
                  file: {
                    filename: part.file.filename || 'document.pdf',
                    file_data: part.file.file_data || part.file.fileData
                  }
                }
              }
              return null
            })
            .filter(Boolean)
        } else {
          const textContent = extractTextFromMessage(msg) || ''
          contentBlocks = [
            {
              type: 'text',
              text: textContent
            }
          ]
        }

        if (contentBlocks.length === 0) {
          contentBlocks = [
            {
              type: 'text',
              text: ''
            }
          ]
        }

        const baseMessage = {
          role,
          content: contentBlocks
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 💡 Phase 3: 推理上下文复用逻辑
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 仅在模型支持推理时，将之前的 reasoning_details 回传给 API
        // 这样可以维持推理过程的连续性，对多轮对话和工具调用特别有用
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const metadata = msg.metadata
        if (metadata && metadata.reasoning && canUseReasoning) {
          // 安全提取 reasoning_details
          const reasoningDetails = extractReasoningDetailsForReuse(metadata.reasoning, {
            maxDetailSize: 2000,  // 单个 detail 最大 2000 字符
            maxTotalSize: 10000   // 总大小最大 10000 字符 (约 2500 tokens)
          })

          if (reasoningDetails && reasoningDetails.length > 0) {
            baseMessage.reasoning_details = reasoningDetails
            console.log(`[REASONING_REUSE] 为消息 #${messages.indexOf(msg) + 1} 附加了 ${reasoningDetails.length} 个 reasoning details`)
          } else if (typeof metadata.reasoning.text === 'string' && metadata.reasoning.text.trim()) {
            // 备选：如果没有 details 但有 text，使用文本摘要
            const summaryText = metadata.reasoning.text.length > 500
              ? metadata.reasoning.text.substring(0, 500) + '...'
              : metadata.reasoning.text
            baseMessage.reasoning = summaryText
            console.log(`[REASONING_REUSE] 为消息 #${messages.indexOf(msg) + 1} 附加了 reasoning 文本摘要 (${summaryText.length} 字符)`)
          }
        }

        return baseMessage
      })

      // System Instruction: prepend as standard system message
      if (systemInstruction) {
        messages.unshift({
          role: 'system',
          content: [{ type: 'text', text: systemInstruction }]
        })
      }
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🔧 消息过滤：移除空消息以符合 API 规范
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 某些提供商（如 Anthropic）要求所有消息必须有非空内容
      // 例外：最后一条 assistant 消息可以为空（用于继续生成）
      const filteredMessages = messages.filter((msg, index) => {
        // 检查是否为最后一条消息
        const isLastMessage = index === messages.length - 1
        
        // 如果是最后一条 assistant 消息，可以为空
        if (isLastMessage && msg.role === 'assistant') {
          return true
        }
        
        // 其他消息必须有非空内容
        if (!msg.content || !Array.isArray(msg.content) || msg.content.length === 0) {
          console.warn('OpenRouterService: 过滤掉空消息', { role: msg.role, index })
          return false
        }
        
        // 检查是否所有 content 都是空文本
        const hasNonEmptyContent = msg.content.some(c => {
          if (c.type === 'text') {
            return c.text && c.text.trim().length > 0
          }
          // 图片等非文本内容视为非空
          return true
        })
        
        if (!hasNonEmptyContent) {
          console.warn('OpenRouterService: 过滤掉仅包含空文本的消息', { role: msg.role, index })
          return false
        }
        
        return true
      })
      
      console.log(`OpenRouterService: 原始消息 ${messages.length} 条，过滤后 ${filteredMessages.length} 条`)
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 📨 添加新用户消息（仅在有实际内容时）
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 场景：重新生成回复时，userMessage 为空，不应重复添加用户消息
      // 兼容：支持传入 content 数组或纯文本字符串
      if (Array.isArray(userMessage)) {
        // 如果上层传入了 content 数组（兼容性），直接使用
        filteredMessages.push({ role: 'user', content: userMessage })
        console.log('OpenRouterService: 添加新用户消息（content 数组）')
      } else if (userMessage && userMessage.trim()) {
        // 只有当 userMessage 不为空时才添加
        filteredMessages.push({ role: 'user', content: [{ type: 'text', text: userMessage }] })
        console.log('OpenRouterService: 添加新用户消息（文本）:', userMessage.substring(0, 50))
      } else {
        console.log('OpenRouterService: 未添加新用户消息（userMessage 为空或仅空格）')
      }
      
      console.log('OpenRouterService: 最终消息历史长度:', filteredMessages.length)
      
      /**
       * OpenRouter 错误码对照表
       * 包含状态码名称、官方含义和典型触发原因
       */
      const OPENROUTER_ERROR_MAP = {
        400: {
          name: 'Bad Request',
          officialMeaning: 'Bad Request (invalid or missing params, CORS)',
          typicalCauses: '请求体 JSON 非法；缺少必填字段（如 model）；参数类型错误（例如本应是数组却传了字符串）；使用了该模型不支持的参数；前端浏览器直接请求 OpenRouter 触发 CORS。'
        },
        401: {
          name: 'Invalid credentials',
          officialMeaning: 'Invalid credentials (OAuth session expired, disabled/invalid API key)',
          typicalCauses: 'Authorization 头缺失或格式错误；API Key 写错、被禁用或过期；使用了错误的 Key（例如复制了 Dashboard 上的其它 Token）。'
        },
        402: {
          name: 'Payment Required',
          officialMeaning: 'Your account or API key has insufficient credits. Add more credits and retry the request.',
          typicalCauses: '账户或当前 API Key 可用 credits 不足（包括免费额已用完）；即便是 :free 结尾的免费的模型，当账户整体为负余额时也可能返回 402。'
        },
        403: {
          name: 'Forbidden',
          officialMeaning: 'Your chosen model requires moderation and your input was flagged',
          typicalCauses: '所选模型启用了内容审核，当前输入被判定违规；常见于 Anthropic / OpenAI 等安全策略比较严格的模型；error.metadata 中会包含 reasons、flagged_input 等信息。'
        },
        408: {
          name: 'Request Timeout',
          officialMeaning: 'Your request timed out',
          typicalCauses: '请求在规定时间内未完成；上游模型响应过慢、上下文过大导致推理超时、网络不稳定等都会触发。'
        },
        429: {
          name: 'Too Many Requests',
          officialMeaning: 'You are being rate limited',
          typicalCauses: '命中 OpenRouter 的请求频率限制或 DDoS 防护；免费 :free 模型有分钟 / 日调用上限；也可能是 credits 很少但短时间内请求过于密集。'
        },
        502: {
          name: 'Bad Gateway',
          officialMeaning: 'Your chosen model is down or we received an invalid response from it',
          typicalCauses: '上游模型提供方（如 OpenAI、Anthropic、DeepSeek 等）暂时不可用、返回了非预期格式或网关错误；OpenRouter 无法解析对方响应。'
        },
        503: {
          name: 'Service Unavailable',
          officialMeaning: 'There is no available model provider that meets your routing requirements',
          typicalCauses: '按当前路由策略，没有任何可用 Provider 可以提供该模型（全部宕机、被限流、地区 / 价格 / 配置不匹配等）；通常是容量或路由层问题。'
        }
      }

      /**
       * 构建标准化的 OpenRouter 错误对象
       * 
       * 将 API 返回的错误信息转换为结构化的 Error 对象，
       * 包含状态码、错误类型、重试标志等元数据，并附加 OpenRouter 标准错误信息
       * 
       * @param {Object|string|null} info - API 返回的错误信息
       * @param {number} status - HTTP 状态码
       * @param {string} fallbackMessage - 默认错误消息
       * @param {string} name - 错误类型名称
       * @returns {Error} 标准化的错误对象
       */
      const buildOpenRouterError = (info = null, status, fallbackMessage = 'OpenRouter 请求失败', name = 'OpenRouterApiError') => {
        const detail = (info && typeof info === 'object') ? info : null
        let message = fallbackMessage

        if (detail?.message && typeof detail.message === 'string') {
          message = detail.message
        } else if (typeof info === 'string' && info.trim()) {
          message = info.trim()
        }

        const errorInstance = new Error(message)
        errorInstance.name = name

        if (typeof status === 'number') {
          errorInstance.status = status
          
          // 附加 OpenRouter 标准错误信息
          const errorInfo = OPENROUTER_ERROR_MAP[status]
          if (errorInfo) {
            errorInstance.statusName = errorInfo.name
            errorInstance.officialMeaning = errorInfo.officialMeaning
            errorInstance.typicalCauses = errorInfo.typicalCauses
          }
        }

        if (detail) {
          errorInstance.openRouterError = detail
          if (detail.code) {
            errorInstance.code = detail.code
          }
          if (detail.type) {
            errorInstance.type = detail.type
          }
          if (detail.param) {
            errorInstance.param = detail.param
          }
          if (typeof detail.retryable === 'boolean') {
            errorInstance.retryable = detail.retryable
          }
          // 保存完整的 metadata 用于详细信息展示
          if (detail.metadata && typeof detail.metadata === 'object') {
            errorInstance.metadata = detail.metadata
          }
        }

        if (name === 'OpenRouterStreamError') {
          errorInstance.isStreamError = true
        }

        return errorInstance
      }

      const url = `${baseUrl}/chat/completions`
      const hasImageContent = filteredMessages.some(msg =>
        Array.isArray(msg.content) && msg.content.some(part => part?.type === 'image_url')
      )
      const hasFileContent = filteredMessages.some(msg =>
        Array.isArray(msg.content) && msg.content.some(part => part?.type === 'file')
      )

      const requestBody = {
        model: modelName,
        messages: filteredMessages,
        stream: streaming,
        usage: {
          include: includeUsage
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🎯 统一生成参数适配 (Phase 2 Integration)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (!generationConfig) {
        console.warn('OpenRouterService: generationConfig is missing, using empty config')
        generationConfig = { sampling: {}, length: {} }
      }

      if (modelCapability) {
        const adapterResult = buildOpenRouterRequest({
          modelId: modelName,
          capability: modelCapability,
          effectiveConfig: generationConfig,
          messages: filteredMessages,
        })

        Object.assign(requestBody, adapterResult.requestBodyFragment)

        // 显示参数适配摘要（正常行为，非警告）
        if (adapterResult.ignoredParameters && adapterResult.ignoredParameters.length > 0) {
          console.log('OpenRouterService: 📋 参数适配摘要 - 以下参数已自动忽略（模型不支持）:')
          adapterResult.ignoredParameters.forEach((param, idx) => {
            console.log(`  ${idx + 1}. ${param.key} - ${param.reason}`)
          })
        }
        
        if (adapterResult.warnings && adapterResult.warnings.length > 0) {
          // 区分警告类型：只有真正的问题才用 warn
          const criticalWarnings = adapterResult.warnings.filter(w => w.type === 'ignored' || w.type === 'clipped')
          const infoWarnings = adapterResult.warnings.filter(w => w.type === 'fallback')
          
          if (criticalWarnings.length > 0) {
            console.warn('OpenRouterService: ⚠️ 参数自动调整:', criticalWarnings)
          }
          if (infoWarnings.length > 0) {
            console.log('OpenRouterService: ℹ️ 配置提示:', infoWarnings.map(w => w.message))
          }
        }
      } else {
        console.warn('OpenRouterService: modelCapability is missing, skip capability-based adapter; sending minimal request body')
      }

      // 配置 plugins（支持多个插件）
      const plugins = []

      // Web 搜索插件
      if (webSearch && webSearch.enabled) {
        const webPluginConfig = { id: 'web' }

        if (webSearch.engine && webSearch.engine !== 'undefined') {
          webPluginConfig.engine = webSearch.engine
        }

        if (typeof webSearch.maxResults === 'number') {
          webPluginConfig.max_results = webSearch.maxResults
        }

        if (webSearch.searchPrompt && typeof webSearch.searchPrompt === 'string') {
          webPluginConfig.search_prompt = webSearch.searchPrompt
        }

        plugins.push(webPluginConfig)

        if (webSearch.searchContextSize) {
          requestBody.web_search_options = {
            search_context_size: webSearch.searchContextSize
          }
        }

        console.log('OpenRouterService: 已启用 Web 搜索插件', {
          engine: webPluginConfig.engine || 'default',
          maxResults: webPluginConfig.max_results,
          searchContextSize: webSearch.searchContextSize
        })
      }

      // 文件解析插件（PDF 支持）
      if (hasFileContent && pdfEngine) {
        const fileParserConfig = {
          id: 'file-parser',
          pdf: {
            engine: pdfEngine
          }
        }
        plugins.push(fileParserConfig)
        console.log('OpenRouterService: 已启用文件解析插件', {
          pdfEngine
        })
      }

      // 将插件配置添加到请求体
      if (plugins.length > 0) {
        requestBody.plugins = plugins
      }

      const finalModalities = []

      if (hasImageContent) {
        if (!supportsVision(modelName)) {
          throw new Error(`当前模型 ${modelName} 不支持图像输入，请切换到具备视觉能力的模型后重试。`)
        }
        finalModalities.push('image', 'text')
      }

      if (Array.isArray(requestedModalities) && requestedModalities.length > 0) {
        finalModalities.push(...requestedModalities)
      }

      if (finalModalities.length > 0) {
        const normalizedModalities = Array.from(new Set(
          finalModalities
            .map(mod => (typeof mod === 'string' ? mod.trim().toLowerCase() : ''))
            .filter(Boolean)
            .map(mod => (mod === 'vision' || mod === 'multimodal' ? 'image' : mod))
        ))

        if (normalizedModalities.length > 0) {
          if (!normalizedModalities.includes('text')) {
            normalizedModalities.push('text')
          }
          requestBody.modalities = normalizedModalities
          console.log('OpenRouterService: 请求 modalities =', normalizedModalities)
        }
      }

      if (imageConfig) {
        requestBody.image_config = { ...imageConfig }
        console.log('OpenRouterService: 请求 image_config =', requestBody.image_config)
      }
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 🔍 请求体验证与调试日志
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 1. 验证请求体格式，提前发现问题
      // 2. 打印前 4KB 内容用于调试，避免 Base64 图片数据污染日志
      try {
        validateOpenRouterRequestBody(requestBody)
        console.log('✓ 请求体验证通过')
      } catch (validationError) {
        console.error('OpenRouterService: 请求体验证失败:', validationError)
        throw validationError
      }

  const reasoningPreference = resolveReasoningPreference(resolvedReasoningConfig)
  const reasoningPayload = deriveReasoningPayloadFromRequest(requestBody)
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🧠 流式推理状态追踪
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // reasoningSummary: 推理摘要文本（来自模型的最终总结）
  // reasoningText: 累积的实时推理文本（来自 delta.reasoning，用于 UI 展示）
  // emittedDetailIds: 已发送的结构化块 ID（用于去重，这些块需回传给模型）
  let reasoningSummary = null
  let reasoningText = ''
  const emittedDetailIds = new Set()

  console.log('OpenRouterService: 正在发送请求到:', url)
      // 打印 requestBody 的前 4KB，避免控制台被大量 base64 污染
      try {
        const jsonStr = JSON.stringify(requestBody)
        const preview = jsonStr.length > 4096 ? jsonStr.slice(0, 4096) + '...<truncated>' : jsonStr
        console.debug('OpenRouterService: 请求体预览:', preview)
      } catch (e) {
        console.debug('OpenRouterService: 无法序列化请求体用于预览', e)
      }
      
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

        let parsedError = null
        try {
          parsedError = JSON.parse(errorText)
        } catch (parseErr) {
          console.warn('OpenRouterService: 错误响应非 JSON，已跳过解析', parseErr?.message)
        }

        let apiErrorInfo = null
        if (parsedError && typeof parsedError === 'object') {
          if (parsedError.error) {
            apiErrorInfo = parsedError.error
          } else if (Array.isArray(parsedError.errors) && parsedError.errors.length > 0) {
            apiErrorInfo = parsedError.errors[0]
          } else {
            apiErrorInfo = parsedError
          }
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const waitTime = retryAfter ? `${retryAfter} 秒` : '一段时间'
          const rateLimitError = buildOpenRouterError(apiErrorInfo, response.status, `OpenRouter 速率限制：请求过于频繁，请等待 ${waitTime} 后重试`)
          rateLimitError.message = `OpenRouter 速率限制：请求过于频繁，请等待 ${waitTime} 后重试`
          rateLimitError.retryable = true
          if (retryAfter) {
            rateLimitError.retryAfter = retryAfter
          }
          rateLimitError.responseText = errorText
          throw rateLimitError
        }

        if (response.status === 401 || response.status === 403) {
          const authError = buildOpenRouterError(apiErrorInfo, response.status, 'OpenRouter 认证失败：API Key 无效或已过期，请检查设置')
          authError.message = 'OpenRouter 认证失败：API Key 无效或已过期，请检查设置'
          authError.retryable = false
          authError.responseText = errorText
          throw authError
        }

        const genericError = buildOpenRouterError(apiErrorInfo, response.status, `OpenRouter API 请求失败: ${response.status}`)
        if (!genericError.message || genericError.message === `OpenRouter API 请求失败: ${response.status}`) {
          genericError.message = `OpenRouter API 请求失败: ${response.status} - ${errorText}`
        }
        if (genericError.retryable === undefined) {
          genericError.retryable = response.status >= 500
        }
        genericError.responseText = errorText
        throw genericError
      }

      const requestIdFromHeader = response.headers.get('x-request-id') ||
        response.headers.get('x-openrouter-id') ||
        response.headers.get('openrouter-id') ||
        null

      if (!streaming) {
        const data = await response.json()
        const completionUsage = data?.usage
        if (completionUsage && typeof completionUsage === 'object') {
          yield { type: 'usage', usage: completionUsage, requestId: data?.id ?? requestIdFromHeader ?? undefined }
        } else {
          console.warn('OpenRouterService: 非流式响应未包含 usage 字段')
        }

        const primaryText = data?.choices?.[0]?.message?.content
        if (primaryText) {
          yield { type: 'text', content: primaryText }
        }
        return
      }
      
      console.log('OpenRouterService: ✓ 收到响应，开始处理流式数据')
      
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 📡 处理流式响应（Server-Sent Events 格式）
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''                    // SSE 行缓冲区
  const emittedImages = new Set()    // 已发送图片去重集合
  let usageEmitted = false           // token 用量是否已发送
  let receivedDone = false           // 是否收到 [DONE] 标记
  let requestId = requestIdFromHeader

      /**
       * 标准化图片数据为 Data URL 格式
       * 
       * 支持多种输入格式：
       * - Data URL (data:image/...)
       * - HTTP(S) URL
       * - Base64 字符串（自动添加 MIME 类型前缀）
       * - 对象格式（url, image_url, b64_json, inline_data 等）
       * 
       * @param {string|Object|Array} payload - 图片数据
       * @param {string} defaultMime - 默认 MIME 类型
       * @returns {string|null} 标准化的 Data URL 或 null
       */
      const normalizeImagePayload = (payload, defaultMime = 'image/png') => {
        if (!payload) {
          return null
        }

        const normalizeString = (value) => {
          if (!value) return null
          const trimmed = value.trim()
          if (!trimmed) return null
          if (/^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
            return trimmed
          }
          return `data:${defaultMime};base64,${trimmed}`
        }

        if (typeof payload === 'string') {
          return normalizeString(payload)
        }

        if (Array.isArray(payload)) {
          for (const item of payload) {
            const normalized = normalizeImagePayload(item, defaultMime)
            if (normalized) {
              return normalized
            }
          }
          return null
        }

        if (typeof payload === 'object') {
          if (typeof payload.url === 'string') {
            return normalizeString(payload.url)
          }
          if (typeof payload.image_url === 'string') {
            return normalizeString(payload.image_url)
          }
          if (payload.image_url && typeof payload.image_url.url === 'string') {
            return normalizeString(payload.image_url.url)
          }
          if (typeof payload.asset_pointer === 'string') {
            return null
          }
          if (typeof payload.b64_json === 'string') {
            const mime = payload.mime_type || defaultMime
            return `data:${mime};base64,${payload.b64_json}`
          }
          if (typeof payload.base64 === 'string') {
            const mime = payload.mime_type || defaultMime
            return `data:${mime};base64,${payload.base64}`
          }
          if (typeof payload.data === 'string') {
            const mime = payload.mime_type || defaultMime
            return `data:${mime};base64,${payload.data}`
          }
          if (payload.inline_data && typeof payload.inline_data.data === 'string') {
            const mime = payload.inline_data.mime_type || defaultMime
            return `data:${mime};base64,${payload.inline_data.data}`
          }
          if (payload.image && typeof payload.image.url === 'string') {
            return normalizeString(payload.image.url)
          }
          if (payload.image && typeof payload.image.b64_json === 'string') {
            const mime = payload.image.mime_type || defaultMime
            return `data:${mime};base64,${payload.image.b64_json}`
          }
        }

        return null
      }
      
      // 缓冲区限制：防御性编程，避免恶意数据或协议错误导致内存溢出
      // 
      // 为什么需要限制：
      // 1. 防止恶意服务器发送无限数据导致浏览器崩溃
      // 2. 防止网络错误或 SSE 协议错误导致的内存泄漏
      // 3. 保护低端设备的内存资源
      //
      // 限制大小说明：
      // - 16MB 提供了充足的安全边际，避免正常使用时出现溢出
      // - 支持多张高清图片的 Base64 编码数据（约 4-6 张）
      // - 正常的 AI 文本响应通常 < 100KB
      // - 包含图片的响应通常在 1-8MB 范围内
      // - 如果单行数据 > 16MB，很可能是异常情况
      const MAX_BUFFER_SIZE = 16 * 1024 * 1024 // 16MB
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          break
        }
        
        // 解码数据块
        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk
        
        // 按行分割（SSE 格式：每行一个事件）
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 保留不完整的行（可能跨越多个数据块）
        
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 🛡️ 安全检查：防止单行数据过大导致内存溢出
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 注意：buffer 存储的是「不完整的 SSE 行」，而非累积总量
        // 正常情况下，单行 SSE 数据不会超过几 MB（即使包含图片）
        // 如果单行 > 16MB，很可能是攻击或协议错误
        if (buffer.length > MAX_BUFFER_SIZE) {
          console.error('OpenRouterService: 检测到异常大的单行数据')
          console.error('  - 单行大小:', Math.round(buffer.length / 1024 / 1024), 'MB')
          console.error('  - 这可能是恶意数据、网络错误或协议异常')
          console.error('  - 前 200 字符:', buffer.substring(0, 200))
          throw new Error(`SSE 单行数据过大 (>${Math.round(MAX_BUFFER_SIZE / 1024 / 1024)}MB)，可能存在安全风险`)
        }
        
        for (const line of lines) {
          const trimmedLine = line.trim()
          
          // SSE 格式处理：跳过空行和服务器注释（以 : 开头）
          if (!trimmedLine || trimmedLine.startsWith(':')) {
            continue
          }
          
          // SSE 格式: "data: {...}"
          if (trimmedLine.startsWith('data:')) {
            const jsonStr = trimmedLine.slice(5).trim()
            
            // OpenRouter 发送 "[DONE]" 标记流结束
            if (jsonStr === '[DONE]') {
              console.log('OpenRouterService: 收到 [DONE] 标记')
              receivedDone = true
              break
            }
            
            try {
              const chunk = JSON.parse(jsonStr)

              // 🧠 流式推理处理
              const primaryChoice = chunk.choices?.[0]
              
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 1️⃣ 处理 reasoning_details 数组（结构化数据，用于回传模型）
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 作用：保存到消息历史，下次请求时原样回传给模型，保持思考连续性
              // 特别重要：工具调用/多轮对话场景必须回传，否则思考链会断裂
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              if (primaryChoice?.delta?.reasoning_details && Array.isArray(primaryChoice.delta.reasoning_details)) {
                for (const detail of primaryChoice.delta.reasoning_details) {
                  if (detail && typeof detail === 'object') {
                    // 去重：使用 id 或内容指纹
                    const detailId = detail.id || JSON.stringify([detail.type, detail.text, detail.summary])
                    if (!emittedDetailIds.has(detailId)) {
                      emittedDetailIds.add(detailId)
                      
                      // 发送结构化块给前端保存（不用于显示）
                      yield {
                        type: 'reasoning_detail',
                        detail: {
                          id: detail.id ?? null,
                          type: detail.type || 'unknown',
                          text: detail.text || '',
                          summary: detail.summary || '',
                          data: detail.data || '',
                          format: detail.format || '',
                          index: typeof detail.index === 'number' ? detail.index : undefined
                        }
                      }
                      
                      console.log('[REASONING_DETAILS] 收集结构化块用于回传，类型:', detail.type, '长度:', detail.text?.length || 0)
                    }
                  }
                }
              }
              
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 2️⃣ 处理 delta.reasoning（纯文本流，用于实时展示）
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 作用：实时显示思考过程给用户看（包含标点、连接词等完整文本）
              // 注意：这是展示层数据，与 reasoning_details 内容重复但用途不同
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              if (primaryChoice?.delta?.reasoning) {
                const reasoningValue = primaryChoice.delta.reasoning
                if (typeof reasoningValue === 'string') {
                  console.log('[DELTA.REASONING] 实时文本流，长度:', reasoningValue.length, '前50字符:', reasoningValue.substring(0, 50))
                  
                  // 累积完整文本用于最终摘要
                  reasoningText += reasoningValue
                  
                  // 🎨 实时发送给前端显示（仅用于 UI 展示）
                  yield {
                    type: 'reasoning_stream_text',  // 区别于 reasoning_detail
                    text: reasoningValue
                  }
                } else if (typeof reasoningValue === 'object' && reasoningValue.summary) {
                  reasoningSummary = reasoningValue.summary
                }
              }
              
              if (chunk.error) {
                const streamError = buildOpenRouterError(chunk.error, response.status, chunk.error?.message || 'OpenRouter 流式响应错误', 'OpenRouterStreamError')
                streamError.responseText = jsonStr
                throw streamError
              }

              // primaryChoice 已在上面声明，这里直接使用

              if (primaryChoice?.error) {
                const streamError = buildOpenRouterError(primaryChoice.error, response.status, primaryChoice.error?.message || 'OpenRouter 流式响应错误', 'OpenRouterStreamError')
                streamError.responseText = jsonStr
                throw streamError
              }

              if (primaryChoice?.delta?.error) {
                const streamError = buildOpenRouterError(primaryChoice.delta.error, response.status, primaryChoice.delta.error?.message || 'OpenRouter 流式响应错误', 'OpenRouterStreamError')
                streamError.responseText = jsonStr
                throw streamError
              }

              if (primaryChoice?.finish_reason === 'error') {
                const streamError = buildOpenRouterError(primaryChoice?.error ?? primaryChoice?.delta?.error ?? primaryChoice, response.status, 'OpenRouter 流式响应错误', 'OpenRouterStreamError')
                streamError.responseText = jsonStr
                throw streamError
              }

              if (!requestId && typeof chunk?.id === 'string') {
                requestId = chunk.id
              }
              if (!requestId && typeof chunk?.request_id === 'string') {
                requestId = chunk.request_id
              }
              if (!requestId && typeof primaryChoice?.id === 'string') {
                requestId = primaryChoice.id
              }

              const possibleUsage = chunk.usage || primaryChoice?.usage
              if (!usageEmitted && possibleUsage && typeof possibleUsage === 'object') {
                usageEmitted = true
                yield { type: 'usage', usage: possibleUsage, requestId }
              }

              const delta = primaryChoice?.delta
              if (!delta) {
                continue
              }
              
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 🎨 处理图片数据（与文本内容并行处理）
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 图片来源：delta.images 数组（OpenRouter 标准格式）
              // 注意：图片和文本是独立的流，可以同时返回
              if (delta.images && Array.isArray(delta.images) && delta.images.length > 0) {
                console.log('🎨 [IMAGE] 检测到图片数据，数量:', delta.images.length)
                for (const imageObj of delta.images) {
                  const normalized = normalizeImagePayload(imageObj)
                  if (normalized) {
                    if (emittedImages.has(normalized)) {
                      continue
                    }
                    emittedImages.add(normalized)
                    console.log('✓ 接收到生成的图片，前缀:', normalized.substring(0, 50))
                    yield { type: 'image', content: normalized }
                  } else {
                    console.warn('OpenRouterService: 无法解析 delta.images 中的图片数据', imageObj)
                  }
                }
              }

              if (delta.image) {
                const normalizedSingleImage = normalizeImagePayload(delta.image)
                if (normalizedSingleImage && !emittedImages.has(normalizedSingleImage)) {
                  emittedImages.add(normalizedSingleImage)
                  console.log('✓ 接收到 delta.image 图片，前缀:', normalizedSingleImage.substring(0, 50))
                  yield { type: 'image', content: normalizedSingleImage }
                }
              }
              
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              // 📝 处理文本内容（与图片数据并行处理）
              // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
              const content = delta.content

              // 处理结构化内容数组（如 Claude 的 content blocks）
              // 可能包含文本块、图片块等多种类型
              if (Array.isArray(content)) {
                // 如果 content 是数组，可能包含文本和图片
                for (const block of content) {
                  if ((block?.type === 'text' || block?.type === 'output_text') && block.text) {
                    yield { type: 'text', content: block.text }
                    continue
                  }

                  const normalizedBlockImage = normalizeImagePayload(
                    block?.image_url ??
                    block?.image ??
                    block?.image_base64 ??
                    block?.b64_json ??
                    block?.data ??
                    block?.inline_data ??
                    block
                  )

                  if (normalizedBlockImage) {
                    if (emittedImages.has(normalizedBlockImage)) {
                      continue
                    }
                    emittedImages.add(normalizedBlockImage)
                    console.log('✓ 接收到图片内容 block，前缀:', normalizedBlockImage.substring(0, 50))
                    yield { type: 'image', content: normalizedBlockImage }
                  } else {
                    console.warn('OpenRouterService: 跳过未知 block 类型:', block?.type)
                  }
                }
              } else if (typeof content === 'string' && content) {
                // 如果 content 是字符串（标准格式）
                yield { type: 'text', content }
              } else if (content && typeof content === 'object') {
                // 如果 content 是对象
                if (content.text) {
                  yield { type: 'text', content: content.text }
                } else {
                  const normalizedContentImage = normalizeImagePayload(
                    content.image_url ??
                    content.image ??
                    content.inline_data ??
                    content.image_base64 ??
                    content.b64_json ??
                    content.data ??
                    content
                  )
                  if (normalizedContentImage) {
                    if (!emittedImages.has(normalizedContentImage)) {
                      emittedImages.add(normalizedContentImage)
                      console.log('✓ 接收到图片内容对象，前缀:', normalizedContentImage.substring(0, 50))
                      yield { type: 'image', content: normalizedContentImage }
                    }
                  } else {
                    console.warn('OpenRouterService: 未知的 content 格式:', content)
                  }
                }
              }
              // 附加：如果 message.content 中也包含图片或文本，统一处理
              const messageContent = chunk.choices?.[0]?.message?.content
              if (Array.isArray(messageContent)) {
                for (const item of messageContent) {
                  if ((item?.type === 'text' || item?.type === 'output_text') && item.text) {
                    yield { type: 'text', content: item.text }
                    continue
                  }
                  const normalizedMessageImage = normalizeImagePayload(item)
                  if (normalizedMessageImage && !emittedImages.has(normalizedMessageImage)) {
                    emittedImages.add(normalizedMessageImage)
                    console.log('✓ 接收到 message.content 图片，前缀:', normalizedMessageImage.substring(0, 50))
                    yield { type: 'image', content: normalizedMessageImage }
                  }
                }
              } else if (messageContent) {
                const normalizedMessagePayload = normalizeImagePayload(messageContent)
                if (normalizedMessagePayload && !emittedImages.has(normalizedMessagePayload)) {
                  emittedImages.add(normalizedMessagePayload)
                  console.log('✓ 接收到 message.content 图片（对象），前缀:', normalizedMessagePayload.substring(0, 50))
                  yield { type: 'image', content: normalizedMessagePayload }
                }
              }

              const attachments = chunk.choices?.[0]?.attachments
              if (Array.isArray(attachments)) {
                for (const attachment of attachments) {
                  const normalizedAttachmentImage = normalizeImagePayload(attachment)
                  if (normalizedAttachmentImage && !emittedImages.has(normalizedAttachmentImage)) {
                    emittedImages.add(normalizedAttachmentImage)
                    console.log('✓ 接收到附件图片，前缀:', normalizedAttachmentImage.substring(0, 50))
                    yield { type: 'image', content: normalizedAttachmentImage }
                  }
                }
              }

              // 注意：如果 content 为空，不输出任何警告，因为可能只有图片数据
            } catch (parseError) {
              console.warn('OpenRouterService: JSON 解析失败:', parseError.message)
              console.warn('OpenRouterService: 原始数据:', jsonStr)
            }
          }
        }

        if (receivedDone) {
          break
        }
      }

      if (!receivedDone) {
        console.log('OpenRouterService: 流式响应完成 (reader.done)')
      }

      // 流结束：发送推理摘要块
      const hasReasoningPayload = reasoningPayload && Object.keys(reasoningPayload).length > 0
      let resolvedVisibility = reasoningPreference?.visibility
        ?? (reasoningPayload?.exclude === true
          ? 'hidden'
          : (hasReasoningPayload ? 'visible' : 'off'))
      const resolvedEffort = reasoningPreference?.effort ?? reasoningPayload?.effort ?? 'medium'
      const resolvedMaxTokens = reasoningPreference?.maxTokens ?? (
        typeof reasoningPayload?.max_tokens === 'number' ? reasoningPayload.max_tokens : null
      )

      // 如果收集到了推理数据，调整可见性
      if ((reasoningText || reasoningSummary || emittedDetailIds.size > 0) && resolvedVisibility === 'off') {
        resolvedVisibility = 'visible'
      }

      // 发送推理摘要（包含请求配置和汇总信息）
      const shouldEmitReasoningSummary = (reasoningText || reasoningSummary || emittedDetailIds.size > 0) || (
        resolvedReasoningConfig && resolvedVisibility !== 'off'
      )

      if (shouldEmitReasoningSummary) {
        const summaryBlock = {
          type: 'reasoning_summary',
          summary: reasoningSummary || '',
          text: reasoningText ? reasoningText.trim() : '',
          detailCount: emittedDetailIds.size,
          request: {
            visibility: resolvedVisibility,
            effort: resolvedEffort,
            maxTokens: resolvedMaxTokens,
            payload: hasReasoningPayload ? { ...reasoningPayload } : {}
          },
          provider: PROVIDERS.OPENROUTER,
          model: modelName,
          excluded: reasoningPayload?.exclude === true
        }
        
        yield summaryBlock
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
  },

  /**
   * 查询已完成请求的精确 usage（用于对账）
   */
  async fetchGenerationUsage(apiKey, generationId, baseUrl = OPENROUTER_BASE_URL) {
    if (!generationId) {
      throw new Error('fetchGenerationUsage requires generationId')
    }

    const url = `${baseUrl}/generation/${encodeURIComponent(generationId)}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
        'X-Title': 'Starverse'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      const error = new Error(`OpenRouter generation lookup failed: ${response.status}`)
      error.responseText = errorText
      error.status = response.status
      throw error
    }

    const data = await response.json()
    return data?.data ?? data
  }
}
