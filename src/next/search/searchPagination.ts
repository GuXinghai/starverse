import type { SearchSessionStatus } from './searchResultSession'
import { isSearchSessionSuperseded } from './searchResultSession'
import type { PaginatorInteraction } from './searchPreferences'

/** Zero-based index of the first result on a one-based page. */
export function pageStartIndex(page: number, pageSize: number): number {
  return (page - 1) * pageSize
}

/** One-based page containing a zero-based result index. */
export function pageOfIndex(index: number, pageSize: number): number {
  return Math.floor(Math.max(0, index) / pageSize) + 1
}

/**
 * Pages that exist given what is loaded, plus one more when the result set is known to continue.
 * Not bounded by pagination capacity.
 */
export function discoveredPageCount(loaded: number, status: SearchSessionStatus, pageSize: number): number {
  const lookahead = status === 'more' ? 1 : 0
  return Math.max(1, Math.ceil((loaded + lookahead) / pageSize))
}

/**
 * Width a page label occupies at its natural text width: digit advance plus horizontal padding. The paginator
 * uses it to decide how many labels fit, so labels keep natural width instead of sharing a fixed slot.
 */
export function estimatePageLabelWidth(page: number): number {
  return String(page).length * 8 + 14
}

/**
 * Chooses the contiguous run of page labels that fits in `available` pixels. It grows outward from the selected
 * page, alternating sides, so the selection is centred whenever both sides have pages; once one side is exhausted
 * the other side takes the remaining room instead of leaving an empty area. The result depends only on its inputs,
 * so it cannot oscillate near the boundaries.
 */
export function visiblePageWindow(input: Readonly<{
  selected: number
  total: number
  available: number
  gap?: number
  labelWidth?: (page: number) => number
}>): Readonly<{ first: number; last: number }> {
  const gap = input.gap ?? 4
  const widthOf = input.labelWidth ?? estimatePageLabelWidth
  const selected = Math.min(Math.max(1, input.selected), input.total)
  let first = selected
  let last = selected
  let used = widthOf(selected)
  let preferLeft = true
  for (;;) {
    const canLeft = first > 1 && used + gap + widthOf(first - 1) <= input.available
    const canRight = last < input.total && used + gap + widthOf(last + 1) <= input.available
    if (!canLeft && !canRight) break
    const takeLeft: boolean = canLeft && (preferLeft || !canRight)
    if (takeLeft) { first -= 1; used += gap + widthOf(first) } else { last += 1; used += gap + widthOf(last) }
    preferLeft = !takeLeft
  }
  return { first, last }
}

export type PaginationInteractions = Readonly<{
  arrowClick: PaginatorInteraction
  pageClick: PaginatorInteraction
  keyboard: PaginatorInteraction
}>

export type PaginationNavigatorDeps = Readonly<{
  /** Resolves when at least `count` results are loaded or the result set cannot grow. `chunk` sizes the queries. */
  ensureLoaded: (count: number, chunk: number) => Promise<void>
  loaded: () => number
  status: () => SearchSessionStatus
  /** Maximum navigable pages (`Infinity` when unlimited). */
  capacityPages: () => number
  /** Pages to fetch ahead of the committed page; 0 when nothing should be prefetched. */
  prefetchPages: () => number
  interactions: () => PaginationInteractions
}>

/**
 * The only way a page becomes current. `selectedPage` is where the navigator points; `currentPage` is the page
 * whose results are on screen. Mouse and keyboard input differ only in whether they select or navigate; every
 * navigation goes through `navigate`, which commits the page only after its results are loaded.
 */
export class PaginationNavigator {
  private page = 1
  private selection = 1
  private size: number
  private busy = false
  private failure: string | null = null
  private token = 0
  private readonly listeners = new Set<() => void>()

  constructor(private readonly deps: PaginationNavigatorDeps, pageSize: number) {
    this.size = pageSize
  }

  get currentPage(): number { return this.page }
  get selectedPage(): number { return this.selection }
  get pageSize(): number { return this.size }
  get navigating(): boolean { return this.busy }
  get error(): string | null { return this.failure }

  /** Pages reachable by navigation: discovered pages bounded by the capacity mode. */
  get maxPage(): number {
    return Math.min(discoveredPageCount(this.deps.loaded(), this.deps.status(), this.size), this.deps.capacityPages())
  }

