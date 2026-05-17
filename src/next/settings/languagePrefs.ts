/**
 * languagePrefs.ts — 语言偏好适配器
 *
 * 职责：
 * - 从 electron-store 读取 `language` 配置
 * - 将原始值解析为 LanguagePrefs
 * - 应用到 i18n 状态
 *
 * 复用现有 configSchema.language 键，不引入新的持久化。
 * electron-store 的 `language` 键存储的是 SupportedLocale 字符串。
 */

import { matchLocale, normalizeLanguagePrefs } from '@/shared/i18n/localeMatcher'
import { applyLanguagePrefs, DEFAULT_LOCALE, FALLBACK_LOCALE } from '@/shared/i18n'
import type { SupportedLocale, LanguagePrefs } from '@/shared/i18n/localeTypes'

// ── electron-store 桥接 ───────────────────────────────────

type ElectronStoreLike = Readonly<{
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<any>
}>

function getElectronStore(): ElectronStoreLike | null {
  const store = (globalThis as any).electronStore as ElectronStoreLike | undefined
  if (!store) return null
  if (typeof store.get !== 'function' || typeof store.set !== 'function') return null
  return store
}

// ── 公共 API ──────────────────────────────────────────────

const LANGUAGE_KEY = 'language'

/**
 * 从 electron-store 加载语言偏好并应用到 i18n 状态
 *
 * electron-store 中 `language` 键存储的是 locale 字符串（如 'zh-CN'），
 * 不是完整的 LanguagePrefs 对象。此函数将其解析为 LanguagePrefs。
 *
 * @returns 解析后的 LanguagePrefs，若 electron-store 不可用则返回默认值
 */
export async function loadLanguagePrefs(): Promise<LanguagePrefs> {
  const store = getElectronStore()
  if (!store) {
    const defaults = normalizeLanguagePrefs({})
    applyLanguagePrefs(defaults)
    return defaults
  }

  const rawLocale = await store.get(LANGUAGE_KEY)
  const uiLocale = matchLocale(rawLocale as string)

  const prefs: LanguagePrefs = {
    mode: 'manual',
    uiLocale,
    fallbackLocale: FALLBACK_LOCALE,
  }

  applyLanguagePrefs(prefs)
  return prefs
}

/**
 * 保存语言偏好到 electron-store 并应用
 *
 * @param locale - 要设置的 locale
 */
export async function saveLanguagePref(locale: SupportedLocale): Promise<void> {
  const store = getElectronStore()
  if (store) {
    await store.set(LANGUAGE_KEY, locale)
  }

  applyLanguagePrefs({
    mode: 'manual',
    uiLocale: locale,
    fallbackLocale: FALLBACK_LOCALE,
  })
}

/**
 * 获取当前存储的语言 locale（不应用，仅读取）
 */
export async function getStoredLanguagePref(): Promise<SupportedLocale> {
  const store = getElectronStore()
  if (!store) return DEFAULT_LOCALE

  const raw = await store.get(LANGUAGE_KEY)
  return matchLocale(raw as string)
}
