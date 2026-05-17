export type SendButtonMode =
  | 'enabled_arrow'
  | 'disabled_arrow'
  | 'stop_square'
  | 'busy_spinner'

export interface DeriveSendButtonModeInput {
  isRunning: boolean
  isSendPlanLoading: boolean
  canSend: boolean
}

export function deriveSendButtonMode(input: DeriveSendButtonModeInput): SendButtonMode {
  if (input.isRunning) return 'stop_square'
  if (input.isSendPlanLoading) return 'busy_spinner'
  if (input.canSend) return 'enabled_arrow'
  return 'disabled_arrow'
}