  /** True when more results exist than the capacity mode lets the navigator reach. */
  get capacityBlocked(): boolean {
    return discoveredPageCount(this.deps.loaded(), this.deps.status(), this.size) > this.deps.capacityPages()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Sets the page size before anything has been shown (first Adaptive measurement). */
  resize(pageSize: number): void {
    this.size = pageSize
    this.emit()
  }

  /** Places both pointers on the page containing an already-loaded result. No retrieval is involved. */
  enterAt(index: number): void {
    this.token += 1
    this.busy = false
    this.failure = null
    this.page = this.selection = Math.min(pageOfIndex(index, this.size), this.maxPage)
    this.emit()
  }

  /** Moves the selection only; displayed results are unchanged. */
  select(page: number): void {
    this.selection = this.clampPage(page)
    this.emit()
  }

  async navigate(page: number): Promise<boolean> {
    const target = this.clampPage(page)
    const token = ++this.token
    this.selection = target
    this.busy = true
    this.failure = null
    this.emit()
    try {
      await this.deps.ensureLoaded(this.loadBound(target * this.size, this.size), this.size)
    } catch (error) {
      if (token !== this.token || isSearchSessionSuperseded(error)) return false
      this.busy = false
      this.failure = error instanceof Error ? error.message : 'SEARCH_NAVIGATION_FAILED'
      this.emit()
      return false
    }
    if (token !== this.token) return false
    const committed = Math.min(target, this.maxPage)
    this.page = committed
    this.selection = committed
    this.busy = false
    this.emit()
    this.prefetchAhead(committed)
    return true
  }

  retry(): Promise<boolean> { return this.navigate(this.selection) }

  /** Enter: activates the selected page unless it is already the committed one. */
  activateSelection(): Promise<boolean> | null {
    return this.selection === this.page && !this.failure ? null : this.navigate(this.selection)
  }

  arrow(delta: -1 | 1): Promise<boolean> | null { return this.step(this.deps.interactions().arrowClick, delta) }
  key(delta: -1 | 1): Promise<boolean> | null { return this.step(this.deps.interactions().keyboard, delta) }

  clickPage(page: number): Promise<boolean> | null {
    if (this.deps.interactions().pageClick === 'direct') return this.navigate(page)
    this.select(page)
    return null
  }

  /**
   * Changes the page size and recomputes both pointers from the first result of each page they pointed at, so
   * neither jumps back to page one. The new size takes effect only if the results for the new current page load.
   */
  async rebase(pageSize: number, firsts: Readonly<{ current: number; selected: number }>): Promise<boolean> {
    const token = ++this.token
    this.busy = true
    this.failure = null
    this.emit()
    const current = pageOfIndex(firsts.current, pageSize)
    try {
      await this.deps.ensureLoaded(this.loadBound(current * pageSize, pageSize), pageSize)
    } catch (error) {
      if (token !== this.token || isSearchSessionSuperseded(error)) return false
      this.busy = false
      this.failure = error instanceof Error ? error.message : 'SEARCH_NAVIGATION_FAILED'
      this.emit()
      return false
    }
    if (token !== this.token) return false
    this.size = pageSize
    this.page = Math.min(current, this.maxPage)
    this.selection = Math.min(pageOfIndex(firsts.selected, pageSize), this.maxPage)
    this.busy = false
    this.emit()
    this.prefetchAhead(this.page)
    return true
  }

  private step(mode: PaginatorInteraction, delta: -1 | 1): Promise<boolean> | null {
    const next = this.clampPage(this.selection + delta)
    if (mode === 'direct') return this.navigate(next)
    this.select(next)
    return null
  }

  private clampPage(page: number): number {
    return Math.min(Math.max(1, Math.floor(page)), this.maxPage)
  }

  /** Never fetch beyond what the capacity mode can show (plus one result to detect that more exist). */
  private loadBound(count: number, size: number): number {
    const capacity = this.deps.capacityPages()
    return Number.isFinite(capacity) ? Math.min(count, capacity * size + 1) : count
  }

  private prefetchAhead(page: number): void {
    const ahead = this.deps.prefetchPages()
    if (ahead <= 0) return
    this.deps.ensureLoaded(this.loadBound((page + ahead) * this.size, this.size), this.size).catch(() => {
      // Prefetching is best effort; a failure surfaces when the page is actually demanded.
    })
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener()
  }
}
