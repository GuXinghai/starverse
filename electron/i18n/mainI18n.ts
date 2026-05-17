/**
 * mainI18n.ts — 主进程 i18n 适配器
 *
 * 不依赖 Vue/DOM，可安全在 Electron main process 中使用。
 * 复用 src/shared/i18n 的 locale registry、matcher 和 JSON message bundles。
 *
 * 用法：
 *   import { initMainI18n, t, tf } from './i18n/mainI18n'
 *   // 启动时初始化一次
 *   initMainI18n(store)
 *   // 使用
 *   dialog.showErrorBox(t('dialogs.startup.dbInitFailed'), t('dialogs.startup.dbWorkerFailed'))
 */

import type { SupportedLocale } from '../../src/shared/i18n/localeTypes'
import { DEFAULT_LOCALE, FALLBACK_LOCALE, isSupportedLocale } from '../../src/shared/i18n/localeRegistry'
import { matchSystemLocale } from '../../src/shared/i18n/localeMatcher'

// ── 静态导入消息（与 renderer index.ts 保持一致） ──────────
import zhCNCommon from '../../src/shared/i18n/locales/zh-CN/common.json'
import enUSCommon from '../../src/shared/i18n/locales/en-US/common.json'
import zhCNSettings from '../../src/shared/i18n/locales/zh-CN/settings.json'
import enUSSettings from '../../src/shared/i18n/locales/en-US/settings.json'
import zhCNNavigation from '../../src/shared/i18n/locales/zh-CN/navigation.json'
import enUSNavigation from '../../src/shared/i18n/locales/en-US/navigation.json'
import zhCNComposer from '../../src/shared/i18n/locales/zh-CN/composer.json'
import enUSComposer from '../../src/shared/i18n/locales/en-US/composer.json'
import zhCNSendPlan from '../../src/shared/i18n/locales/zh-CN/sendPlan.json'
import enUSSendPlan from '../../src/shared/i18n/locales/en-US/sendPlan.json'
import zhCNErrors from '../../src/shared/i18n/locales/zh-CN/errors.json'
import enUSErrors from '../../src/shared/i18n/locales/en-US/errors.json'
import zhCNDiagnostics from '../../src/shared/i18n/locales/zh-CN/diagnostics.json'
import enUSDiagnostics from '../../src/shared/i18n/locales/en-US/diagnostics.json'
import zhCNFilePipeline from '../../src/shared/i18n/locales/zh-CN/filePipeline.json'
import enUSFilePipeline from '../../src/shared/i18n/locales/en-US/filePipeline.json'
import zhCNDialogs from '../../src/shared/i18n/locales/zh-CN/dialogs.json'
import enUSDialogs from '../../src/shared/i18n/locales/en-US/dialogs.json'

// ── 消息注册表 ────────────────────────────────────────────

type MessageBundle = Record<string, unknown>

const messageRegistry: Record<SupportedLocale, Record<string, MessageBundle>> = {
  'zh-CN': {
    common: zhCNCommon as unknown as MessageBundle,
    settings: zhCNSettings as unknown as MessageBundle,
    navigation: zhCNNavigation as unknown as MessageBundle,
    composer: zhCNComposer as unknown as MessageBundle,
    sendPlan: zhCNSendPlan as unknown as MessageBundle,
    errors: zhCNErrors as unknown as MessageBundle,
    diagnostics: zhCNDiagnostics as unknown as MessageBundle,
    filePipeline: zhCNFilePipeline as unknown as MessageBundle,
    dialogs: zhCNDialogs as unknown as MessageBundle,
  },
  'en-US': {
    common: enUSCommon as unknown as MessageBundle,
    settings: enUSSettings as unknown as MessageBundle,
    navigation: enUSNavigation as unknown as MessageBundle,
    composer: enUSComposer as unknown as MessageBundle,
    sendPlan: enUSSendPlan as unknown as MessageBundle,
    errors: enUSErrors as unknown as MessageBundle,
    diagnostics: enUSDiagnostics as unknown as MessageBundle,
    filePipeline: enUSFilePipeline as unknown as MessageBundle,
    dialogs: enUSDialogs as unknown as MessageBundle,
  },
}

// ── 当前 locale 状态 ──────────────────────────────────────

let currentLocale: SupportedLocale = DEFAULT_LOCALE

// ── 消息查找 ──────────────────────────────────────────────

function getMessages(locale: SupportedLocale, namespace: string): MessageBundle | undefined {
  const localeBundle = messageRegistry[locale]?.[namespace]
  if (!localeBundle) return undefined
  const inner = (localeBundle as any)[namespace]
  return (typeof inner === 'object' && inner !== null) ? inner : localeBundle
}

