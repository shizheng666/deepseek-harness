import { describe, expect, it } from 'vitest'
import { classifyNavigation } from '../src/navigation.ts'

describe('desktop navigation policy', () => {
  const origin = 'http://127.0.0.1:4567'

  it('allows only the active runtime origin inside Electron', () => {
    expect(classifyNavigation(`${origin}/?token=secret`, origin)).toBe('allow')
    expect(classifyNavigation(`${origin}/api/session`, origin)).toBe('allow')
    expect(classifyNavigation('http://127.0.0.1:4568/', origin)).toBe('deny')
  })

  it('opens external HTTPS links and denies every other protocol', () => {
    expect(classifyNavigation('https://github.com/deepseek-ai/deepseek-harness', origin)).toBe('external')
    expect(classifyNavigation('http://example.com', origin)).toBe('deny')
    expect(classifyNavigation('mailto:test@example.com', origin)).toBe('deny')
    expect(classifyNavigation('file:///C:/Windows/System32', origin)).toBe('deny')
    expect(classifyNavigation('not a url', origin)).toBe('deny')
  })
})
