/** Locale-owned native desktop copy. */
const dictionaries = {
  en: {
    about: 'About DeepSeek Harness Desktop',
    aboutDetail: 'Version {version}\n\nThe desktop app runs the DeepSeek Harness Web application on this computer.',
    checkForUpdates: 'Check for Updates…',
    checkingForUpdates: 'Checking for Updates',
    help: 'Help',
    later: 'Later',
    noUpdates: 'DeepSeek Harness Desktop is up to date.',
    quit: 'Quit',
    restartNow: 'Restart Now',
    retry: 'Retry',
    runtimeFailed: 'The local DeepSeek Harness runtime stopped unexpectedly.',
    runtimeFailedTitle: 'Runtime Stopped',
    startupFailed: 'DeepSeek Harness Desktop could not start its local runtime.',
    startupFailedTitle: 'Startup Failed',
    updateAvailable: 'Version {version} is downloading in the background.',
    updateCheckFailed: 'The update check failed:\n\n{reason}',
    updateDownloaded: 'Version {version} is ready. Restart now to install it, or install it when the app next exits.',
    updateReadyTitle: 'Update Ready',
    updateStatusTitle: 'Desktop Update',
  },
  zh: {
    about: '关于 DeepSeek Harness Desktop',
    aboutDetail: '版本 {version}\n\n桌面版在本机运行 DeepSeek Harness Web 应用。',
    checkForUpdates: '检查更新…',
    checkingForUpdates: '正在检查更新',
    help: '帮助',
    later: '稍后',
    noUpdates: 'DeepSeek Harness Desktop 已是最新版本。',
    quit: '退出',
    restartNow: '立即重启',
    retry: '重试',
    runtimeFailed: '本地 DeepSeek Harness 运行时意外停止。',
    runtimeFailedTitle: '运行时已停止',
    startupFailed: 'DeepSeek Harness Desktop 无法启动本地运行时。',
    startupFailedTitle: '启动失败',
    updateAvailable: '版本 {version} 正在后台下载。',
    updateCheckFailed: '检查更新失败：\n\n{reason}',
    updateDownloaded: '版本 {version} 已准备好。立即重启即可安装，也可在下次退出应用时安装。',
    updateReadyTitle: '更新已就绪',
    updateStatusTitle: '桌面版更新',
  },
} as const

/** Stable desktop-copy keys shared by both dictionaries. */
type DesktopMessageKey = keyof typeof dictionaries.en

/** Translate one native desktop message and substitute named values. */
export type DesktopTranslator = (key: DesktopMessageKey, values?: Readonly<Record<string, string>>) => string

/**
 * Select the Simplified Chinese dictionary for Chinese locales and English otherwise.
 * @param locale - Electron locale such as `zh-CN` or `en-US`.
 * @returns A translator for native desktop copy.
 */
export function createDesktopTranslator(locale: string): DesktopTranslator {
  const dictionary: Readonly<Record<DesktopMessageKey, string>> = locale.toLowerCase().startsWith('zh')
    ? dictionaries.zh
    : dictionaries.en
  return (key, values = {}) => Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    dictionary[key],
  )
}
