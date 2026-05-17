/**
 * messageSchema.ts — 消息 key 类型辅助
 *
 * 用于在编译时检查消息 key 的正确性。
 * 实际消息文件为 JSON（zh-CN/common.json, en-US/common.json）。
 */

import type { SupportedLocale } from './localeTypes'

/**
 * common namespace 的消息 key 类型
 * 手动与 JSON 文件保持同步，用于类型提示。
 */
export interface CommonMessages {
  readonly common: {
    readonly ok: string
    readonly cancel: string
    readonly confirm: string
    readonly save: string
    readonly delete: string
    readonly close: string
    readonly reload: string
    readonly show: string
    readonly hide: string
    readonly clear: string
    readonly search: string
    readonly create: string
    readonly rename: string
    readonly remove: string
    readonly loading: string
    readonly error: string
    readonly copied: string
    readonly on: string
    readonly off: string
    readonly enabled: string
    readonly disabled: string
    readonly settings: string
    readonly untitledConversation: string
  }
}

/**
 * 所有 namespace 的消息类型总表
 * 扩展新 namespace 时在此处添加。
 */
export interface AllMessages extends CommonMessages {}

/**
 * 消息 key 的路径类型
 * 例如 'common.ok', 'common.settings'
 */
export type MessageKey = {
  [NS in keyof AllMessages]: {
    [K in keyof AllMessages[NS]]: `${NS}.${string & K}`
  }
}[keyof AllMessages][keyof AllMessages[keyof AllMessages]]

/** 获取 locale 消息 JSON 文件路径的辅助函数（运行时由 Vite 处理） */
export function getLocaleMessagesUrl(locale: SupportedLocale, namespace: string): string {
  return `/locales/${locale}/${namespace}.json`
}
