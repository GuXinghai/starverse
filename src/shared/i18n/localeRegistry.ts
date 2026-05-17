/**
 * localeRegistry.ts — 支持的 locale 注册表
 *
 * 职责：
 * - 维护 SUPPORTED_LOCALES 集合
 * - 提供 locale 元数据（显示名称、方向等）
 * - 提供默认 locale 和 fallback locale
 */

import type { SupportedLocale } from './localeTypes'

/** 所有支持的 locale 列表 */
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['zh-CN', 'en-US'] as const

/** 默认 locale（新用户首次启动时使用） */
export const DEFAULT_LOCALE: SupportedLocale = 'zh-CN'

/** 回退 locale（消息缺失时使用） */
export const FALLBACK_LOCALE: SupportedLocale = 'en-US'

/** locale 显示名称（用对应语言自身书写） */
export const LOCALE_DISPLAY_NAMES: Record<SupportedLocale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English (US)',
}

/** 文本方向 */
export const LOCALE_DIRECTION: Record<SupportedLocale, 'ltr' | 'rtl'> = {
  'zh-CN': 'ltr',
  'en-US': 'ltr',
}

/**
 * 检查给定字符串是否为 SupportedLocale
 */
export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}
