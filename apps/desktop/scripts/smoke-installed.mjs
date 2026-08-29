/** Verify that an installed Electron application renders the assembled Web client. */

const port = process.argv[2]
if (port === undefined || !/^\d+$/u.test(port)) {
  throw new Error('usage: node smoke-installed.mjs <remote-debugging-port>')
}

const endpoint = `http://127.0.0.1:${port}`
const deadline = Date.now() + 30_000
let lastState

/** Wait briefly without blocking the event loop. */
function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/** Evaluate one expression through the page's Chrome DevTools Protocol target. */
async function evaluate(webSocketDebuggerUrl, expression) {
  const socket = new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => { reject(new Error('desktop DevTools socket failed to open')) }, { once: true })
  })
  try {
    const response = await new Promise((resolve, reject) => {
      const id = 1
      socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data))
        if (message.id !== id) return
        if (message.error !== undefined) reject(new Error(message.error.message))
        else resolve(message)
      })
      socket.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }))
    })
    if (response.result.exceptionDetails !== undefined) {
      throw new Error(response.result.exceptionDetails.text)
    }
    return response.result.result.value
  } finally {
    socket.close()
  }
}

while (Date.now() < deadline) {
  try {
    const targets = await fetch(`${endpoint}/json/list`).then(response => response.json())
    const page = targets.find(target => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string')
    if (page !== undefined) {
      lastState = await evaluate(page.webSocketDebuggerUrl, `(() => {
        const boot = globalThis.__DSH_BOOT__
        const loader = globalThis.__ModuleLoader__
        return {
          title: document.title,
          bodyText: document.body?.innerText?.slice(0, 500) ?? '',
          entries: Array.isArray(boot?.entries) ? boot.entries.length : -1,
          batches: Array.isArray(boot?.batches) ? boot.batches.length : -1,
          loaderMode: loader?.mode ?? null,
        }
      })()`)
      if (lastState.loaderMode === 'live' && lastState.entries > 0
        && !lastState.bodyText.includes('Failed to load plugins')) {
        console.log(`desktop installed smoke: ${String(lastState.entries)} client entries reached live mode`)
        process.exit(0)
      }
    }
  } catch {
    // Electron and its first page may not have opened the DevTools endpoint yet.
  }
  await delay(500)
}

throw new Error(`installed desktop client did not boot: ${JSON.stringify(lastState)}`)
