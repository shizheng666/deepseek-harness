# Agent Note: Windows desktop supervises the packaged Web runtime

Status: implemented

English | [中文](2026-08-28-windows-desktop-supervised-web-runtime.zh.md)

## Problem

DeepSeek Harness had a browser Web surface and a standalone Windows executable, but no installable desktop distribution. A desktop package needed to preserve the existing `dsh` application-launch rule, Web authentication, user data locations, and plugin composition while owning native window lifecycle and GitHub Release updates. Source synchronization could not itself update an installed application: updater clients require a newly versioned, rebuilt release with update metadata.

## Decision

`apps/desktop` is a private Electron application with an independent desktop version. Its Windows x64 NSIS package carries the existing standalone runtime as `runtime/dsh-runtime.exe` together with its ripgrep companion. Electron starts that executable as `dsh web --no-open --port 0 --supervised`; the executable still enters the normal `dsh` launcher and `web` profile, so the desktop package does not mount a second Cordis application tree. The desktop process does not override `DSH_HOME`, and therefore shares settings, credentials, profiles, and sessions with an ordinary CLI installation.

The Web app owns `--supervised`. When that flag is present, it discards and resumes the otherwise unused stdin stream so EOF enters the existing graceful process shutdown; protocol applications keep stdin paused until their transport reads it, and ordinary `dsh web` launches ignore stdin EOF. Electron closes the child stdin during application exit, waits five seconds, then terminates the Windows process tree if the runtime has not exited. Runtime startup succeeds only after stdout announces exactly one token-authenticated `http://127.0.0.1:<port>/` URL within thirty seconds. The token remains in memory and is redacted from all retained diagnostics. A startup failure or unexpected runtime exit offers one user-controlled Retry or Quit choice rather than an automatic restart loop.

The Electron window loads the local authenticated HTTP surface directly. It uses the sandbox with Node integration disabled and no preload, renderer-owned desktop code, or IPC API. Permission requests are rejected. Navigation remains inside the announced runtime origin; external HTTPS links go to the system browser, while every other origin and protocol is denied. A single-instance lock focuses the existing window on a repeated launch.

The packaged application checks the public `shizheng666/deepseek-harness` GitHub Release feed once after successful startup. A newer release downloads in the background; after download, the user chooses immediate restart and installation or installation on normal exit. Manual checks expose errors, while automatic-check failures remain non-blocking. Releases are immutable `desktop-v<version>` tags whose version must exactly match `apps/desktop/package.json`; the Windows workflow publishes the NSIS installer, blockmap, and `latest.yml`. Desktop manifests are excluded from npm release families and version-consistency checks.

SEA deployment changes pnpm's recorded dependency mode and can remove development dependencies from the workspace. The Windows workflow restores the frozen full installation after staging the runtime, then keeps it intact while electron-builder collects production modules instead of allowing pnpm to prune the builder itself. The repository hook installer also checks CI before importing its development-only Lefthook package, so a production-only reconciliation elsewhere can omit development dependencies without weakening normal local hook installation.

The installed-application smoke launches Electron with a loopback DevTools endpoint and inspects the real renderer after installation. Acceptance requires a non-empty assembled client graph to reach the module loader's live state and rejects the plugin-load failure page; window creation alone is not a successful desktop boot.

The first published `0.1.2` installer is unsigned and may show Windows SmartScreen's unknown-publisher warning. The builder configuration remains compatible with electron-builder's standard CI signing environment so a later release can add certificate-backed signing without changing the packaging or update channel.

## Alternatives considered

**Load the frontend through `file://` and bridge Host calls over desktop IPC** — rejected because it would create a second transport and authentication implementation, duplicate renderer integration, and stop exercising the shipped Web deployment.

**Embed the server directly in Electron** — rejected because Electron would become another Node application launcher and would need to own the workspace's plugin dependency and native-module lifecycle. Reusing the standalone executable keeps the normal `dsh` profile path and isolates the Electron ABI.

**Rebuild the installed application whenever a source checkout pulls upstream changes** — rejected because an installed application has no source checkout or build toolchain. Synchronization and delivery remain separate operations: merge upstream, increment the desktop version, build, and publish a higher release.

**Poll continuously for updates or embed a GitHub token** — rejected because one startup check plus an explicit Help menu action covers the public release channel without retaining credentials or running a background timer.

**Require code signing before the first desktop release** — deferred because the initial distribution explicitly accepts the unsigned SmartScreen warning. Release identity should move to certificate-backed CI variables without changing the public update feed or artifact names.

## Consequences

Windows users receive one current-user installer that needs neither Node.js nor a source checkout and uses the same local data as the CLI. Desktop runtime and browser behavior remain one Web application, with Electron limited to supervision, navigation policy, dialogs, menus, and updates. Pulling source alone has no effect on installed clients; every client-visible change needs a higher desktop version and a new tag. Release CI proves the installed renderer reaches the assembled application rather than an error shell. The public release repository and unsigned first version are deployment dependencies, while macOS, Linux, ARM64, periodic update polling, and a desktop-specific renderer remain outside this decision.

The runtime artifact continues to follow the [single-file executable distribution decision](2026-07-10-single-file-executable-sdk-runtime-distribution.md), the readiness URL follows the [`dsh web` ready-page decision](../feature/2026-08-12-open-ready-web-ui.md), and Web route ownership remains with the [Web transport-layer decision](2026-07-24-web-config-tree-boot-and-transport-layering.md).
