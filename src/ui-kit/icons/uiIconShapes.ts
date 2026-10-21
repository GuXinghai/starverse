/**
 * Monochrome interface icon set (24x24 grid, 1.6px round strokes, currentColor).
 * Interface chrome uses these instead of emoji or text glyphs; user-authored
 * content keeps whatever characters the user typed.
 */
export type UiIconShape =
  | { t: 'path'; d: string; fill?: true }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: true }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill?: true }

const p = (d: string): UiIconShape => ({ t: 'path', d })
const c = (cx: number, cy: number, r: number): UiIconShape => ({ t: 'circle', cx, cy, r })
const dot = (cx: number, cy: number): UiIconShape => ({ t: 'circle', cx, cy, r: 1.15, fill: true })
const r = (x: number, y: number, w: number, h: number, rx = 0): UiIconShape => ({ t: 'rect', x, y, w, h, rx })

export const UI_ICON_SHAPES = {
  orbit: [c(12, 12, 3), p('M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1')],
  search: [c(11, 11, 6.5), p('m20 20-4.2-4.2')],
  plus: [p('M12 5v14M5 12h14')],
  minus: [p('M5 12h14')],
  close: [p('M6 6l12 12M18 6 6 18')],
  back: [p('M19 12H5m6-6-6 6 6 6')],
  forward: [p('M5 12h14m-6-6 6 6-6 6')],
  up: [p('M12 19V5m-6 6 6-6 6 6')],
  down: [p('M12 5v14m-6-6 6 6 6-6')],
  chevronRight: [p('m9 6 6 6-6 6')],
  chevronLeft: [p('m15 6-6 6 6 6')],
  chevronDown: [p('m6 9 6 6 6-6')],
  chevronUp: [p('m6 15 6-6 6 6')],
  check: [p('m5 12.5 4.5 4.5L19 7')],
  sliders: [p('M4 7h9M17 7h3M4 17h3M11 17h9'), c(15, 7, 2), c(9, 17, 2)],
  filter: [p('M4 6h16M7 12h10M10 18h4')],
  sort: [p('M8 5v14m-3-3 3 3 3-3M16 19V5m-3 3 3-3 3 3')],
  list: [p('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01')],
  menu: [p('M4 6h16M4 12h16M4 18h16')],
  folder: [p('M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z')],
  compose: [p('M12 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19h11a1.5 1.5 0 0 0 1.5-1.5V12'), p('M17.5 4.5a1.8 1.8 0 0 1 2.5 2.5L12 15l-3.5 1 1-3.5z')],
  edit: [p('M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z'), p('m14.5 7.5 3 3')],
  trash: [p('M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7')],
  copy: [r(9, 9, 11, 11, 2), p('M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3')],
  refresh: [p('M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5')],
  history: [p('M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5M12 8v4l3 2')],
  more: [dot(6, 12), dot(12, 12), dot(18, 12)],
  globe: [c(12, 12, 8.5), p('M3.5 12h17M12 3.5c2.5 2.3 3.6 5.2 3.6 8.5s-1.1 6.2-3.6 8.5c-2.5-2.3-3.6-5.2-3.6-8.5S9.5 5.8 12 3.5')],
  image: [r(3.5, 4.5, 17, 15, 2), c(9, 10, 1.5), p('m4 18 5-5 4 4 2-2 5 4')],
  paperclip: [p('M20 11.5 12.2 19.3a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3')],
  link: [p('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')],
  reasoning: [p('M9 18h6M10 21h4M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.5.4.8 1 .8 1.6V16h5v-1c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 12 3.5z')],
  stop: [{ t: 'rect', x: 6.5, y: 6.5, w: 11, h: 11, rx: 2, fill: true }],
  alert: [p('M12 4 3 19.5h18z'), p('M12 10v4.5M12 17.2h.01')],
  info: [c(12, 12, 8.5), p('M12 11v5M12 8h.01')],
  branch: [c(7, 5.5, 2), c(7, 18.5, 2), c(17, 9, 2), p('M7 7.5v9M17 11c0 3-3 3.5-10 5.5')],
  panel: [r(3.5, 4.5, 17, 15, 2), p('M14.5 4.5v15')],
  external: [p('M14 4h6v6M20 4l-9 9M18 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H11')],
  message: [p('M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8.5A1.5 1.5 0 0 1 19 17H11l-4.5 3.5V17H5A1.5 1.5 0 0 1 3.5 15.5V7A1.5 1.5 0 0 1 5 5.5z')],
  file: [p('M7 3.5h6.5L18 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z'), p('M13.5 3.5V8H18')],
  star: [p('M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z')],
  spinner: [p('M12 3.5a8.5 8.5 0 1 0 8.5 8.5')],
  dot: [{ t: 'circle', cx: 12, cy: 12, r: 3.2, fill: true }],
  grip: [dot(9, 6), dot(15, 6), dot(9, 12), dot(15, 12), dot(9, 18), dot(15, 18)],
  settingsKey: [c(8, 15, 3.5), p('m10.5 12.5 8-8M15.5 7.5l2.5 2.5M13 10l2 2')],
  settingsCube: [p('M12 3.5 4.5 7.8v8.4l7.5 4.3 7.5-4.3V7.8z'), p('M4.5 7.8 12 12l7.5-4.2M12 12v8.5')],
  settingsShield: [p('M12 3.5 5 6v5.5c0 4.2 2.9 7.2 7 9 4.1-1.8 7-4.8 7-9V6z')],
  settingsPlug: [p('M9 3.5v5M15 3.5v5M6.5 8.5h11v3.5a5.5 5.5 0 0 1-11 0z'), p('M12 17.5v3')],
} satisfies Record<string, UiIconShape[]>

export type UiIconName = keyof typeof UI_ICON_SHAPES
