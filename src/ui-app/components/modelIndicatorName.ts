export function formatModelIndicatorName(value: string | null | undefined): string {
  const text = String(value ?? '').trim()
  const separator = ': '
  const separatorIndex = text.indexOf(separator)
  if (separatorIndex <= 0) return text
  const withoutProvider = text.slice(separatorIndex + separator.length).trim()
  return withoutProvider || text
}
