/**
 * languagePrefs.ts — 语言偏好适配器
 *
 * 职责：
 * - 从 electron-store 读取 `language` 配置
 * - 支持 system / manual 两种模式
 * - system 模式下检测系统语言并匹配到 SupportedLocale
 * - manual 模式下使用用户选择的 uiLocale
 * - 应用到 i18n 状态并更新 document.documentElement
 *
 * 持久化策略（复用 configSchema）：
 * - `language` 键：存储 'system' | SupportedLocale（如 'zh-CN', 'en-US'）
 * - `languageManual` 键：存储用户手动选择的 locale（仅 manual 模式有意义）
 * - 不引入新的持久化层
 */

import { matchLocale, matchSystemLocale } from '@/shared/i18n/localeMatcher'
import { applyLanguagePrefs, DEFAULT_LOCALE, FALLBACK_LOCALE } from '@/shared/i18n'
import type { SupportedLocale, LocaleMode, LanguagePrefs } from '@/shared/i18n/localeTypes'

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

// ── 常量 ───────────────────────────────────────────────────

const LANGUAGE_KEY = 'language'
const LANGUAGE_MANUAL_KEY = 'languageManual'

// ── 系统语言检测 ───────────────────────────────────────────

/**
 * 获取系统 locale（从浏览器/Electron 环境检测）
 *
 * 使用 navigator.languages（优先）或 navigator.language。
 * 返回匹配到的 SupportedLocale。
 */
export function getSystemLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  return matchSystemLocale(
    navigator.languages ?? null,
    navigator.language ?? null
  )
}

// ── 模式判断 ───────────────────────────────────────────────

/**
 * 从 electron-store 的 language 值判断当前模式
 *
 * - 'system' → system 模式
 * - SupportedLocale → manual 模式
 * - 其他 → manual 模式（向后兼容）
 */
function resolveMode(rawLanguage: unknown): LocaleMode {
  return rawLanguage === 'system' ? 'system' : 'manual'
}

// ── 公共 API ──────────────────────────────────────────────

/**
 * 从 electron-store 加载语言偏好并应用到 i18n 状态
 *
 * 解析逻辑：
 * 1. 读取 `language` 键：
 *    - 'system' → 检测系统语言
 *    - SupportedLocale → manual 模式，直接使用
 *    - 其他/缺失 → manual 模式，使用 DEFAULT_LOCALE
 * 2. 读取 `languageManual` 键作为 manual 模式的回退
 * 3. 应用到 i18n 状态 + document.documentElement
 */
export async function loadLanguagePrefs(): Promise<LanguagePrefs> {
  const store = getElectronStore()
  if (!store) {
    const systemLocale = getSystemLocale()
    const prefs: LanguagePrefs = {
      mode: 'system',
      uiLocale: systemLocale,
      fallbackLocale: FALLBACK_LOCALE,
    }
    applyLanguagePrefs(prefs)
    return prefs
  }

  const rawLanguage = await store.get(LANGUAGE_KEY)
  const mode = resolveMode(rawLanguage)

  let uiLocale: SupportedLocale
  if (mode === 'system') {
    uiLocale = getSystemLocale()
  } else {
    // manual 模式：优先使用 language 键的值，回退到 languageManual
    if (rawLanguage && rawLanguage !== 'system') {
      uiLocale = matchLocale(rawLanguage as string)
    } else {
      const rawManual = await store.get(LANGUAGE_MANUAL_KEY)
      uiLocale = matchLocale(rawManual as string)
    }
  }

  const prefs: LanguagePrefs = {
    mode,
    uiLocale,
    fallbackLocale: FALLBACK_LOCALE,
  }

  applyLanguagePrefs(prefs)
  return prefs
}

/**
 * 保存手动语言偏好到 electron-store 并应用
 *
 * @param locale - 要设置的 locale
 */
export async function saveLanguagePref(locale: SupportedLocale): Promise<void> {
  const store = getElectronStore()
  if (store) {
    await store.set(LANGUAGE_KEY, locale)
    await store.set(LANGUAGE_MANUAL_KEY, locale)
  }

  applyLanguagePrefs({
    mode: 'manual',
    uiLocale: locale,
    fallbackLocale: FALLBACK_LOCALE,
  })
}

/**
 * 切换到跟随系统模式
 *
 * 将 language 键设为 'system'，检测系统语言并应用。
 */
export async function saveLanguagePrefSystem(): Promise<void> {
  const store = getElectronStore()
  if (store) {
    await store.set(LANGUAGE_KEY, 'system')
  }

  const systemLocale = getSystemLocale()
  applyLanguagePrefs({
    mode: 'system',
    uiLocale: systemLocale,
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
  if (raw === 'system') {
    return getSystemLocale()
  }
  return matchLocale(raw as string)
}
