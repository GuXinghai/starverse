/**
 * localeMatcher.ts — locale 匹配与规范化
 *
 * 职责：
 * - 将各种 locale 字符串（zh, zh-Hans, zh-CN, en, en-US 等）映射到 SupportedLocale
 * - 处理未知 locale 的回退
 */

import type { SupportedLocale } from './localeTypes'
import { DEFAULT_LOCALE, isSupportedLocale } from './localeRegistry'

/**
 * 将任意 locale 字符串匹配到 SupportedLocale
 *
 * 匹配规则：
 * 1. 精确匹配（zh-CN, en-US）→ 直接返回
 * 2. 语言前缀匹配：
 *    - zh / zh-Hans / zh-Hant / zh-Hans-CN → zh-CN
 *    - en / en-GB / en-AU → en-US
 * 3. 其他 → 返回 DEFAULT_LOCALE
 */
export function matchLocale(locale: string | undefined | null): SupportedLocale {
  if (!locale || typeof locale !== 'string') {
    return DEFAULT_LOCALE
  }

  const normalized = locale.trim()

  // 精确匹配
  if (isSupportedLocale(normalized)) {
    return normalized
  }

  // 语言前缀匹配（不区分大小写）
  const lower = normalized.toLowerCase()

  if (lower === 'zh' || lower.startsWith('zh-')) {
    // zh, zh-Hans, zh-Hant, zh-Hans-CN, zh-TW 等全部映射到 zh-CN
    return 'zh-CN'
  }

  if (lower === 'en' || lower.startsWith('en-')) {
    // en, en-GB, en-AU 等全部映射到 en-US
    return 'en-US'
  }

  return DEFAULT_LOCALE
}

/**
 * 规范化 LanguagePrefs 输入，确保返回合法值
 *
 * @param input - 原始输入（可能来自 electron-store 或用户输入）
 * @returns 规范化后的 LanguagePrefs 字段
 */
export function normalizeLanguagePrefs(input: {
  mode?: unknown
  uiLocale?: unknown
  fallbackLocale?: unknown
}): { mode: 'system' | 'manual'; uiLocale: SupportedLocale; fallbackLocale: SupportedLocale } {
  const mode = input.mode === 'system' || input.mode === 'manual' ? input.mode : 'manual'
  const uiLocale = matchLocale(input.uiLocale as string)
  const fallbackLocale = matchLocale(input.fallbackLocale as string)

  return { mode, uiLocale, fallbackLocale }
}
