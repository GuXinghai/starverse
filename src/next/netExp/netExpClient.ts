export type NetExpSettings = Readonly<{
  disableHttp2: boolean
  disableQuic: boolean
  streamInMainProcess: boolean
  forceHttp1: boolean
  tcpKeepAliveEnable: boolean
  tcpKeepAliveIdleMs: number
}>

export type NetExpRuntimeInfo = Readonly<{
  requested: Pick<NetExpSettings, 'disableHttp2' | 'disableQuic'>
  applied: Pick<NetExpSettings, 'disableHttp2' | 'disableQuic'>
  appliedSwitches: Array<{ name: string; value?: string }>
  switchErrors?: Array<{ name: string; error: string }>
  electron: string
  chrome: string
  node: string
  argv: string[]
  appliedAt: string
}>

export const DEFAULT_NETEXP_SETTINGS: NetExpSettings = {
  disableHttp2: false,
  disableQuic: false,
  streamInMainProcess: false,
  forceHttp1: false,
  tcpKeepAliveEnable: false,
  tcpKeepAliveIdleMs: 60000,
}

const NETEXP_KEYS = {
  disableHttp2: 'netExp.disableHttp2',
  disableQuic: 'netExp.disableQuic',
  streamInMainProcess: 'netExp.streamInMainProcess',
  forceHttp1: 'netExp.forceHttp1',
  tcpKeepAliveEnable: 'netExp.tcpKeepAliveEnable',
  tcpKeepAliveIdleMs: 'netExp.tcpKeepAliveIdleMs',
} as const

type ElectronStoreLike = Readonly<{
  get: (key: string) => Promise<any>
  set: (key: string, value: any) => Promise<any>
}>

type IpcRendererLike = Readonly<{
  invoke: (channel: string, ...args: any[]) => Promise<any>
}>

function getElectronStore(): ElectronStoreLike | null {
  const store = (globalThis as any).electronStore as ElectronStoreLike | undefined
  if (!store) return null
  if (typeof store.get !== 'function' || typeof store.set !== 'function') return null
  return store
}

function getIpcRenderer(): IpcRendererLike | null {
  const ipc = (globalThis as any).ipcRenderer as IpcRendererLike | undefined
  if (!ipc || typeof ipc.invoke !== 'function') return null
  return ipc
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export async function getNetExpSettings(): Promise<NetExpSettings> {
  const store = getElectronStore()
  if (!store) return DEFAULT_NETEXP_SETTINGS

  const [
    disableHttp2Raw,
    disableQuicRaw,
    streamInMainProcessRaw,
    forceHttp1Raw,
    tcpKeepAliveEnableRaw,
    tcpKeepAliveIdleMsRaw,
  ] = await Promise.all([
    store.get(NETEXP_KEYS.disableHttp2),
    store.get(NETEXP_KEYS.disableQuic),
    store.get(NETEXP_KEYS.streamInMainProcess),
    store.get(NETEXP_KEYS.forceHttp1),
    store.get(NETEXP_KEYS.tcpKeepAliveEnable),
    store.get(NETEXP_KEYS.tcpKeepAliveIdleMs),
  ])

  return {
    disableHttp2: coerceBoolean(disableHttp2Raw, DEFAULT_NETEXP_SETTINGS.disableHttp2),
    disableQuic: coerceBoolean(disableQuicRaw, DEFAULT_NETEXP_SETTINGS.disableQuic),
    streamInMainProcess: coerceBoolean(streamInMainProcessRaw, DEFAULT_NETEXP_SETTINGS.streamInMainProcess),
    forceHttp1: coerceBoolean(forceHttp1Raw, DEFAULT_NETEXP_SETTINGS.forceHttp1),
    tcpKeepAliveEnable: coerceBoolean(tcpKeepAliveEnableRaw, DEFAULT_NETEXP_SETTINGS.tcpKeepAliveEnable),
    tcpKeepAliveIdleMs: coerceNumber(tcpKeepAliveIdleMsRaw, DEFAULT_NETEXP_SETTINGS.tcpKeepAliveIdleMs),
  }
}

export async function setNetExpSettings(settings: NetExpSettings): Promise<void> {
  const store = getElectronStore()
  if (!store) return

  const idleMs = Number.isFinite(settings.tcpKeepAliveIdleMs)
    ? Math.max(0, Math.floor(settings.tcpKeepAliveIdleMs))
    : DEFAULT_NETEXP_SETTINGS.tcpKeepAliveIdleMs

  await Promise.all([
    store.set(NETEXP_KEYS.disableHttp2, settings.disableHttp2 === true),
    store.set(NETEXP_KEYS.disableQuic, settings.disableQuic === true),
    store.set(NETEXP_KEYS.streamInMainProcess, settings.streamInMainProcess === true),
    store.set(NETEXP_KEYS.forceHttp1, settings.forceHttp1 === true),
    store.set(NETEXP_KEYS.tcpKeepAliveEnable, settings.tcpKeepAliveEnable === true),
    store.set(NETEXP_KEYS.tcpKeepAliveIdleMs, idleMs),
  ])
}

export async function getNetExpRuntimeInfo(): Promise<NetExpRuntimeInfo | null> {
  const ipc = getIpcRenderer()
  if (!ipc) return null
  try {
    const result = await ipc.invoke('netexp:get-runtime-info')
    return result ?? null
  } catch {
    return null
  }
}
