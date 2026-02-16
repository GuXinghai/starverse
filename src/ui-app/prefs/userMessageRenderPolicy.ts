export type UserMessageRenderMode = 'on' | 'follow' | 'off'

export type UserMessageRenderPolicy = Readonly<{
  effective: boolean
  isOverride: boolean
  mode: UserMessageRenderMode
}>

export function resolveUserMessageRenderPolicy(
  globalDefault: boolean | null | undefined,
  convoMetaValue: boolean | undefined,
): UserMessageRenderPolicy {
  if (convoMetaValue === true) {
    return { effective: true, isOverride: true, mode: 'on' }
  }
  if (convoMetaValue === false) {
    return { effective: false, isOverride: true, mode: 'off' }
  }
  return {
    effective: globalDefault === true,
    isOverride: false,
    mode: 'follow',
  }
}

export function nextTriState(mode: UserMessageRenderMode): UserMessageRenderMode {
  if (mode === 'follow') return 'on'
  if (mode === 'on') return 'off'
  return 'follow'
}

