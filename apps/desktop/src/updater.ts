import type { DesktopTranslator } from './locale.ts'

/** Version information emitted by the updater. */
export interface DesktopUpdateInfo {
  version: string
}

/** Minimal electron-updater interface owned by the desktop controller. */
export interface DesktopUpdatePort {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: DesktopUpdateInfo) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

/** Native dialog operations used by update behavior. */
export interface DesktopUpdateDialogs {
  info(title: string, message: string): Promise<void>
  error(title: string, message: string): Promise<void>
  restart(title: string, message: string, restartNow: string, later: string): Promise<boolean>
}

/** Startup and manual update checks over one packaged application lifetime. */
export class DesktopUpdater {
  private checking = false
  private manual = false

  constructor(
    private readonly updater: DesktopUpdatePort,
    private readonly dialogs: DesktopUpdateDialogs,
    private readonly t: DesktopTranslator,
  ) {
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.on('update-available', (info) => { void this.onAvailable(info) })
    updater.on('update-not-available', () => { void this.onNotAvailable() })
    updater.on('update-downloaded', (info) => { void this.onDownloaded(info) })
    updater.on('error', (error) => { void this.onError(error) })
  }

  /** Check once after packaged startup without blocking the application. */
  checkAutomatically(): void {
    void this.check(false)
  }

  /** Check on explicit user request and report the outcome. */
  async checkManually(): Promise<void> {
    if (this.checking) {
      await this.dialogs.info(this.t('updateStatusTitle'), this.t('checkingForUpdates'))
      return
    }
    await this.check(true)
  }

  private async check(manual: boolean): Promise<void> {
    this.checking = true
    this.manual = manual
    try {
      await this.updater.checkForUpdates()
    } catch (error) {
      await this.onError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      this.checking = false
    }
  }

  private async onAvailable(info: DesktopUpdateInfo): Promise<void> {
    if (!this.manual) return
    this.manual = false
    await this.dialogs.info(
      this.t('updateStatusTitle'),
      this.t('updateAvailable', { version: info.version }),
    )
  }

  private async onNotAvailable(): Promise<void> {
    if (!this.manual) return
    this.manual = false
    await this.dialogs.info(this.t('updateStatusTitle'), this.t('noUpdates'))
  }

  private async onDownloaded(info: DesktopUpdateInfo): Promise<void> {
    this.manual = false
    const restart = await this.dialogs.restart(
      this.t('updateReadyTitle'),
      this.t('updateDownloaded', { version: info.version }),
      this.t('restartNow'),
      this.t('later'),
    )
    if (restart) this.updater.quitAndInstall(false, true)
  }

  private async onError(error: Error): Promise<void> {
    if (!this.manual) return
    this.manual = false
    await this.dialogs.error(
      this.t('updateStatusTitle'),
      this.t('updateCheckFailed', { reason: error.message }),
    )
  }
}
