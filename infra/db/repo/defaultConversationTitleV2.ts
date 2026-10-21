/** Local time at creation (or first accepted send when promoting New Chat). */
export function defaultConversationTitleV2(createdAtMs: number): string {
  const date = new Date(createdAtMs)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `会话${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日${pad(date.getHours())}时${pad(date.getMinutes())}分${pad(date.getSeconds())}秒`
}
