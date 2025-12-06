/**
 * Provider 常量定义
 * 
 * 职责：
 * - 统一管理所有 AI Provider 的字符串 ID（运行时使用）
 * - 提供类型安全的 ProviderId 联合类型
 * - 维护 Provider 元数据（显示名称、环境变量前缀等）
 * 
 * 设计原则：
 * - 使用 as const 确保字面量类型推导
 * - 避免枚举和复杂抽象，保持简单直观
 * - ID 全小写，与 OpenRouter API 规范保持一致
 */

/**
 * Provider 字符串 ID 常量
 * 运行时使用这些常量来避免拼写错误（如 Openrouter vs openrouter）
 */
export const PROVIDERS = {
  /** Google Gemini API */
  GEMINI: 'gemini',
  
  /** OpenRouter 聚合平台 */
  OPENROUTER: 'openrouter',
  
  /** OpenAI 官方 API（预留） */
  OPENAI: 'openai',
  
  /** Anthropic 官方 API（预留） */
  ANTHROPIC: 'anthropic',
} as const;

/**
 * Provider ID 联合类型
 * 用于类型约束，确保只能使用已定义的 Provider
 * 
 * @example
 * function sendMessage(provider: ProviderId, message: string) { ... }
 */
export type ProviderId = (typeof PROVIDERS)[keyof typeof PROVIDERS];

/**
 * Provider 元数据定义
 */
export interface ProviderMetadata {
  /** 内部 ID（运行时使用） */
  id: ProviderId;
  
  /** 对外显示名称 */
  displayName: string;
  
  /** 环境变量前缀（如 OPENROUTER_API_KEY） */
  envPrefix: string;
  
  /** 是否需要 API Key */
  requiresApiKey: boolean;
  
  /** 官方文档链接 */
  docsUrl?: string;
}

/**
 * Provider 元数据映射表
 * 
 * 用于 UI 展示和配置管理
 */
export const PROVIDER_METADATA: Record<ProviderId, ProviderMetadata> = {
  [PROVIDERS.GEMINI]: {
    id: PROVIDERS.GEMINI,
    displayName: 'Google Gemini',
    envPrefix: 'GEMINI',
    requiresApiKey: true,
    docsUrl: 'https://ai.google.dev/docs',
  },
  
  [PROVIDERS.OPENROUTER]: {
    id: PROVIDERS.OPENROUTER,
    displayName: 'OpenRouter',
    envPrefix: 'OPENROUTER',
    requiresApiKey: true,
    docsUrl: 'https://openrouter.ai/docs',
  },
  
  [PROVIDERS.OPENAI]: {
    id: PROVIDERS.OPENAI,
    displayName: 'OpenAI',
    envPrefix: 'OPENAI',
    requiresApiKey: true,
    docsUrl: 'https://platform.openai.com/docs',
  },
  
  [PROVIDERS.ANTHROPIC]: {
    id: PROVIDERS.ANTHROPIC,
    displayName: 'Anthropic',
    envPrefix: 'ANTHROPIC',
    requiresApiKey: true,
    docsUrl: 'https://docs.anthropic.com',
  },
};

/**
 * 工具函数：获取 Provider 显示名称
 * 
 * @example
 * getProviderDisplayName(PROVIDERS.OPENROUTER) // => "OpenRouter"
 */
export function getProviderDisplayName(providerId: ProviderId): string {
  return PROVIDER_METADATA[providerId]?.displayName ?? providerId;
}

/**
 * 工具函数：检查是否为有效的 Provider ID
 * 
 * @example
 * isValidProviderId('openrouter') // => true
 * isValidProviderId('Openrouter') // => false (大小写错误)
 */
export function isValidProviderId(value: string): value is ProviderId {
  return Object.values(PROVIDERS).includes(value as ProviderId);
}
