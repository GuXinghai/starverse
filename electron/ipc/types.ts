export type IpcInvokeHandler = (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>

export type RegisterInvoke = (channel: string, handler: IpcInvokeHandler) => void