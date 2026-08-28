import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createDesktopTranslator } from '../src/locale.ts'
import {
  DesktopUpdater,
  type DesktopUpdateInfo,
  type DesktopUpdatePort,
} from '../src/updater.ts'

class FakeUpdater extends EventEmitter implements DesktopUpdatePort {
  autoDownload = false
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn(async () => undefined)
  quitAndInstall = vi.fn()

  override on(event: 'update-available' | 'update-not-available' | 'update-downloaded', listener: (info: DesktopUpdateInfo) => void): this
  override on(event: 'error', listener: (error: Error) => void): this
  override on(event: string, listener: Parameters<EventEmitter['on']>[1]): this {
    return super.on(event, listener)
  }
}

function dialogs(restart = false) {
  return {
    info: vi.fn(async () => {}),
    error: vi.fn(async () => {}),
    restart: vi.fn(async () => restart),
  }
}

describe('desktop updater', () => {
  it('checks automatically with background download and ignores automatic errors', async () => {
    const port = new FakeUpdater()
    const native = dialogs()
    const updater = new DesktopUpdater(port, native, createDesktopTranslator('en-US'))
    expect(port.autoDownload).toBe(true)
    expect(port.autoInstallOnAppQuit).toBe(true)
    updater.checkAutomatically()
    await vi.waitFor(() => { expect(port.checkForUpdates).toHaveBeenCalledOnce() })
    port.emit('error', new Error('offline'))
    await Promise.resolve()
    expect(native.error).not.toHaveBeenCalled()
  })

  it('reports a manual no-update result', async () => {
    const port = new FakeUpdater()
    const native = dialogs()
    const updater = new DesktopUpdater(port, native, createDesktopTranslator('en-US'))
    const check = updater.checkManually()
    port.emit('update-not-available', { version: '0.1.0' })
    await check
    expect(native.info).toHaveBeenCalledWith('Desktop Update', 'DeepSeek Harness Desktop is up to date.')
  })

  it('reports a manual check failure', async () => {
    const port = new FakeUpdater()
    port.checkForUpdates.mockRejectedValueOnce(new Error('network unavailable'))
    const native = dialogs()
    const updater = new DesktopUpdater(port, native, createDesktopTranslator('en-US'))
    await updater.checkManually()
    expect(native.error).toHaveBeenCalledWith(
      'Desktop Update',
      'The update check failed:\n\nnetwork unavailable',
    )
  })

  it('restarts only when the downloaded-update prompt accepts', async () => {
    const port = new FakeUpdater()
    const native = dialogs(true)
    new DesktopUpdater(port, native, createDesktopTranslator('en-US'))
    port.emit('update-downloaded', { version: '0.1.1' })
    await vi.waitFor(() => { expect(port.quitAndInstall).toHaveBeenCalledWith(false, true) })
    expect(native.restart).toHaveBeenCalledWith(
      'Update Ready',
      expect.stringContaining('Version 0.1.1 is ready.'),
      'Restart Now',
      'Later',
    )
  })

  it('leaves installation to normal exit when the prompt chooses later', async () => {
    const port = new FakeUpdater()
    const native = dialogs(false)
    new DesktopUpdater(port, native, createDesktopTranslator('en-US'))
    port.emit('update-downloaded', { version: '0.1.1' })
    await vi.waitFor(() => { expect(native.restart).toHaveBeenCalledOnce() })
    expect(port.quitAndInstall).not.toHaveBeenCalled()
    expect(port.autoInstallOnAppQuit).toBe(true)
  })
})
