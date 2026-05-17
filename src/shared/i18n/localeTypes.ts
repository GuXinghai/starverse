/**
 * localeTypes.ts — i18n 类型定义
 *
 * 只定义类型，不包含运行时逻辑。
 */

/** 应用支持的 locale 标识 */
export type SupportedLocale = 'zh-CN' | 'en-US'

/** locale 解析模式 */
export type LocaleMode = 'system' | 'manual'

/**
 * 语言偏好配置
 *
 * 持久化位置：electron-store 的 `language` 键（复用现有 configSchema）
 * 不在此处定义持久化逻辑，由 `src/next/settings/languagePrefs.ts` 负责。
 */
export interface LanguagePrefs {
  /** 解析模式：system = 跟随系统，manual = 用户手动指定 */
  mode: LocaleMode
  /** 实际生效的 UI locale */
  uiLocale: SupportedLocale
  /** 回退 locale（当消息 key 在 uiLocale 中缺失时使用） */
  fallbackLocale: SupportedLocale
}

/**
 * 单条消息定义
 * 值可以是字符串或嵌套对象（按 namespace 组织）
 */
export type MessageValue = string | Record<string, string | Record<string, string>>

/**
 * 一个 locale 的完整消息包
 */
export type MessageBundle = Record<string, MessageValue>
