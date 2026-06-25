export const SETTINGS_KEY_OPENROUTER_PROVIDER_REQUIRE_PARAMETERS = 'openrouter.provider.require_parameters' as const
export const SETTINGS_KEY_REASONING_PREFS = 'reasoning.prefs' as const
export const SETTINGS_KEY_USER_MESSAGE_RENDER_DEFAULT = 'chat.user_message_render.default' as const
export const SETTINGS_KEY_WEB_SEARCH_DEFAULTS = 'web_search.defaults' as const
export const SETTINGS_KEY_IMAGE_GENERATION_DEFAULT = 'image_generation.default' as const
export const SETTINGS_KEY_DFC_ATTACHMENT_DEFAULTS = 'dfc.attachment.defaults.v1' as const
export const SETTINGS_KEY_SAMPLING_PARAMS_DEFAULTS = 'sampling_params.defaults' as const
export const SETTINGS_KEY_CHAT_REASONING_DISPLAY_MODE = 'chat.reasoning_display.mode' as const
export const SETTINGS_KEY_CHAT_REASONING_PANEL_DEFAULT_EXPANDED = 'chat.reasoning_panel.default_expanded' as const
export const SETTINGS_KEY_CHAT_DRAFT_PREFIX = 'chat.draft::' as const
export const SETTINGS_KEY_NETWORK_PROXY = 'network.proxy' as const

export function buildChatDraftSettingsKey(convoId: string, branchId: string): string {
  const convo = String(convoId ?? '').trim()
  const branch = String(branchId ?? '').trim()
  if (!convo || !branch) throw new Error('Missing convoId/branchId')
  return `${SETTINGS_KEY_CHAT_DRAFT_PREFIX}${convo}::${branch}`
}

export function buildChatDraftConvoPrefix(convoId: string): string {
  const convo = String(convoId ?? '').trim()
  if (!convo) throw new Error('Missing convoId')
  return `${SETTINGS_KEY_CHAT_DRAFT_PREFIX}${convo}::`
}
