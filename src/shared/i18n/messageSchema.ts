/**
 * messageSchema.ts — 消息 key 类型辅助
 *
 * 用于在编译时检查消息 key 的正确性。
 * 实际消息文件为 JSON（zh-CN/*.json, en-US/*.json）。
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
    readonly saved: string
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
    readonly language: string
    readonly languageFollowSystem: string
    readonly languageFollowSystemDesc: string
    readonly languageManual: string
    readonly retry: string
    readonly copy: string
    readonly move: string
    readonly done: string
    readonly select: string
    readonly refresh: string
    readonly new: string
    readonly send: string
    readonly stop: string
    readonly attach: string
    readonly yes: string
    readonly no: string
    readonly generating: string
    readonly streaming: string
    readonly encrypted: string
    readonly summary: string
    readonly untitled: string
    readonly images: string
    readonly references: string
    readonly toolCalls: string
    readonly closePreview: string
  }
}

/**
 * settings namespace
 */
export interface SettingsMessages {
  readonly settings: {
    readonly title: string
    readonly language: {
      readonly title: string
      readonly followSystem: string
      readonly followSystemDesc: string
      readonly manual: string
      readonly simplifiedChinese: string
      readonly englishUS: string
    }
    readonly openrouter: {
      readonly title: string
      readonly apiKey: string
      readonly apiKeyPlaceholder: string
      readonly apiKeyCleared: string
      readonly baseUrl: string
      readonly baseUrlPlaceholder: string
      readonly baseUrlInvalid: string
      readonly baseUrlCleared: string
      readonly requireParameters: string
      readonly requireParametersDesc: string
      readonly debugEcho: string
      readonly debugEchoDesc: string
    }
    readonly network: {
      readonly title: string
      readonly disableHttp2: string
      readonly disableHttp2Desc: string
      readonly disableQuic: string
      readonly disableQuicDesc: string
      readonly streamInMain: string
      readonly streamInMainDesc: string
      readonly forceHttp1: string
      readonly forceHttp1Desc: string
      readonly tcpKeepalive: string
      readonly tcpKeepaliveDesc: string
      readonly tcpKeepaliveIdle: string
      readonly tcpKeepaliveIdleDesc: string
      readonly copyRunReport: string
      readonly copyRunReportDesc: string
      readonly runReportCopied: string
    }
    readonly reasoning: {
      readonly title: string
      readonly reasoning: string
      readonly exclude: string
      readonly hint: string
      readonly inlineDefault: string
      readonly inlineDefaultDesc: string
      readonly expanded: string
      readonly collapsed: string
      readonly userMessageRich: string
      readonly userMessageRichDesc: string
      readonly recentModelsLimit: string
      readonly recentModelsLimitDesc: string
    }
    readonly search: {
      readonly title: string
      readonly hintDefault: string
      readonly hintGlobal: string
    }
    readonly customParams: { readonly title: string }
    readonly footer: string
  }
}

/**
 * navigation namespace
 */
export interface NavigationMessages {
  readonly navigation: {
    readonly project: {
      readonly title: string
      readonly newProject: string
      readonly renameProject: string
      readonly deleteProject: string
      readonly projectName: string
      readonly deleteConfirm: string
      readonly systemProjectNoRename: string
      readonly systemProjectNoDelete: string
      readonly projectSettings: string
    }
    readonly conversation: {
      readonly title: string
      readonly newConversation: string
      readonly renameConversation: string
      readonly deleteConversation: string
      readonly deleteConversationConfirm: string
      readonly moveToProject: string
      readonly movePrompt: string
      readonly noProject: string
    }
    readonly empty: {
      readonly noConversations: string
      readonly noProjects: string
      readonly allConversations: string
    }
    readonly actions: {
      readonly selectAll: string
      readonly bulkMove: string
      readonly bulkDelete: string
      readonly selected: string
      readonly moreActions: string
    }
  }
}

/**
 * composer namespace
 */
export interface ComposerMessages {
  readonly composer: {
    readonly placeholder: {
      readonly default: string
    }
    readonly actions: {
      readonly send: string
      readonly stop: string
      readonly attach: string
      readonly removeAttachment: string
      readonly uploadFile: string
      readonly uploadImage: string
      readonly uploadLink: string
    }
    readonly capabilities: {
      readonly reasoning: string
      readonly webSearch: string
      readonly image: string
      readonly enabledSuffix: string
    }
    readonly status: {
      readonly noSendableInput: string
      readonly updatingSendPlan: string
      readonly model: string
    }
    readonly modelPicker: {
      readonly favorites: string
      readonly recents: string
      readonly favoriteModels: string
      readonly recentModels: string
      readonly noFavorites: string
      readonly noRecents: string
    }
  }
}

/**
 * 所有 namespace 的消息类型总表
 * 扩展新 namespace 时在此处添加。
 */
export interface AllMessages extends CommonMessages, SettingsMessages, NavigationMessages, ComposerMessages {}

/**
 * 消息 key 的路径类型
 * 例如 'common.ok', 'settings.title'
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
