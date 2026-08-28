import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  ReadyUrlParser,
  redactRuntimeOutput,
  RuntimeSupervisor,
} from '../src/runtime.ts'

interface FakeChild extends EventEmitter {
  stdin: PassThrough
  stdout: PassThrough
  stderr: PassThrough
  pid: number
  exitCode: number | null
  signalCode: NodeJS.Signals | null
}

function fakeChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    pid: 1234,
    exitCode: null,
    signalCode: null,
  })
}

function spawnFake(child: FakeChild): typeof spawn {
  return (() => child as unknown as ChildProcessWithoutNullStreams) as unknown as typeof spawn
}

function closeOnStdin(child: FakeChild): void {
  child.stdin.once('finish', () => {
    child.exitCode = 0
    child.emit('close', 0, null)
  })
}

describe('runtime readiness parsing', () => {
  it('accepts one chunked token-authenticated loopback URL', () => {
    const parser = new ReadyUrlParser()
    expect(parser.push('booting\ndsh web: http://127.0.0.1:')).toBeUndefined()
    expect(parser.push('4567/?token=abc_DEF-123\n')?.href)
      .toBe('http://127.0.0.1:4567/?token=abc_DEF-123')
    expect(parser.finish()).toBeUndefined()
  })

  it.each([
    'dsh web: https://127.0.0.1:4567/?token=secret\n',
    'dsh web: http://localhost:4567/?token=secret\n',
    'dsh web: http://127.0.0.1:4567/path?token=secret\n',
    'dsh web: http://127.0.0.1:4567/?token=secret&extra=1\n',
    'dsh web: not-a-url\n',
  ])('rejects an invalid readiness line', (line) => {
    expect(() => new ReadyUrlParser().push(line)).toThrow(/readiness URL/)
  })

  it('rejects a second readiness URL', () => {
    const parser = new ReadyUrlParser()
    parser.push('dsh web: http://127.0.0.1:4567/?token=first\n')
    expect(() => parser.push('dsh web: http://127.0.0.1:4568/?token=second\n'))
      .toThrow('more than one readiness URL')
  })

  it('redacts token values from diagnostics', () => {
    expect(redactRuntimeOutput('open http://127.0.0.1:1/?token=secret&next=1'))
      .toBe('open http://127.0.0.1:1/?token=[redacted]&next=1')
  })
})

describe('runtime supervision', () => {
  it('spawns the dsh Web profile and stops it through stdin EOF', async () => {
    const child = fakeChild()
    closeOnStdin(child)
    const spawnRuntime = vi.fn(() => child as unknown as ChildProcessWithoutNullStreams)
    const supervisor = new RuntimeSupervisor({
      runtimePath: 'C:\\runtime\\dsh-runtime.exe',
      cwd: 'C:\\Users\\test',
      spawnRuntime: spawnRuntime as unknown as typeof spawn,
    })
    const ready = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567/?token=secret\n')
    await expect(ready).resolves.toMatchObject({ origin: 'http://127.0.0.1:4567' })
    expect(spawnRuntime).toHaveBeenCalledWith(
      'C:\\runtime\\dsh-runtime.exe',
      ['web', '--no-open', '--port', '0', '--supervised'],
      expect.objectContaining({ cwd: 'C:\\Users\\test', windowsHide: true }),
    )
    await supervisor.stop()
    expect(child.stdin.writableEnded).toBe(true)
  })

  it('reports an unexpected exit after readiness', async () => {
    const child = fakeChild()
    const errors: Error[] = []
    const onUnexpectedExit = vi.fn((error: Error) => { errors.push(error) })
    const supervisor = new RuntimeSupervisor({
      runtimePath: 'runtime.exe',
      cwd: 'cwd',
      spawnRuntime: spawnFake(child),
      onUnexpectedExit,
    })
    const ready = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567/?token=secret\n')
    await ready
    child.exitCode = 3
    child.emit('close', 3, null)
    expect(onUnexpectedExit).toHaveBeenCalledOnce()
    expect(errors[0]?.message).not.toContain('secret')
  })

  it('rejects startup failures with bounded redacted diagnostics', async () => {
    const child = fakeChild()
    closeOnStdin(child)
    const supervisor = new RuntimeSupervisor({
      runtimePath: 'runtime.exe',
      cwd: 'cwd',
      startupTimeoutMs: 10,
      spawnRuntime: spawnFake(child),
    })
    const ready = supervisor.start()
    child.stderr.write('failed at http://127.0.0.1:1/?token=secret\n')
    child.exitCode = 1
    child.emit('close', 1, null)
    let error: unknown
    try {
      await ready
    } catch (reason) {
      error = reason
    }
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) throw new Error('expected runtime startup to fail')
    expect(error.message).toContain('token=[redacted]')
    expect(error.message).not.toContain('secret')
  })

  it('rejects and stops a runtime that exceeds its startup budget', async () => {
    const child = fakeChild()
    closeOnStdin(child)
    const supervisor = new RuntimeSupervisor({
      runtimePath: 'runtime.exe',
      cwd: 'cwd',
      startupTimeoutMs: 1,
      spawnRuntime: spawnFake(child),
    })
    await expect(supervisor.start()).rejects.toThrow('did not become ready within 1 ms')
    await vi.waitFor(() => { expect(child.stdin.writableEnded).toBe(true) })
  })

  it('does not accept a readiness announcement completed only by process exit', async () => {
    const child = fakeChild()
    closeOnStdin(child)
    const supervisor = new RuntimeSupervisor({
      runtimePath: 'runtime.exe',
      cwd: 'cwd',
      spawnRuntime: spawnFake(child),
    })
    const ready = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567/?token=secret')
    child.exitCode = 0
    child.emit('close', 0, null)
    await expect(ready).rejects.toThrow('desktop runtime exited with code 0')
  })

  it('force-kills a process that exceeds its shutdown budget', async () => {
    const child = fakeChild()
    const forceKill = vi.fn(async () => {})
    const supervisor = new RuntimeSupervisor({
      runtimePath: 'runtime.exe',
      cwd: 'cwd',
      shutdownTimeoutMs: 1,
      spawnRuntime: spawnFake(child),
      forceKill,
    })
    const ready = supervisor.start()
    child.stdout.write('dsh web: http://127.0.0.1:4567/?token=secret\n')
    await ready
    await supervisor.stop()
    expect(forceKill).toHaveBeenCalledWith(1234)
  })
})
