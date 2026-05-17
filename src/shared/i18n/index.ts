/**
 * index.ts — i18n 公共 API
 *
 * 职责：
 * - 导出所有 i18n 模块的公共接口
 * - 提供消息查找函数（纯函数，不依赖 Vue）
 * - 提供当前 locale 状态管理（响应式，供 Vue 组件使用）
 *
 * 设计原则：
 * - 消息查找是纯函数，可在任何上下文中使用（主进程、Worker、测试）
 * - locale 状态通过 reactive ref 管理，仅在 Vue 渲染进程中使用
 * - 不在此处接入 vue-i18n；Vue 集成在后续任务包中完成
 */

import { reactive, ref, readonly } from 'vue'
import type { SupportedLocale, LocaleMode, LanguagePrefs, MessageBundle } from './localeTypes'
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALE_DISPLAY_NAMES, LOCALE_DIRECTION, isSupportedLocale } from './localeRegistry'
import { matchLocale, matchSystemLocale, normalizeLanguagePrefs } from './localeMatcher'
import { formatDate, formatTime, formatRelativeTime, formatNumber, formatFileSize } from './formatters'

// ── 静态导入消息 ──────────────────────────────────────────
import zhCNCommon from './locales/zh-CN/common.json'
import enUSCommon from './locales/en-US/common.json'

// ── 消息注册表 ────────────────────────────────────────────

const messageRegistry: Record<SupportedLocale, Record<string, MessageBundle>> = {
  'zh-CN': { common: zhCNCommon as unknown as MessageBundle },
  'en-US': { common: enUSCommon as unknown as MessageBundle },
}

/**
 * 获取指定 locale + namespace 的消息包
 */
export function getMessages(locale: SupportedLocale, namespace: string): MessageBundle | undefined {
  return messageRegistry[locale]?.[namespace]
}

// ── 消息查找（纯函数） ────────────────────────────────────

/**
 * 从消息包中按 dot-path 查找值
 */
function lookupKey(bundle: MessageBundle | undefined, key: string): string | undefined {
  if (!bundle) return undefined
  const parts = key.split('.')
  let current: any = bundle
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * 查找消息，带 fallback 支持
 *
 * @param key - 消息 key（如 'common.ok'）
 * @param locale - 当前 locale
 * @param fallback - 回退 locale
 * @param namespace - 命名空间（默认 'common'）
 * @returns 消息字符串，若全部缺失则返回 key 本身
 */
export function t(
  key: string,
  locale: SupportedLocale = currentLocale.value,
  fallback: SupportedLocale = FALLBACK_LOCALE,
  namespace = 'common'
): string {
  return (
    lookupKey(getMessages(locale, namespace), key) ??
    lookupKey(getMessages(fallback, namespace), key) ??
    key
  )
}

// ── 响应式 locale 状态（仅 Vue 渲染进程） ──────────────────

/** 当前生效的 locale */
const currentLocale = ref<SupportedLocale>(DEFAULT_LOCALE)

/** 当前语言偏好（完整） */
const currentPrefs = reactive<LanguagePrefs>({
  mode: 'manual',
  uiLocale: DEFAULT_LOCALE,
  fallbackLocale: FALLBACK_LOCALE,
})

/**
 * 获取当前 locale（只读 ref）
 */
export function useCurrentLocale() {
  return readonly(currentLocale)
}

/**
 * 获取当前语言偏好（只读 reactive）
 */
export function useLanguagePrefs() {
  return readonly(currentPrefs)
}

/**
 * 应用语言偏好
 *
 * 通常由 `languagePrefs.ts` 从 electron-store 读取后调用。
 * 也可用于语言切换 UI。
 */
export function applyLanguagePrefs(prefs: {
  mode?: unknown
  uiLocale?: unknown
  fallbackLocale?: unknown
}): void {
  const normalized = normalizeLanguagePrefs(prefs)
  currentPrefs.mode = normalized.mode
  currentPrefs.uiLocale = normalized.uiLocale
  currentPrefs.fallbackLocale = normalized.fallbackLocale
  currentLocale.value = normalized.uiLocale
  updateDocumentLocale(normalized.uiLocale)
}

/**
 * 直接设置 locale（快捷方式）
 */
export function setLocale(locale: SupportedLocale): void {
  currentLocale.value = locale
  currentPrefs.uiLocale = locale
  currentPrefs.mode = 'manual'
  updateDocumentLocale(locale)
}

/**
 * 获取当前 locale（非响应式，同步返回当前值）
 *
 * 供纯 TS 模块安全读取，无需访问 Vue ref。
 */
export function getCurrentLocale(): SupportedLocale {
  return currentLocale.value
}

/**
 * 更新 document.documentElement 的 lang 和 dir 属性
 */
export function updateDocumentLocale(locale: SupportedLocale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.documentElement.dir = LOCALE_DIRECTION[locale]
}

// ── 带参数的消息格式化 ────────────────────────────────────

/**
 * 带插值的消息格式化
 *
 * @param key - 消息 key
 * @param params - 插值参数 { name: 'World' } → 'Hello, {name}!' → 'Hello, World!'
 * @param locale - 当前 locale
 */
export function tf(
  key: string,
  params: Record<string, string | number>,
  locale: SupportedLocale = currentLocale.value
): string {
  let message = t(key, locale)
  for (const [k, v] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  }
  return message
}

// ── 重导出 ────────────────────────────────────────────────

export type { SupportedLocale, LocaleMode, LanguagePrefs, MessageBundle }
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  LOCALE_DISPLAY_NAMES,
  LOCALE_DIRECTION,
  isSupportedLocale,
  matchLocale,
  matchSystemLocale,
  normalizeLanguagePrefs,
  formatDate,
  formatTime,
  formatRelativeTime,
  formatNumber,
  formatFileSize,
}
