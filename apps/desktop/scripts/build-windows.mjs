#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const builderCli = require.resolve('electron-builder/cli.js')
const result = spawnSync(
  process.execPath,
  [builderCli, '--win', 'nsis', '--x64', '--publish', 'never'],
  {
    env: {
      ...process.env,
      npm_config_ignore_scripts: 'true',
    },
    stdio: 'inherit',
  },
)

if (result.error !== undefined) throw result.error
if (result.signal !== null) throw new Error(`electron-builder exited on ${result.signal}`)
process.exitCode = result.status ?? 1
