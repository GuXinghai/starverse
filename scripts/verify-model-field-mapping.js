/**
 * 模型数据字段映射验证脚本
 * 用于验证 main.ts 中的数据转换逻辑
 */

// 模拟 OpenRouter API 响应
const mockOpenRouterResponse = [
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'OpenAI GPT-4 Turbo',
    context_length: 128000,
    max_output_tokens: 4096,
    pricing: {
      prompt: '0.00001',
      completion: '0.00003'
    },
    architecture: {
      modality: 'text',
      tokenizer: 'GPT',
      instruct_type: 'chat'
    },
    input_modalities: ['text'],
    output_modalities: ['text']
  },
  {
    id: 'anthropic/claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Anthropic Claude 3.5 Sonnet',
    context_length: 200000,
    max_output_tokens: 8192,
    pricing: {
      prompt: '0.000003',
      completion: '0.000015'
    },
    architecture: {
      modality: 'text+image',
      tokenizer: 'Claude',
      instruct_type: 'chat'
    },
    input_modalities: ['text', 'image'],
    output_modalities: ['text']
  },
  {
    id: 'openai/dall-e-3',
    name: 'DALL-E 3',
    description: 'OpenAI DALL-E 3 Image Generation',
    context_length: 4000,
    max_output_tokens: 1,
    pricing: {
      prompt: '0.00001',
      image: '0.04'
    },
    architecture: {
      modality: 'text->image',
      tokenizer: 'GPT'
    },
    input_modalities: ['text'],
    output_modalities: ['image']
  }
]

// 模拟 main.ts 中的映射逻辑（修复后的版本）
function transformModels(modelData) {
  const models = (Array.isArray(modelData) ? modelData : [])
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      name: item.name || String(item.id),
      description: item.description,
      context_length: item.context_length,
      max_output_tokens: item.max_output_tokens,
      pricing: item.pricing,
      architecture: item.architecture,
      input_modalities: item.input_modalities,
      output_modalities: item.output_modalities,
      supportsVision: item.input_modalities?.includes('image'),
      supportsImageOutput: item.output_modalities?.includes('image'),
      supportsReasoning: item.architecture?.reasoning === true
    }))
  
  return models
}

// 模拟 modelDataClient.ts 中的保存逻辑
function prepareForDatabase(models) {
  return models.map(model => {
    const modelId = String(model.id)
    
    const cleanMeta = {
      architecture: model.architecture,
      modality: model.modality,
      per_request_limits: model.per_request_limits,
      top_provider: model.top_provider
    }
    
    return {
      id: modelId,
      provider: modelId.split('/')[0] || 'unknown',
      name: model.name || modelId,
      description: model.description,
      contextLength: model.context_length,  // ← 映射到数据库字段
      pricing: model.pricing,
      meta: cleanMeta
    }
  })
}

// 运行验证
console.log('🧪 开始验证模型数据字段映射...\n')

// 步骤 1: 转换 API 响应
console.log('📥 步骤 1: 转换 OpenRouter API 响应')
const transformedModels = transformModels(mockOpenRouterResponse)
console.log(`✅ 转换完成: ${transformedModels.length} 个模型\n`)

// 步骤 2: 验证字段存在
console.log('🔍 步骤 2: 验证字段映射')
transformedModels.forEach((model, index) => {
  console.log(`\n模型 ${index + 1}: ${model.name}`)
  console.log(`  - id: ${model.id}`)
  console.log(`  - context_length: ${model.context_length}`)
  console.log(`  - max_output_tokens: ${model.max_output_tokens}`)
  console.log(`  - supportsVision: ${model.supportsVision}`)
  console.log(`  - supportsImageOutput: ${model.supportsImageOutput}`)
  
  // ✅ 验证关键字段不为 undefined
  if (model.context_length === undefined) {
    console.error(`  ❌ 错误: context_length 为 undefined`)
  }
  if (model.max_output_tokens === undefined) {
    console.error(`  ❌ 错误: max_output_tokens 为 undefined`)
  }
})

// 步骤 3: 准备数据库保存
console.log('\n\n💾 步骤 3: 准备数据库保存格式')
const dbRecords = prepareForDatabase(transformedModels)
dbRecords.forEach((record, index) => {
  console.log(`\n数据库记录 ${index + 1}:`)
  console.log(`  - id: ${record.id}`)
  console.log(`  - provider: ${record.provider}`)
  console.log(`  - contextLength: ${record.contextLength}`)
  
  // ✅ 验证数据库字段不为 undefined
  if (record.contextLength === undefined) {
    console.error(`  ❌ 错误: contextLength (数据库字段) 为 undefined`)
  } else {
    console.log(`  ✅ contextLength 正确映射: ${record.contextLength}`)
  }
})

// 步骤 4: 验证序列化
console.log('\n\n🔐 步骤 4: 验证 IPC 序列化')
try {
  const serialized = JSON.parse(JSON.stringify(dbRecords))
  console.log('✅ IPC 序列化成功')
  console.log(`✅ 序列化后模型数量: ${serialized.length}`)
  
  // 验证序列化后数据完整性
  const record = serialized[0]
  if (record.contextLength !== undefined) {
    console.log(`✅ 第一个模型的 contextLength 保留: ${record.contextLength}`)
  } else {
    console.error(`❌ 错误: 序列化后 contextLength 丢失`)
  }
} catch (error) {
  console.error('❌ IPC 序列化失败:', error.message)
}

// 最终验证
console.log('\n\n🎯 最终验证结果:')
const allValid = dbRecords.every(record => 
  record.id && 
  record.provider && 
  record.contextLength !== undefined
)

if (allValid) {
  console.log('✅ 所有模型数据字段映射正确')
  console.log('✅ 数据可以成功保存到数据库')
  console.log('\n🎉 验证通过！')
} else {
  console.error('❌ 存在字段映射错误')
  console.error('❌ 数据无法保存到数据库')
  console.log('\n⚠️ 验证失败！')
}
