export const CHAT_WORKSPACE_SIDEBAR_MIN_WIDTH_PX = 320
export const CHAT_WORKSPACE_SIDEBAR_DEFAULT_WIDTH_PX = 320
export const CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX = 384
export const CHAT_RIGHT_RAIL_MIN_WIDTH_PX = 384
export const CHAT_MAIN_MIN_READABLE_WIDTH_PX = 960
export const CHAT_RIGHT_RAIL_SWITCH_HYSTERESIS_PX = 32
export const CHAT_RIGHT_RAIL_MAX_FLOATING_VIEWPORT_RATIO = 2 / 3
export const CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX = Math.ceil(
  CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX / CHAT_RIGHT_RAIL_MAX_FLOATING_VIEWPORT_RATIO,
)

export type ChatWorkspaceRightRailMode = 'closed' | 'docked' | 'floating'

export function resolveChatWorkspaceRightRailMode(input: Readonly<{
  isOpen: boolean
  availableWidthPx: number
  previousMode: ChatWorkspaceRightRailMode
}>): ChatWorkspaceRightRailMode {
  if (!input.isOpen) return 'closed'

  const chatWidthAfterDockPx = Math.max(0, input.availableWidthPx - CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX)
  const canDock = chatWidthAfterDockPx >= CHAT_MAIN_MIN_READABLE_WIDTH_PX
  const canRestoreDock =
    Math.max(0, input.availableWidthPx - CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX - CHAT_RIGHT_RAIL_SWITCH_HYSTERESIS_PX)
      >= CHAT_MAIN_MIN_READABLE_WIDTH_PX
  const previousMode =
    input.previousMode === 'closed'
      ? 'floating'
      : input.previousMode

  if (previousMode === 'docked') {
    return canDock ? 'docked' : 'floating'
  }

  return canRestoreDock ? 'docked' : 'floating'
}
