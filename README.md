# Clash Verge Rev App

<img src="src-tauri/icons/icon.png" alt="Clash Verge Rev App" width="128">

基于 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 的独立分支，提供 **TUN 下的 APP 分组优先分流**，使用独立名称、图标、安装目录、配置和后台服务。**不是上游官方发布。**

**当前版本：2.5.13 · Windows x64 测试版**

[下载安装包](https://github.com/AAAYNMMM/clash-verge-rev-app/releases/tag/v2.5.13) · [APP 使用说明](docs/APP_ROUTING.md) · [本版发布说明](docs/releases/v2.5.13.md) · [更新记录](Changelog.md) · [English](docs/README_en.md)

## 安装与升级

从本仓库 Releases 下载 `Clash.Verge.Rev.App_2.5.13_x64-test-setup.exe`。退出正在运行的 **Clash Verge Rev App**，运行安装包并确认 Windows 管理员授权，保持独立版已有目录即可覆盖升级；无需先卸载或删除配置。

2.5.13 修复系统服务安装／修复反复报错 `1007` 的问题，覆盖升级会同步替换已安装的独立版服务，不再只是重启旧服务。首次安装且没有服务时，可在软件的服务提示中安装。不要用原版服务文件替换本版服务。

本次复用代码提交 `06ba99a6` 构建并安装验证的 2.5.13 安装包，采用 `fast-release` 测试配置，文档更新不改变程序字节。仅提供 Windows x64 安装包，不表示其他平台、便携版或固定 WebView2 版本已发布。

Release 包含 `.sha256` 校验文件及 `.sig` 更新签名。**更新签名不等同于 Windows Authenticode 签名。** 本次为测试预发布，采用手动下载安装，不推送到稳定自动更新渠道。

## 推荐配置：浏览器普通节点，其他程序家宽

1. 关闭原版的系统代理和 TUN，避免同时接管网络；在独立版关闭系统代理、开启 TUN。
2. 开启独立 **APP** 开关，默认模式选择 **全局**，在「默认出口」手动选择家宽节点。
3. 点击侧栏「规则」一行右半边，新建「浏览器」组，添加浏览器程序，选择「指定节点」并手动选中普通节点。

浏览器通过 TUN 的连接优先使用普通节点，其他未匹配 APP 分组的外网连接使用全局选中的家宽节点。无需逐个添加 Codex、Git 或短时间运行的辅助程序。

用于 TUN 分流的程序应关闭自己的 HTTP／SOCKS 代理设置及代理扩展。显式代理入站不套用 APP 覆盖。同一浏览器里的 AI 网页也遵循浏览器组，这不是标签页分流。

## 当前分流逻辑

| 配置或连接 | 行为 |
| --- | --- |
| APP + 规则 | 命中应用使用分组出口，其余使用原有规则 |
| APP + 全局 | 命中应用使用分组出口，其余使用 `GLOBAL` 当前节点 |
| 分组选择「规则模式」 | 使用原有规则链及节点，不改走全局兜底 |
| 分组选择固定节点 | 只用手动选择的节点，失效、缺失或不支持该连接时不回退 |
| 关闭 APP | 保持默认规则／全局／直连模式原有行为 |
| 关闭 TUN 或开启系统代理 | 停用 APP，保留分组、节点和默认模式；恢复 TUN 后需手动启用 APP |

APP 是独立开关，不是第四个互斥模式。「APP 分组／默认出口」是两个节点视图，切换视图不会关闭另一边。APP 视图只显示自建分组及其候选节点，不显示订阅的自动选择、故障转移等代理组。

侧栏两项规则合并为 **【普通规则图标　规则　APP 图标】**，左右各半、独立点击与高亮。右上角保留「链式代理」及已有链式编辑功能；节点视图和 APP 开关分开管理。

### 应用与节点筛选

应用可从文件选择、运行程序列表搜索多选，或每行手动填写进程名／完整路径。完整路径区分同名程序的不同安装位置。当前没有目录自动覆盖、父子进程自动继承或已退出程序的历史选择。

节点过滤使用 **fancy-regex**，支持前后查找和反向引用；留空列出全部节点，多行取并集。候选列表仍需手动选一个节点，不自动故障切换。回溯上限 100,000，错误或超限会提示。过滤只在预览、配置生成及校验时执行，不随数据包执行。

### 本地地址优先直连

APP 生效时，在 APP 分组之前插入固定本地目标 `DIRECT` 规则：回环地址、`localhost`／`.local`／`.lan`、IPv4 私有及链路本地地址、IPv6 ULA 及链路本地地址。这不是 TUN 路由排除，也不是完整本地网络识别。

该功能目前没有独立开关；IP 规则带 `no-resolve`，任意域名解析到内网 IP 不保证命中。通过代理访问远端私有网段可能与这些前置规则冲突。本地规则不限定入站类型，同一内核收到的显式 HTTP／SOCKS 请求也受其影响；后面的 APP 进程规则才限定 `IN-TYPE,TUN`。详见 [范围与限制](docs/APP_ROUTING.md)。

## 独立安装信息

| 项目 | Clash Verge Rev App |
| --- | --- |
| Windows 默认安装目录 | `C:\Program Files\Clash Verge Rev App` |
| 主程序 | `clash-verge-rev-app.exe` |
| 应用／WebView／配置标识 | `io.github.aaaynmmm.clash-verge-rev-app` |
| Windows 配置目录 | `%APPDATA%\io.github.aaaynmmm.clash-verge-rev-app` |
| Windows 服务 | `clash_verge_rev_app_service` |
| 服务数据目录 | `%PROGRAMDATA%\cvr-app-service` |
| 内核 | `cvr-app-mihomo.exe`、`cvr-app-mihomo-alpha.exe` |
| 导入协议 | `clash-verge-rev-app://` |
| 混合／SOCKS／HTTP 默认端口 | `17897`／`17898`／`17899`，以实际启用项为准 |
| 默认控制端口 | `19097`，以控制器开关为准 |
| Windows TUN 设备 | `CVR-App-TUN` |

注册表、卸载项、快捷方式、启动任务、服务通信、锁及更新缓存独立命名。不自动迁移原版订阅，不接管原版 `clash://` 和 `clash-verge://`，不要安装进原版目录。

**独立安装不等于网络设置互不影响。** 两版可以保留，但系统代理或 TUN 应只由一个客户端接管。本版所有权检查不是跨客户端原子锁，不能阻止其他客户端修改系统设置。

## 验证范围

2.5.13 已完成 Windows 覆盖安装、真实服务通信及服务启动内核验证。APP + 规则／全局通过真实内核解析及隔离分流验证；**实际 TUN 接管下的完整端到端验证尚未完成**。

自动化工具沙箱启动曾出现 WebView2 `0x80070005`（拒绝访问），当时服务内核运行正常，尚未确认正常桌面启动是否受影响。这与已修复的服务协议错误不同；遇到时先从桌面／开始菜单启动并保留日志，不要直接删除配置。

## 开发与构建

使用 `rust-toolchain.toml`、`package.json` 指定的工具版本及对应平台的 Tauri 构建依赖：

```sh
pnpm install --frozen-lockfile
pnpm prebuild
pnpm build
```

`prebuild` 从 `crates/clash-verge-rev-app-service` 编译服务及安装／卸载工具。服务源码改动后必须重跑，不能混装旧资源和新主程序。`pnpm build:fast` 是测试构建，不应当作性能优化后的正式发行构建。

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。自动更新检查默认关闭，上传安装包本身不会生成更新元数据。签名仅使用本分支配套密钥；不得提交私钥、用户配置、订阅或日志。

## 来源与许可证

保留原作者署名及 GPL 许可。基于 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev)、[Clash Verge](https://github.com/zzzgydi/clash-verge)、[Mihomo](https://github.com/MetaCubeX/mihomo)、[Tauri](https://github.com/tauri-apps/tauri) 和 [Vite](https://github.com/vitejs/vite)，独立版使用自己的分流 A 图标及名称。

参见 [LICENSE](LICENSE)、[服务来源](crates/clash-verge-rev-app-service/UPSTREAM.md)。请到 [本仓库 Issues](https://github.com/AAAYNMMM/clash-verge-rev-app/issues) 报告本分支问题。其他语言的历史上游说明及旧截图已标注，不应作为本版安装／分流说明。
