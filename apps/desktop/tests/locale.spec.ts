import { describe, expect, it } from 'vitest'
import { createDesktopTranslator } from '../src/locale.ts'

describe('desktop locale', () => {
  it('selects Chinese by locale prefix and substitutes values', () => {
    expect(createDesktopTranslator('zh-CN')('updateAvailable', { version: '0.1.1' }))
      .toBe('版本 0.1.1 正在后台下载。')
  })

  it('falls back to English', () => {
    expect(createDesktopTranslator('fr-FR')('restartNow')).toBe('Restart Now')
  })
})
