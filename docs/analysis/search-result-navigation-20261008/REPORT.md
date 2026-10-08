# Search Result Navigation and Loading: design and closure report

**Status**: active (implementation record)
**Document Role**: design and closure report
**Last updated**: 2026-10-08
**Branch**: `models-dev-capability-resolution`

## Why

Search retrieved a fixed first 50 results (a UI constant), returned a bare array with no "more" signal, was not localized, and had no dialog semantics (audit findings VPG-01 and VPG-02). The rebuild replaces the single-shot query with one ordered result set that two presentations browse.

## Architecture

| Concern | Owner |
| --- | --- |
| Query, scope, filters | `SearchModal.vue` builds a `SearchBrowserQuery`; `GenerationV2SearchRepo.query` is the only search authority |
| Ordering | `order` on the query: `chronological` (oldest first, default), `reverse-chronological`, `relevance`; ordering is a SQL concern only |
| Retrieval, cache, prefetch | `SearchResultSession` (`src/next/search/searchResultSession.ts`) |
| Presentation and navigation | `SearchBrowser` (temporary per-open state), `PaginationNavigator`, `SearchResultList.vue`, `SearchPaginator.vue` |
| Persisted vs temporary | `searchPreferences` (read-only to the dialog) vs `SearchBrowser` fields (discarded on close) |

Key decisions:

- **One cache, a contiguous prefix.** Results are a prefix `[0, loaded)` of the ordered set. The only way to see more is to extend the prefix, so Scroll and Pagination read the same array, a presentation switch never re-queries, and "page N" is index arithmetic. The paginator therefore only offers pages that are already discovered (loaded results plus one when the set is known to continue); prefetch widens that range.
- **`hasMore` without COUNT.** The repo fetches `limit + 1` rows. `status` is `more`, `end` (natural end) or `limit` (matches exist beyond the display limit). The limit banner is driven by `limit`; "End of results" only by `end`.
- **Bounded queries.** Every database window is at most 1000 rows; Full Load uses 200-row chunks and publishes each chunk as it arrives. Offsets up to 2^31-1 are accepted (the display limit is user-configurable).
- **Stale responses.** Starting a new result set or disposing the session bumps a generation counter; in-flight fetches are discarded and their waiters rejected with a superseded error. Page navigation additionally carries its own token, so the newest navigation wins.
- **Anchor, not offset.** The browser keeps `anchorIndex` (zero-based index of the first visible result in the one ordered set). A presentation switch, a committed page, an adaptive re-layout or a restart bumps `positionRevision`; the dialog re-keys the list so it mounts at the anchor (`initialIndex`). Sorting resets the anchor to 0.
- **Virtualised rows.** Both presentations render through `SearchResultList.vue` with a fixed row height (`SEARCH_RESULT_ROW_HEIGHT`). The DOM is bounded for any result count; the same constant gives Adaptive its page size.
- **Dialog never touches Chat.** Only clicking a result calls `selectHit`. Sorting, switching presentation and paging cannot open or replace a conversation.

## Behaviour summary

- Scroll: On-demand fetches `batchSize` rows at a time (default 50) keeping `prefetchBatches` (default 3) ahead of the last visible row. Full Load retrieves progressively to the display limit.
- Pagination: pages are fixed-size or Adaptive. On-demand prefetches `prefetchPages` pages; Full Load works as in Scroll.
- Display limit (default 5000) applies to every combination. At the limit the banner `已达到搜索结果显示上限。如需继续加载，[跳转设置]` (English equivalent in `search.json`) links to Settings > General > Search. Settings changes apply the next time Search is opened.
- Pagination capacity (Standard 99, Extended 999, Unlimited) bounds navigation only; fetching stops one row past the capacity, and a notice with a Settings link appears on the last reachable page when more results remain.
- `currentPage` vs `selectedPage`: a page becomes current only after its rows are loaded. On failure the previous page stays, the attempted selection is kept, and the error row offers Retry.
- Arrow clicks, page-label clicks and keyboard left/right are independently Direct or Select-first (Enter navigates); all end in `PaginationNavigator.navigate`.
- Adaptive: page size = `floor(viewport height / row height)`, measured once on entering Pagination and again only through **Re-adapt layout**, which preserves the first result of the previous current page and, independently, of the previous selected page.
- Paginator: number rail between fixed arrows; the label window grows outward from the selected page at natural label width (`visiblePageWindow`); the current page is a filled square with transparent glyph, the selected page an outlined square, both combined a filled square with a ring.

## Persisted preferences

Stored as one leaf (`generationV2UiPreferences.searchPreferences`), decoded field by field with positive-integer validation (`searchPreferences.ts`). Edited in `SearchSettingsSection.vue` (Settings > General). The scope default (`searchScopeDefault`) is unchanged.

## Tests

- `infra/db/repo/generationV2SearchRepo.test.ts`: exact `hasMore`, windows that tile the set in all orders, mirrored newest-first.
- `src/next/search/*.test.ts`: session (prefix, limit vs end, stale, urgency order, failures), pagination math, label window, navigator (commit-after-load, failure/retry, supersession, three input categories, capacity, rebase), browser (shared session, anchor round trips, sort reset, loading strategies, Adaptive, 60k-result Full Load, navigation burst), preferences.
- `src/ui-app/components/SearchModal.navigation.test.ts`, `SearchSettingsSection.test.ts`: dialog semantics, locale, bounded DOM, banners and links, temporary vs persisted state, paginator states and select-first flow, retry.

## Deferred

- **Focus trap and focus restoration** for the Search dialog (`TODO(search-a11y)` in `SearchModal.vue`). The dialog has `role="dialog"`, `aria-modal`, labelling, initial focus and Escape only.
- **Result grouping** by time, conversation or project. Grouping is a presentation concern: it would change how `SearchResultList` derives rows from the same session array, not the session or the query.
- Offset paging is stable only while the index does not change; a message completing during a long Full Load can shift later windows. Acceptable for a local, user-driven search; a keyset cursor would be the next step if it matters.
- Visual verification in a real browser pane was not possible in the authoring session (loopback pages were not reachable); layout is covered by jsdom tests only.
