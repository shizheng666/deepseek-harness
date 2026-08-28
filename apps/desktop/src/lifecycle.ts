/** Minimal desktop-window operations used for a repeated application launch. */
export interface FocusableWindow {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

/** Bring the existing desktop window to the foreground for a second launch. */
export function focusExistingWindow(window: FocusableWindow | undefined): void {
  if (window === undefined) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/** Retry one asynchronous startup only when the user explicitly chooses to do so. */
export async function startWithRetry<T>(
  start: () => Promise<T>,
  chooseRetry: (error: Error) => Promise<boolean>,
): Promise<T | undefined> {
  for (;;) {
    try {
      return await start()
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      if (!await chooseRetry(normalized)) return undefined
    }
  }
}
