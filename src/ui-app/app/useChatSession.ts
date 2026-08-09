export function useChatSession() {
  async function getOpenRouterBaseUrl(): Promise<string | null> {
    // The V2 first-party profile owns this provenance. It is not credential
    // state and therefore must not be resolved through a renderer credential
    // facade or a user-configurable legacy base URL.
    return 'https://openrouter.ai/api/v1'
  }

  function randomId(prefix: string): string {
    const cryptoObj = (globalThis as any).crypto as { randomUUID?: () => string } | undefined
    if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }

  return {
    getOpenRouterBaseUrl,
    randomId,
  }
}
