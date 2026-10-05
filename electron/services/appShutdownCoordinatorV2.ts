import { QUIT_WARNING_PREFERENCE_KEY, normalizeStoredQuitWarningEnabled } from '../../src/shared/settings/quitWarningPreference'
import { GENERATION_V2_UI_PREFERENCE_NAMESPACE } from '../../src/shared/settings/generationV2UiPreferenceKeys'

/**
 * A component whose work can still write state or depend on persistent resources.
 * `quiesce` must reject new work, abort in-flight work and resolve once it has drained; the
 * coordinator bounds the wait, so a source never has to implement its own overall timeout.
 * `seal` runs after the drain (or its timeout) and must turn late callbacks into no-ops.
 */
export type ActiveWorkSourceV2 = Readonly<{
  name: string
  activeCount: () => number
  quiesce: () => Promise<void>
  seal?: () => void
}>

export type RegisterActiveWorkSourceV2 = (source: ActiveWorkSourceV2) => void

export const APP_SHUTDOWN_DRAIN_TIMEOUT_MS_V2 = 5_000

export function createStoreBackedQuitWarningSourceV2(store: Readonly<{ get: (key: string) => unknown }>): () => boolean {
  return () => {
    try {
      const prefs = store.get(GENERATION_V2_UI_PREFERENCE_NAMESPACE)
      const raw = prefs && typeof prefs === 'object' ? (prefs as Record<string, unknown>)[QUIT_WARNING_PREFERENCE_KEY] : undefined
      return normalizeStoredQuitWarningEnabled(raw)
    } catch { return true }
  }
}

type ShutdownState = 'running' | 'confirming' | 'shutting_down'

export type AppShutdownCoordinatorV2 = Readonly<{
  registerSource: RegisterActiveWorkSourceV2
  /** Always prevents the default quit; the coordinator ends the process through `exit`. */
  handleBeforeQuit: (event: Readonly<{ preventDefault: () => void }>) => void
  readonly state: ShutdownState
}>

export function createAppShutdownCoordinatorV2(input: Readonly<{
  isWarningEnabled: () => boolean
  confirmQuit: () => Promise<boolean>
  /** Runs once, after active work is drained: closes DB/store/resources. */
  closeResources: () => Promise<void>
  exit: (code: number) => void
  onQuitCancelled?: () => void
  /** Runs when shutdown is confirmed, before work is quiesced (e.g. detach window listeners). */
  onShutdownStarted?: () => void
  drainTimeoutMs?: number
  log?: (code: string) => void
}>): AppShutdownCoordinatorV2 {
  const sources: ActiveWorkSourceV2[] = []
  const drainTimeoutMs = input.drainTimeoutMs ?? APP_SHUTDOWN_DRAIN_TIMEOUT_MS_V2
  const log = input.log ?? ((code: string) => console.warn(`[main-v2] ${code}`))
  let state: ShutdownState = 'running'

  const hasActiveWork = () => sources.some((source) => {
    try { return source.activeCount() > 0 } catch { return true }
  })

  async function boundedQuiesce(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), drainTimeoutMs) })
    const drained = Promise.allSettled(sources.map(async (source) => {
      try { await source.quiesce() } catch { log(`MAIN_V2_SHUTDOWN_QUIESCE_FAILED:${source.name}`) }
    })).then(() => 'drained' as const)
    try {
      if (await Promise.race([drained, timeout]) === 'timeout') log('MAIN_V2_SHUTDOWN_DRAIN_TIMEOUT')
    } finally { if (timer) clearTimeout(timer) }
  }

  async function runShutdown(): Promise<void> {
    state = 'shutting_down'
    try {
      input.onShutdownStarted?.()
      await boundedQuiesce()
      for (const source of sources) { try { source.seal?.() } catch { /* sealing is best effort */ } }
      await input.closeResources()
      input.exit(0)
    } catch {
      log('MAIN_V2_SHUTDOWN_FAILED')
      input.exit(1)
    }
  }

  async function confirmThenShutdown(): Promise<void> {
    state = 'confirming'
    let confirmed = false
    try { confirmed = await input.confirmQuit() } catch { confirmed = false }
    if (!confirmed) {
      state = 'running'
      input.onQuitCancelled?.()
      return
    }
    await runShutdown()
  }

  return {
    registerSource: (source) => { sources.push(source) },
    handleBeforeQuit: (event) => {
      event.preventDefault()
      if (state !== 'running') return
      if (hasActiveWork() && input.isWarningEnabled()) void confirmThenShutdown()
      else void runShutdown()
    },
    get state() { return state },
  }
}
