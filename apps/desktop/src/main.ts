/** Electron shell for the locally supervised DeepSeek Harness Web application. */

import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  session,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'
import electronUpdater from 'electron-updater'
import { focusExistingWindow, startWithRetry } from './lifecycle.ts'
import { createDesktopTranslator, type DesktopTranslator } from './locale.ts'
import { classifyNavigation } from './navigation.ts'
import { RuntimeSupervisor } from './runtime.ts'
import {
  DesktopUpdater,
  type DesktopUpdateDialogs,
} from './updater.ts'

app.enableSandbox()

const { autoUpdater } = electronUpdater

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
let mainWindow: BrowserWindow | undefined
let runtime: RuntimeSupervisor | undefined
let desktopUpdater: DesktopUpdater | undefined
let quitting = false
let quitReady = false
let recovering = false
let runtimeOrigin: string | undefined
let t: DesktopTranslator

function runtimeExecutable(): string {
  const override = process.env.DSH_DESKTOP_RUNTIME_PATH
  if (override !== undefined && override !== '') return resolve(override)
  return app.isPackaged
    ? join(process.resourcesPath, 'runtime', 'dsh-runtime.exe')
    : join(repositoryRoot, 'dist-exe', 'deepseek-harness-sdk-runtime-win-x64.exe')
}

function createRuntime(): RuntimeSupervisor {
  return new RuntimeSupervisor({
    runtimePath: runtimeExecutable(),
    cwd: app.getPath('home'),
    onUnexpectedExit: (error) => { void recoverRuntime(error) },
  })
}

function showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  return mainWindow === undefined
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(mainWindow, options)
}

function stopRuntime(): Promise<void> {
  return runtime === undefined ? Promise.resolve() : runtime.stop()
}

async function chooseRetry(title: string, message: string, error: Error): Promise<boolean> {
  const result = await showMessageBox({
    type: 'error',
    title,
    message,
    detail: error.message,
    buttons: [t('retry'), t('quit')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })
  return result.response === 0
}

async function startRuntime(): Promise<URL | undefined> {
  return await startWithRetry(async () => {
    runtime = createRuntime()
    return await runtime.start()
  }, async error => await chooseRetry(t('startupFailedTitle'), t('startupFailed'), error))
}

function openExternal(target: string): void {
  if (runtimeOrigin === undefined || classifyNavigation(target, runtimeOrigin) !== 'external') return
  void shell.openExternal(target)
}

function installWindowSecurity(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (runtimeOrigin !== undefined && classifyNavigation(url, runtimeOrigin) === 'allow') return
    event.preventDefault()
    openExternal(url)
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    webPreferences: {
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  installWindowSecurity(window)
  window.once('ready-to-show', () => { window.show() })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  return window
}

async function loadRuntime(url: URL): Promise<void> {
  runtimeOrigin = url.origin
  if (mainWindow === undefined || mainWindow.isDestroyed()) mainWindow = createWindow()
  await mainWindow.loadURL(url.href)
}

async function recoverRuntime(error: Error): Promise<void> {
  if (quitting || recovering) return
  recovering = true
  try {
    const retry = await chooseRetry(t('runtimeFailedTitle'), t('runtimeFailed'), error)
    if (!retry) {
      app.quit()
      return
    }
    await runtime?.stop()
    const url = await startRuntime()
    if (url === undefined) {
      app.quit()
      return
    }
    await loadRuntime(url)
  } finally {
    recovering = false
  }
}

function updateDialogs(): DesktopUpdateDialogs {
  return {
    async info(title, message) {
      await showMessageBox({ type: 'info', title, message, buttons: ['OK'], noLink: true })
    },
    async error(title, message) {
      await showMessageBox({ type: 'error', title, message, buttons: ['OK'], noLink: true })
    },
    async restart(title, message, restartNow, later) {
      const result = await showMessageBox({
        type: 'info',
        title,
        message,
        buttons: [restartNow, later],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      return result.response === 0
    },
  }
}

function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [{
    label: t('help'),
    submenu: [
      {
        label: t('checkForUpdates'),
        enabled: app.isPackaged,
        click: () => { void desktopUpdater?.checkManually() },
      },
      { type: 'separator' },
      {
        label: t('about'),
        click: () => {
          void showMessageBox({
            type: 'info',
            title: t('about'),
            message: 'DeepSeek Harness Desktop',
            detail: t('aboutDetail', { version: app.getVersion() }),
            buttons: ['OK'],
            noLink: true,
          })
        },
      },
    ],
  }]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function boot(): Promise<void> {
  t = createDesktopTranslator(app.getLocale())
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => { callback(false) })
  session.defaultSession.setPermissionCheckHandler(() => false)
  const url = await startRuntime()
  if (url === undefined) {
    app.quit()
    return
  }
  await loadRuntime(url)
  if (app.isPackaged) {
    desktopUpdater = new DesktopUpdater(
      autoUpdater,
      updateDialogs(),
      t,
    )
    desktopUpdater.checkAutomatically()
  }
  installMenu()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusExistingWindow(mainWindow)
  })
  app.on('window-all-closed', () => { app.quit() })
  app.on('before-quit', (event) => {
    if (quitReady) return
    event.preventDefault()
    if (quitting) return
    quitting = true
    void stopRuntime().finally(() => {
      quitReady = true
      app.quit()
    })
  })
  void app.whenReady().then(boot).catch((error: unknown) => {
    t = createDesktopTranslator(app.getLocale())
    const normalized = error instanceof Error ? error : new Error(String(error))
    dialog.showErrorBox(t('startupFailedTitle'), `${t('startupFailed')}\n\n${normalized.message}`)
    app.quit()
  })
}
