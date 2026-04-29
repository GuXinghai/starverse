import { describe, expect, it } from 'vitest'
import {
  CHAT_MAIN_MIN_READABLE_WIDTH_PX,
  CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX,
  CHAT_RIGHT_RAIL_MAX_FLOATING_VIEWPORT_RATIO,
  CHAT_RIGHT_RAIL_SWITCH_HYSTERESIS_PX,
  CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX,
  resolveChatWorkspaceRightRailMode,
} from '@/shared/ui/chatWorkspaceLayout'

describe('chatWorkspaceLayout', () => {
  const dockThresholdPx = CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX + CHAT_MAIN_MIN_READABLE_WIDTH_PX

  it('keeps the right rail docked when the chat area remains at least as wide as the rail', () => {
    expect(resolveChatWorkspaceRightRailMode({
      isOpen: true,
      availableWidthPx: dockThresholdPx,
      previousMode: 'docked',
    })).toBe('docked')
  })

  it('switches the right rail to floating when the chat area would become narrower than the rail', () => {
    expect(resolveChatWorkspaceRightRailMode({
      isOpen: true,
      availableWidthPx: dockThresholdPx - 1,
      previousMode: 'docked',
    })).toBe('floating')
  })

  it('uses hysteresis before restoring docked mode from floating mode', () => {
    expect(resolveChatWorkspaceRightRailMode({
      isOpen: true,
      availableWidthPx: dockThresholdPx + CHAT_RIGHT_RAIL_SWITCH_HYSTERESIS_PX - 1,
      previousMode: 'floating',
    })).toBe('floating')

    expect(resolveChatWorkspaceRightRailMode({
      isOpen: true,
      availableWidthPx: dockThresholdPx + CHAT_RIGHT_RAIL_SWITCH_HYSTERESIS_PX,
      previousMode: 'floating',
    })).toBe('docked')
  })

  it('returns closed when the user closes the right rail', () => {
    expect(resolveChatWorkspaceRightRailMode({
      isOpen: false,
      availableWidthPx: dockThresholdPx + CHAT_RIGHT_RAIL_SWITCH_HYSTERESIS_PX,
      previousMode: 'docked',
    })).toBe('closed')
  })

  it('caps window shrinking once the floating rail would exceed two-thirds of the viewport', () => {
    expect(CHAT_WORKSPACE_MIN_WINDOW_WIDTH_PX).toBe(
      Math.ceil(CHAT_RIGHT_RAIL_DEFAULT_WIDTH_PX / CHAT_RIGHT_RAIL_MAX_FLOATING_VIEWPORT_RATIO),
    )
  })
})
