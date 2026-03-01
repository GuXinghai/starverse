import type { RegisterInvoke } from './types'

export const NETEXP_IPC_CHANNELS = ['netexp:get-runtime-info'] as const

type RegisterNetExpIpcInput = Readonly<{
  registerInvoke: RegisterInvoke
  runtimeInfo: unknown
}>

export function registerNetExpIpc(input: RegisterNetExpIpcInput): string[] {
  const { registerInvoke, runtimeInfo } = input

  registerInvoke('netexp:get-runtime-info', () => runtimeInfo)

  return [...NETEXP_IPC_CHANNELS]
}