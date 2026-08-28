import { describe, expect, it, vi } from 'vitest'
import { focusExistingWindow, startWithRetry } from '../src/lifecycle.ts'

describe('desktop lifecycle', () => {
  it('restores and focuses the existing window after a repeated launch', () => {
    const window = {
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    }
    focusExistingWindow(window)
    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('retries a failed startup only after the user accepts', async () => {
    const start = vi.fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce('ready')
    const chooseRetry = vi.fn(async () => true)
    await expect(startWithRetry(start, chooseRetry)).resolves.toBe('ready')
    expect(start).toHaveBeenCalledTimes(2)
    expect(chooseRetry).toHaveBeenCalledWith(expect.objectContaining({ message: 'first failure' }))
  })

  it('returns without another start when the user chooses quit', async () => {
    const start = vi.fn().mockRejectedValue(new Error('failed'))
    const chooseRetry = vi.fn(async () => false)
    await expect(startWithRetry(start, chooseRetry)).resolves.toBeUndefined()
    expect(start).toHaveBeenCalledOnce()
  })
})
