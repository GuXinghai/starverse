/**
 * Every search result row has this exact height. Windowed rendering and Adaptive page sizing both rely on it:
 * the first visible result is `scrollTop / rowHeight`, and a page holds `floor(viewportHeight / rowHeight)` rows.
 */
export const SEARCH_RESULT_ROW_HEIGHT = 112
