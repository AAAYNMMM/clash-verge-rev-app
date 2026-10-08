# Clash Verge Rev App

基于 [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev) 与 [Mihomo](https://github.com/MetaCubeX/mihomo) 的独立分支。核心扩展是 **TUN 入站的进程级策略覆盖层**：为指定应用绑定独立的出站节点，其余流量仍遵循原有规则、全局或直连模式。该分支不是上游官方发行版。

**当前公开构建：`v2.5.13` · Windows x64 测试预发布。**
[Release](https://github.com/AAAYNMMM/clash-verge-rev-app/releases/tag/v2.5.13) · [路由机制](docs/APP_ROUTING.md) · [English](docs/README_en.md) · [License](LICENSE)

## 网络与路由模型

APP 分流是叠加在 Mihomo 出站策略上的独立开关，不是第四种互斥的内核模式。它仅在 TUN 开启且系统代理关闭时激活；系统代理开启或 TUN 关闭会撤销覆盖层，保留分组配置及默认模式。

~~~text
                   Mihomo
                     │
              Local destination exceptions
                     │
               IN-TYPE,TUN?
                ┌────┴────┐
               yes        no
                │         │
       Ordered APP groups │
          │               │
    ┌─────┴─────┐         │
 fixed node   Rule        │
    │           │         │
 pinned exit    └────┬────┘
                     │
              Default outbound
             Rule / Global / Direct
~~~

- **匹配优先级**：本地目标特例 → TUN APP 分组（按声明顺序，首个命中生效）→ 默认出口。
- **进程判定**：对进程名或完整可执行路径进行精确字面量匹配，生成 Mihomo `PROCESS-NAME-REGEX` / `PROCESS-PATH-REGEX` 条件；不以父进程为依据。
- **固定节点**：每组只使用手动选定的节点，保留订阅来源身份。节点缺失、不可用或协议不兼容时阻断，不转向其他节点、全局出口或直连。
- **规则委托**：允许应用继续使用订阅原始规则链；即使默认出口设为全局，委托连接也不会重新进入全局兜底。
- **未匹配应用**：由默认 `Rule`、`Global` 或 `Direct` 负责，APP 覆盖层不会将所有未分组进程强制直连。

实际合成配置运行于 Mihomo `rule` 模式：全局默认出口使用 `GLOBAL` 选择器模拟全局模式，订阅规则保留原有顶层顺序和语义。关闭 APP 覆盖层则恢复原生默认模式。实现见 `src-tauri/src/enhance/app_routing.rs`。

## 控制面与执行面

| 子系统 | 职责 |
| --- | --- |
| React / Tauri GUI | 分组配置、节点候选筛选、手动选择及运行状态呈现 |
| Verge 配置层 | 持久化 `enable_app_routing`、`app_routing.groups` 和默认模式；保证状态切换一致性 |
| 路由配置生成器 | 将有序进程条件和固定出口合成为 Mihomo 规则与私有代理组 |
| Mihomo | TUN 捕获、进程识别、规则决策及真正的数据转发 |
| 独立系统服务 | 安装授权、服务端身份校验、受控内核生命周期及 IPC 通信 |

节点候选使用 Rust `fancy-regex`，支持环视和反向引用，并设置 100,000 次回溯限制。**表达式只在候选列表筛选与配置校验时执行，不参与逐连接或逐数据包转发。** 配置落地后由内核按已选节点转发。

### 运行边界

- APP 覆盖仅针对 `IN-TYPE,TUN`；显式 HTTP/SOCKS 入站不进入 APP 进程规则。
- 同一个浏览器的不同标签页共享进程级路由策略；该功能不是基于 URL 或标签页的分流系统。
- 主程序不自动继承目录外辅助进程的网络身份；运行程序列表是进程快照，并非子进程关系跟踪。
- 本地直连特例位于 APP 规则之前，可能覆盖原订阅中刻意配置的私有网段代理路径；其完整范围和优先级见[路由机制](docs/APP_ROUTING.md)。
- 现有验证覆盖内核配置解析与隔离路由行为；不等同于所有网卡及真实 TUN 环境的端到端验证。

## 独立发行身份

| 标识 | 值 |
| --- | --- |
| Windows 安装根目录 | `C:\Program Files\Clash Verge Rev App` |
| 配置根目录 | `%APPDATA%\io.github.aaaynmmm.clash-verge-rev-app` |
| Tauri 标识 | `io.github.aaaynmmm.clash-verge-rev-app` |
| 主程序 | `clash-verge-rev-app.exe` |
| Windows 服务 | `clash_verge_rev_app_service` |
| 服务 / 内核 | `cvr-app-service` / `cvr-app-mihomo` |
| URL Scheme | `clash-verge-rev-app://` |
| Mixed / SOCKS / HTTP | `17897` / `17898` / `17899` |
| Controller | `19097` |

注册表项、快捷方式、服务 IPC、单实例与更新命名空间均与上游分离。两版可以独立安装、保存配置，但 Windows 的系统代理及网络路由依然是共享资源，不能由两个客户端同时接管。

## 发布与构建

公开 Release 包含 Windows x64 NSIS 测试安装程序、SHA-256 校验文件以及独立更新签名。`.sig` 用于应用更新验证，不代表 Windows Authenticode 签名。当前没有发布其他平台或稳定自动更新通道的对应资产。

构建通过 Tauri + Rust workspace + pnpm；独立服务与安装辅助程序来自 `crates/clash-verge-rev-app-service`，不可用上游同名服务二进制替代。受控 IPC 的协议兼容校验保持启用。

上游著作权与 GPL-3.0 声明保留；详见 [LICENSE](LICENSE) 及 [service provenance](crates/clash-verge-rev-app-service/UPSTREAM.md)。
