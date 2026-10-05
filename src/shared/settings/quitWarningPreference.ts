/**
 * "Warn when quitting while work is still running". Stored in the V2 UI preferences as a boolean;
 * absent or unreadable means enabled (the default).
 */
export const QUIT_WARNING_PREFERENCE_KEY = 'warnOnQuitWithActiveWork'

export function normalizeStoredQuitWarningEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true
}
