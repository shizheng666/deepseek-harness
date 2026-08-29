# Agent Note：Windows 桌面版监督随附 Web 运行时

Status: implemented

[English](2026-08-28-windows-desktop-supervised-web-runtime.md) | 中文

## Problem

DeepSeek Harness 已有浏览器 Web 表层与 Windows 独立可执行文件，但没有可安装的桌面发行版。桌面包需要在负责原生窗口生命周期与 GitHub Release 更新的同时，保留现有 `dsh` 应用启动规则、Web 认证、用户数据位置和插件组合。同步源码本身无法更新已安装应用：更新客户端需要一个带更新元数据、经过重新构建且使用新版本号的 Release。

## Decision

`apps/desktop` 是使用独立桌面版本的私有 Electron 应用。其 Windows x64 NSIS 包把现有独立运行时作为 `runtime/dsh-runtime.exe` 随附，并包含对应 ripgrep 伴随文件。Electron 将该可执行文件启动为 `dsh web --no-open --port 0 --supervised`；可执行文件仍从普通 `dsh` 启动器进入 `web` profile，因此桌面包不会挂载第二套 Cordis 应用树。桌面进程不覆盖 `DSH_HOME`，所以与普通 CLI 安装共享设置、凭据、profile 和会话。

Web 应用拥有 `--supervised`。带该 flag 时，它会丢弃并恢复原本未使用的 stdin 流，使 EOF 进入现有进程优雅关闭流程；协议应用让 stdin 保持暂停，直至其传输层读取输入，而普通 `dsh web` 启动会忽略 stdin EOF。应用退出时，Electron 关闭子进程 stdin，等待 5 秒；运行时仍未退出时再终止 Windows 进程树。只有 stdout 在 30 秒内准确宣告一个带 token 认证的 `http://127.0.0.1:<port>/` URL，运行时启动才算成功。Token 仅保留在内存中，并从所有留存诊断中脱敏。启动失败或运行时意外退出时，只提供一次由用户控制的“重试”或“退出”选择，不进入自动重启循环。

Electron 窗口直接加载本地已认证 HTTP 表层。它启用沙箱并关闭 Node 集成，不提供 preload、renderer 自有桌面代码或 IPC API。所有权限请求都被拒绝。导航只允许留在已宣告的运行时 origin；外部 HTTPS 链接交给系统浏览器，其他所有 origin 与协议则被拒绝。重复启动时，单实例锁会聚焦现有窗口。

打包版在成功启动后检查一次公开的 `shizheng666/deepseek-harness` GitHub Release feed。更高版本会在后台下载；下载后由用户选择立即重启安装，或在正常退出时安装。手动检查会暴露错误，自动检查失败则不阻塞应用。Release 使用不可变的 `desktop-v<version>` 标签，其版本必须与 `apps/desktop/package.json` 完全一致；Windows 工作流发布 NSIS 安装程序、blockmap 与 `latest.yml`。桌面 manifest 被排除在 npm 发布家族与版本一致性检查之外。

SEA 部署会改变 pnpm 记录的依赖模式，并可能从 workspace 删除开发依赖。Windows 工作流会在暂存运行时后根据冻结锁文件恢复完整安装，然后在 electron-builder 收集生产模块时保持该安装，不允许 pnpm 提前裁掉 builder 本身。仓库钩子安装器也会先检查 CI，再导入仅用于开发的 Lefthook 包，使其他场景的纯生产依赖同步可以省略开发依赖，同时不削弱本地正常安装钩子的行为。

已安装应用冒烟测试会使用回环 DevTools endpoint 启动 Electron，并在安装后检查真实 renderer。验收要求非空组合客户端图进入模块加载器 live 状态，并拒绝插件加载失败页面；仅创建窗口不代表桌面启动成功。

首个公开的 `0.1.2` 安装程序未签名，可能显示 Windows SmartScreen“未知发布者”警告。Builder 配置与 electron-builder 标准 CI 签名环境保持兼容，因此后续 Release 可以加入基于证书的签名，而无需更改打包方式或更新通道。

## Alternatives considered

**通过 `file://` 加载前端，并用桌面 IPC 桥接 Host 调用**——否决，因为这会产生第二套传输与认证实现、重复 renderer 集成，而且不再实际运行随发行版交付的 Web 部署。

**把服务器直接嵌入 Electron**——否决，因为 Electron 会成为另一个 Node 应用启动器，并需要负责 workspace 插件依赖与原生模块生命周期。复用独立可执行文件可以保留普通 `dsh` profile 路径，并隔离 Electron ABI。

**源码 checkout 拉取上游改动后直接重建已安装应用**——否决，因为已安装应用不含源码 checkout 或构建工具链。同步与交付保持为两项独立操作：合并上游、提升桌面版本、构建并发布更高版本。

**持续轮询更新或嵌入 GitHub token**——否决，因为一次启动检查加“帮助”菜单中的显式操作，已经能覆盖公开发布通道，无需保留凭据或运行后台定时器。

**首个桌面 Release 之前强制要求代码签名**——延期，因为初始发行明确接受未签名导致的 SmartScreen 警告。发布身份应通过 CI 证书变量迁移到证书签名，同时保持公开更新 feed 与产物文件名不变。

## Consequences

Windows 用户获得一个不需要 Node.js 或源码 checkout 的当前用户级安装程序，并与 CLI 使用同一份本地数据。桌面运行时与浏览器行为继续属于同一 Web 应用，Electron 仅负责监督、导航策略、对话框、菜单和更新。只拉取源码不会影响已安装客户端；每项客户端可见改动都需要更高桌面版本与新标签。Release CI 会证明已安装 renderer 进入组合应用，而不是停在错误外壳。公开发布仓库与首版未签名是部署依赖，macOS、Linux、ARM64、定时更新轮询和桌面专用 renderer 则不属于本决策。

运行时产物继续遵循[单文件可执行发行决策](2026-07-10-single-file-executable-sdk-runtime-distribution.zh.md)，就绪 URL 遵循 [`dsh web` 就绪页面决策](../feature/2026-08-12-open-ready-web-ui.zh.md)，Web 路由归属继续遵循 [Web 传输层决策](2026-07-24-web-config-tree-boot-and-transport-layering.zh.md)。
