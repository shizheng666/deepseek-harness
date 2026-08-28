# DeepSeek Harness Desktop

[English](README.md) | 中文

DeepSeek Harness Desktop 是现有 Web 应用的 Windows x64 桌面发行版。它随附 Electron 与独立 `dsh` 运行时，因此安装后不需要 Node.js、pnpm 或源码 checkout。桌面版本独立于仓库内 npm 包的版本。

## 安装与运行

从公开的 [`shizheng666/deepseek-harness` Releases](https://github.com/shizheng666/deepseek-harness/releases) 下载 `DeepSeek-Harness-Desktop-Setup-<version>-x64.exe`，再运行面向当前用户的一键安装程序。首个公开版本 `0.1.2` 未签名，因此 Windows SmartScreen 可能显示“未知发布者”警告。选择继续之前，请先确认下载来源。

应用会把随附运行时启动为 `dsh web --no-open --port 0 --supervised`，并在启用沙箱的 Electron 窗口中加载已认证的回环页面。它使用普通 Harness home，不覆盖 `DSH_HOME`，因此 CLI 与桌面应用共享设置、凭据、profile 和会话。同一时间只运行一个桌面实例。

如果本地运行时无法启动或意外退出，应用会提供“重试”和“退出”，不会无限重启。关闭应用时会通过 stdin 请求运行时退出；只有超过 5 秒优雅关闭预算后，才会强制终止其进程树。

## 更新

打包版在成功启动后检查一次公开 GitHub Release feed，并在后台下载更高版本。下载完成后，可选择“立即重启”马上安装，或选择“稍后”在正常退出时安装。“帮助 > 检查更新”会执行显式检查并报告失败；自动检查失败绝不会阻止应用启动。

拉取或合并仓库源码不会修改已经安装的桌面应用。同步上游改动后，必须提升 `apps/desktop/package.json` 中的版本、重新构建并发布不可变的 `desktop-v<version>` 标签。发布工作流会校验标签与包版本完全一致，并发布 NSIS 安装程序、对应 blockmap 与 `latest.yml`；已安装客户端随后才能发现更高版本。不要移动或复用发布标签——应发布版本号更高的修复版本。

```sh
git switch codex/desktop-windows
git fetch origin
git merge origin/master
# update apps/desktop/package.json
git push fork codex/desktop-windows
git tag desktop-v0.1.1
git push fork desktop-v0.1.1
```

## 开发

在任一受支持的开发宿主机上构建并测试桌面版 TypeScript：

```sh
pnpm --filter @deepseek-ai/dsh-desktop test
pnpm --filter @deepseek-ai/dsh-desktop build
pnpm --filter @deepseek-ai/dsh-desktop build:icon
```

Windows 工作流拥有可分发构建。它会构建正式 workspace、创建 Windows x64 独立运行时、运行运行时冒烟测试、暂存 `dsh-runtime.exe` 及其 ripgrep 伴随文件、构建 NSIS 目标、校验更新元数据，并验证静默安装、启动、进程清理和卸载。没有配置 `WINDOWS_CSC_LINK` 的构建保持未签名；后续 Release 可以使用 `WINDOWS_CSC_LINK` 与 `WINDOWS_CSC_KEY_PASSWORD` 仓库 secret。Pull Request 与手动运行只上传临时产物，不创建 Release；只有公开 fork 中的 `desktop-v*` 标签会发布 Release。

在 Windows 上进行本地 Electron 开发时，先构建 workspace 与独立运行时；仅在运行时不位于默认路径时设置 `DSH_DESKTOP_RUNTIME_PATH`。桌面进程只在内存中保存运行时 token，并从诊断信息中脱敏；它只接受宣告的 `http://127.0.0.1:<port>/` origin，拒绝权限请求与其他导航，并通过系统浏览器打开外部 HTTPS 链接。应用不提供 renderer、preload 或桌面 IPC API。
