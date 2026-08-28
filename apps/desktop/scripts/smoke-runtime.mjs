/** Black-box smoke for the packaged dsh Web runtime used by the desktop app. */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const executable = process.argv[2]
if (executable === undefined) throw new Error('usage: node smoke-runtime.mjs <dsh-runtime-executable>')

const child = spawn(resolve(executable), ['web', '--no-open', '--port', '0', '--supervised'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
})
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
let stdout = ''
let stderr = ''
child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4096) })

const ready = new Promise((resolveReady, reject) => {
  const timeout = setTimeout(() => { reject(new Error('runtime readiness timed out')) }, 30_000)
  child.once('error', reject)
  child.once('close', code => { reject(new Error(`runtime exited before readiness with code ${String(code)}: ${stderr}`)) })
  child.stdout.on('data', chunk => {
    stdout += chunk
    for (;;) {
      const newline = stdout.indexOf('\n')
      if (newline < 0) return
      const line = stdout.slice(0, newline).replace(/\r$/u, '')
      stdout = stdout.slice(newline + 1)
      if (!line.startsWith('dsh web: ')) continue
      const candidate = line.slice('dsh web: '.length).split(' ', 1)[0]
      const url = new URL(candidate)
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.searchParams.get('token') === null) {
        reject(new Error('runtime emitted an invalid readiness URL'))
        return
      }
      clearTimeout(timeout)
      resolveReady(url)
      return
    }
  })
})

try {
  const url = await ready
  const exchanged = await fetch(url, { redirect: 'manual' })
  if (exchanged.status !== 303) throw new Error(`token exchange returned ${String(exchanged.status)}`)
  const cookie = exchanged.headers.get('set-cookie')?.split(';', 1)[0]
  const location = exchanged.headers.get('location')
  if (cookie === undefined || location === null) throw new Error('token exchange omitted its cookie or redirect')
  const cleanUrl = new URL(location, url)
  if (cleanUrl.origin !== url.origin || cleanUrl.pathname !== '/' || cleanUrl.search !== '') {
    throw new Error('token exchange did not redirect to the clean runtime root')
  }
  const page = await fetch(cleanUrl, { headers: { cookie } })
  if (page.status !== 200) throw new Error(`authenticated root returned ${String(page.status)}`)
  child.stdin.end()
  const code = await new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => { reject(new Error('runtime did not exit after stdin EOF')) }, 10_000)
    child.once('close', exitCode => {
      clearTimeout(timeout)
      resolveExit(exitCode)
    })
  })
  if (code !== 0) throw new Error(`runtime exited with code ${String(code)}`)
  console.log('desktop runtime smoke: authenticated root served and supervised EOF exited 0')
} catch (error) {
  child.kill('SIGKILL')
  throw error
}
