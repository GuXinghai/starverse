import type { Session } from 'electron'

/** One session listener combines readiness with any caller-owned network policy. */
export function applySessionRequestPolicy(target: Readonly<{
  webRequest: Pick<Session['webRequest'], 'onBeforeRequest'>
}>, allowRequest: (url: string) => boolean): void {
  target.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      try { callback({ cancel: !allowRequest(details.url) }) }
      catch { callback({ cancel: true }) }
    })
}
