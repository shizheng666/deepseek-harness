# DeepSeek Harness Desktop

English | [中文](README.zh.md)

DeepSeek Harness Desktop is the Windows x64 desktop distribution of the existing Web application. It packages Electron and a standalone `dsh` runtime, so an installed copy does not require Node.js, pnpm, or a source checkout. The desktop version is independent of the repository's npm package versions.

## Install and run

Download `DeepSeek-Harness-Desktop-Setup-<version>-x64.exe` from the public [`shizheng666/deepseek-harness` Releases](https://github.com/shizheng666/deepseek-harness/releases), then run the one-click current-user installer. The first published version, `0.1.1`, is unsigned, so Windows SmartScreen may show an unknown-publisher warning. Review the download source before choosing to continue.

The application starts its packaged runtime as `dsh web --no-open --port 0 --supervised` and loads the authenticated loopback page in a sandboxed Electron window. It uses the normal Harness home without overriding `DSH_HOME`, so the CLI and desktop application share settings, credentials, profiles, and sessions. Only one desktop instance runs at a time.

If the local runtime cannot start or exits unexpectedly, the application offers Retry and Quit instead of restarting indefinitely. Closing the application asks the runtime to shut down through stdin and force-terminates its process tree only when the five-second graceful-shutdown budget expires.

## Updates

A packaged application checks the public GitHub Release feed once after successful startup and downloads a newer release in the background. When the download finishes, choose Restart Now to install immediately or Later to install on a normal exit. Help > Check for Updates performs an explicit check and reports failures; an automatic-check failure never blocks startup.

Pulling or merging repository source does not modify an installed desktop application. After synchronizing upstream changes, increment `apps/desktop/package.json`, rebuild, and publish a new immutable `desktop-v<version>` tag. The release workflow validates that the tag and package version match and publishes the NSIS installer, its blockmap, and `latest.yml`; installed clients then discover the higher version. Never move or reuse a release tag—publish a higher corrective version instead.

```sh
git switch codex/desktop-windows
git fetch origin
git merge origin/master
# update apps/desktop/package.json
git push fork codex/desktop-windows
git tag desktop-v0.1.1
git push fork desktop-v0.1.1
```

## Development

Build and test the desktop TypeScript on any supported development host:

```sh
pnpm --filter @deepseek-ai/dsh-desktop test
pnpm --filter @deepseek-ai/dsh-desktop build
pnpm --filter @deepseek-ai/dsh-desktop build:icon
```

The Windows workflow owns the distributable build. It builds the official workspace, creates the Windows x64 standalone runtime, runs the runtime smoke test, stages `dsh-runtime.exe` and its ripgrep companion, builds the NSIS target, validates update metadata, and exercises silent install, launch, process cleanup, and uninstall. Builds without `WINDOWS_CSC_LINK` are unsigned; later releases can use `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD` repository secrets. Pull requests and manual runs upload temporary artifacts without creating a Release; only `desktop-v*` tags in the public fork publish a Release.

For local Electron development on Windows, build the workspace and standalone runtime, then set `DSH_DESKTOP_RUNTIME_PATH` only when a non-default runtime path is required. The desktop process keeps the runtime token in memory, redacts it from diagnostics, accepts only the announced `http://127.0.0.1:<port>/` origin, denies permission requests and other navigation, and opens external HTTPS links in the system browser. There is no renderer, preload, or desktop IPC API.