function lookup(bundle: MessageBundle | undefined, key: string): string | undefined {
  if (!bundle) return undefined
  const parts = key.split('.')
  let current: any = bundle
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = current[part]
  }
  return typeof current === 'string' ? current : undefined
}

// ── 公共 API ──────────────────────────────────────────────

/**
 * 从 electron-store 读取 language/languageManual 并解析为 SupportedLocale。
 *
 * 规则：
 * - language = 'system' → 使用 app.getPreferredSystemLanguages() 匹配
 * - language = 'zh-CN' | 'en-US' → 直接使用
 * - languageManual 为用户手动选择的 locale（当 language 为 manual 时使用）
 * - 未知值 → DEFAULT_LOCALE
 *
 * @param store - electron-store 实例（需支持 .get(key) 方法）
 * @param systemLanguages - 可选，系统语言列表（用于 system 模式）
 */
export function resolveMainLocale(
  store: { get: (key: string) => unknown },
  systemLanguages?: readonly string[] | null
): SupportedLocale {
  const language = store.get('language')
  if (language === 'system') {
    return matchSystemLocale(systemLanguages ?? null, null)
  }
  // 直接匹配 language 值（可能是 'zh-CN', 'en-US', 或旧值）
  if (isSupportedLocale(language)) {
    return language
  }
  // 兼容旧配置：language 可能存储的是手动选择的 locale
  const languageManual = store.get('languageManual')
  if (isSupportedLocale(languageManual)) {
    return languageManual
  }
  return DEFAULT_LOCALE
}

/**
 * 初始化主进程 i18n。
 *
 * 在 app.whenReady() 之前或之后调用均可。
 * 读取 electron-store 配置，设置当前 locale。
 *
 * @param store - electron-store 实例
 * @param systemLanguages - 可选，系统语言列表
 */
export function initMainI18n(
  store: { get: (key: string) => unknown },
  systemLanguages?: readonly string[] | null
): void {
  currentLocale = resolveMainLocale(store, systemLanguages)
}

/**
 * 直接设置主进程 locale（用于测试或运行时切换）。
 */
export function setMainLocale(locale: SupportedLocale): void {
  currentLocale = locale
}

/**
 * 获取当前主进程 locale。
 */
export function getMainLocale(): SupportedLocale {
  return currentLocale
}

/**
 * 主进程翻译函数。
 *
 * 用法：t('dialogs.startup.dbInitFailed')
 *
 * Lookup 逻辑与 renderer t() 一致：
 * 1. 自动检测 key 前缀中的 namespace
 * 2. 在检测到的 namespace 中查找剩余 key
 * 3. 回退到 FALLBACK_LOCALE
 * 4. 最终回退返回原始 key
 *
 * @param key - 消息 key（dot-separated path）
 * @param locale - 可选，覆盖当前 locale
 * @returns 翻译后的字符串，若缺失则返回 key 本身
 */
export function t(key: string, locale?: SupportedLocale): string {
  const loc = locale ?? currentLocale
  const fallback = FALLBACK_LOCALE

  const dotIdx = key.indexOf('.')
  if (dotIdx > 0) {
    const candidateNs = key.substring(0, dotIdx)
    const localeRegistry = messageRegistry[loc]
    const fallbackRegistry = messageRegistry[fallback]
    const hasNs = (localeRegistry && candidateNs in localeRegistry) || (fallbackRegistry && candidateNs in fallbackRegistry)
    if (hasNs) {
      const innerKey = key.substring(dotIdx + 1)
      const nsResult =
        lookup(getMessages(loc, candidateNs), innerKey) ??
        lookup(getMessages(fallback, candidateNs), innerKey)
      if (nsResult !== undefined) return nsResult
    }
  }

  // Phase 2: Try full key in common namespace
  const directResult =
    lookup(getMessages(loc, 'common'), key) ??
    lookup(getMessages(fallback, 'common'), key)
  if (directResult !== undefined) return directResult

  return key
}

/**
 * 带参数插值的翻译函数。
 *
 * 用法：tf('dialogs.errors.downloadFailed', { status: 404 })
 *       → '下载失败：HTTP 404。' (zh-CN)
 *       → 'Download failed: HTTP 404.' (en-US)
 *
 * @param key - 消息 key
 * @param params - 插值参数 { name: 'World' } → '{name}' → 'World'
 * @param locale - 可选，覆盖当前 locale
 */
export function tf(key: string, params: Record<string, string | number>, locale?: SupportedLocale): string {
  let message = t(key, locale)
  for (const [k, v] of Object.entries(params)) {
    message = message.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  }
  return message
}

/**
 * 重置为默认 locale（仅用于测试）。
 */
export function resetMainI18nForTests(): void {
  currentLocale = DEFAULT_LOCALE
}
