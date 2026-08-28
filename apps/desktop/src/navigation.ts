/** A desktop navigation decision. */
export type NavigationDecision = 'allow' | 'external' | 'deny'

/**
 * Classify one navigation against the active loopback runtime origin.
 * @param target - absolute URL requested by the renderer.
 * @param runtimeOrigin - exact origin of the supervised runtime.
 * @returns Whether Electron may navigate, opens the URL externally, or rejects it.
 */
export function classifyNavigation(target: string, runtimeOrigin: string): NavigationDecision {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return 'deny'
  }
  if (url.origin === runtimeOrigin) return 'allow'
  return url.protocol === 'https:' ? 'external' : 'deny'
}
