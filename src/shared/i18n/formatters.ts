/**
 * formatters.ts — 日期/数字格式化工具
 *
 * 根据当前 locale 返回格式化后的字符串。
 * 使用原生 Intl API，无需额外依赖。
 */

import type { SupportedLocale } from './localeTypes'

/**
 * 格式化日期
 */
export function formatDate(
  date: Date | number | string,
  locale: SupportedLocale,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat(locale, options).format(d)
}

/**
 * 格式化时间（仅时分秒）
 */
export function formatTime(
  date: Date | number | string,
  locale: SupportedLocale
): string {
  return formatDate(date, locale, { hour: '2-digit', minute: '2-digit' })
}

/**
 * 格式化相对时间（如 "3 分钟前"）
 * 注意：Intl.RelativeTimeFormat 的浏览器支持需要较新版本
 */
export function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: SupportedLocale
): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit)
}

/**
 * 格式化数字
 */
export function formatNumber(
  value: number,
  locale: SupportedLocale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value)
}

/**
 * 格式化文件大小（自动选择单位）
 */
export function formatFileSize(bytes: number, locale: SupportedLocale): string {
  if (bytes < 1024) return formatNumber(bytes, locale, { style: 'unit', unit: 'byte' })
  if (bytes < 1024 * 1024) return formatNumber(bytes / 1024, locale, { maximumFractionDigits: 1, style: 'unit', unit: 'kilobyte' })
  if (bytes < 1024 * 1024 * 1024) return formatNumber(bytes / (1024 * 1024), locale, { maximumFractionDigits: 1, style: 'unit', unit: 'megabyte' })
  return formatNumber(bytes / (1024 * 1024 * 1024), locale, { maximumFractionDigits: 2, style: 'unit', unit: 'gigabyte' })
}
