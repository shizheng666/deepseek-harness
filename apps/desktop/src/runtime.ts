/** Supervise the packaged `dsh web` runtime and accept only its loopback readiness URL. */

import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

const READY_PREFIX = 'dsh web: '
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000
const DIAGNOSTIC_LIMIT = 4_096

/** Remove process-token values before runtime output reaches a diagnostic or log. */
export function redactRuntimeOutput(value: string): string {
  return value.replace(/([?&]token=)[^\s&)]+/gu, '$1[redacted]')
}

/** Parse the single authenticated readiness URL announced by `dsh web`. */
export class ReadyUrlParser {
  private buffered = ''
  private announced = false

  /**
   * Consume arbitrary stdout chunks.
   * @param chunk - UTF-8 process output.
   * @returns The readiness URL when this chunk completes its line.
   */
  push(chunk: string): URL | undefined {
    this.buffered += chunk
    let ready: URL | undefined
    for (;;) {
      const newline = this.buffered.indexOf('\n')
      if (newline < 0) return ready
      const line = this.buffered.slice(0, newline).replace(/\r$/u, '')
      this.buffered = this.buffered.slice(newline + 1)
      const parsed = this.parseLine(line)
      if (parsed !== undefined) ready = parsed
    }
  }

  /** Parse the remaining non-newline-terminated output when the process exits. */
  finish(): URL | undefined {
    if (this.buffered === '') return undefined
    const line = this.buffered.replace(/\r$/u, '')
    this.buffered = ''
    return this.parseLine(line)
  }

  private parseLine(line: string): URL | undefined {
    if (!line.startsWith(READY_PREFIX)) return undefined
    if (this.announced) throw new Error('desktop runtime announced more than one readiness URL')
    const rawUrl = line.slice(READY_PREFIX.length).split(' ', 1)[0]
    if (rawUrl === undefined || rawUrl === '') {
      throw new Error('desktop runtime announced an invalid readiness URL')
    }
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      throw new Error('desktop runtime announced an invalid readiness URL')
    }
    const token = url.searchParams.get('token')
    if (url.protocol !== 'http:'
      || url.hostname !== '127.0.0.1'
      || url.port === ''
      || url.pathname !== '/'
      || url.hash !== ''
      || url.searchParams.size !== 1
      || token === null
      || token === '') {
      throw new Error('desktop runtime readiness URL must be a token-authenticated loopback root')
    }
    this.announced = true
    return url
  }
}

/** Runtime supervisor construction options. */
export interface RuntimeSupervisorOptions {
  runtimePath: string
  cwd: string
  startupTimeoutMs?: number
  shutdownTimeoutMs?: number
  spawnRuntime?: typeof spawn
  forceKill?: (pid: number) => Promise<void>
  onUnexpectedExit?: (error: Error) => void
}

/** One supervised local Web runtime. */
export class RuntimeSupervisor {
  private readonly startupTimeoutMs: number
  private readonly shutdownTimeoutMs: number
  private readonly spawnRuntime: typeof spawn
  private readonly forceKill: (pid: number) => Promise<void>
  private child: ChildProcessWithoutNullStreams | undefined
  private closePromise: Promise<void> = Promise.resolve()
  private stopPromise: Promise<void> | undefined
  private stopping = false
  private ready = false
  private diagnostic = ''
  private failureReported = false

  constructor(private readonly options: RuntimeSupervisorOptions) {
    this.startupTimeoutMs = options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS
    this.spawnRuntime = options.spawnRuntime ?? spawn
    this.forceKill = options.forceKill ?? forceKillProcessTree
  }

  /** Start the runtime and resolve only after its authenticated URL is announced. */
  async start(): Promise<URL> {
    if (this.child !== undefined) throw new Error('desktop runtime is already started')
    const parser = new ReadyUrlParser()
    const child = this.spawnRuntime(this.options.runtimePath, [
      'web', '--no-open', '--port', '0', '--supervised',
    ], {
      cwd: this.options.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    return await new Promise<URL>((resolve, reject) => {
      let settled = false
      const fail = (error: Error): void => {
        if (settled) {
          this.reportUnexpected(error)
          void this.stop()
          return
        }
        settled = true
        clearTimeout(timeout)
        reject(this.withDiagnostic(error.message))
        void this.stop()
      }
      const accept = (url: URL): void => {
        if (settled) return
        settled = true
        this.ready = true
        clearTimeout(timeout)
        resolve(url)
      }
      const consume = (chunk: string): void => {
        this.appendDiagnostic(chunk)
        try {
          const url = parser.push(chunk)
          if (url !== undefined) accept(url)
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)))
        }
      }
      child.stdout.on('data', consume)
      child.stderr.on('data', (chunk: string) => { this.appendDiagnostic(chunk) })
      child.once('error', (error) => { fail(new Error(`desktop runtime could not start: ${error.message}`)) })
      this.closePromise = new Promise<void>((closeResolve) => {
        child.once('close', (code, signal) => {
          closeResolve()
          try {
            parser.finish()
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)))
            return
          }
          const reason = `desktop runtime exited with ${code === null ? `signal ${String(signal)}` : `code ${String(code)}`}`
          if (!settled) fail(new Error(reason))
          else if (!this.stopping) this.reportUnexpected(this.withDiagnostic(reason))
        })
      })
      const timeout = setTimeout(() => {
        fail(new Error(`desktop runtime did not become ready within ${String(this.startupTimeoutMs)} ms`))
      }, this.startupTimeoutMs)
    })
  }

  /** Close stdin, wait for bounded shutdown, then terminate the process tree. */
  async stop(): Promise<void> {
    if (this.stopPromise === undefined) this.stopPromise = this.stopOnce()
    await this.stopPromise
  }

  private async stopOnce(): Promise<void> {
    this.stopping = true
    const child = this.child
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) return
    child.stdin.end()
    const closed = await Promise.race([
      this.closePromise.then(() => true),
      new Promise<false>((resolve) => { setTimeout(() => { resolve(false) }, this.shutdownTimeoutMs) }),
    ])
    if (closed) return
    if (child.pid !== undefined) await this.forceKill(child.pid)
  }

  private reportUnexpected(error: Error): void {
    if (!this.ready || this.failureReported || this.stopping) return
    this.failureReported = true
    this.options.onUnexpectedExit?.(error)
  }

  private appendDiagnostic(chunk: string): void {
    this.diagnostic = `${this.diagnostic}${redactRuntimeOutput(chunk)}`.slice(-DIAGNOSTIC_LIMIT)
  }

  private withDiagnostic(message: string): Error {
    const detail = this.diagnostic.trim()
    return new Error(detail === '' ? message : `${message}\n\n${detail}`)
  }
}

/** Force one process tree to exit after its graceful-shutdown budget expires. */
async function forceKillProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => { resolve() })
    })
    return
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
}
