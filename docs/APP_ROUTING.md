# TUN APP Routing — Compilation and Runtime Contract

适用版本：`v2.5.13`。此文档描述配置语义、执行路径与失败边界，不是软件操作教程。

## 1. 状态模型

覆盖层由 Verge 配置中的 `enable_app_routing` 控制，`app_routing.groups` 持久化分组及固定节点身份。默认出口仍使用 Clash 模式 `rule` / `global` / `direct`，APP 不是独立核心模式。

激活条件：

~~~text
effective_app_routing =
  enable_app_routing
  && enable_tun_mode
  && !enable_system_proxy
~~~

配置层禁止在条件不满足时激活；关闭 TUN 或启用系统代理时会停用覆盖层，不删除分组，也不更改已选默认出口。条件恢复后不会自动重新启用。旧配置里的互斥 `mode: app` 迁移为 `rule`，分组保留。

主要实现：`src-tauri/src/config/verge.rs`、`src-tauri/src/feat/config.rs`、`src-tauri/src/enhance/mod.rs`。

## 2. 编译顺序

配置生成器在订阅合并及配置增强之后执行。覆盖层开启时，保存的默认模式先进入 `base_mode`，内核运行模式转换为 `rule`，然后按以下顺序生成规则：

1. 本地目的地址直连特例；
2. 按用户定义顺序生成 APP 分组条件；
3. 若默认模式为 `global` 或 `direct`，为未分配至规则委托的连接增加相应终结出口；
4. 保留订阅已有的顶层规则；
5. 添加末端 `MATCH,DIRECT` 保底。

APP 规则使用 `IN-TYPE,TUN` 与进程表达式组合。因此，同一内核的显式 HTTP/SOCKS 代理入站不会命中 APP 分组覆盖。

### 组匹配

`AppMatcher` 支持两类字面量：`Name` 和 `Path`。生成器将输入转义并锚定为精确匹配，Windows 使用大小写不敏感规则。多个程序条件取 OR；对于已由更高优先级分组声明的程序，后续分组加入 NOT 保护，**首个启用的匹配组决定出口**。

`AppTarget::Rule` 将程序委托给原始顶层规则链，不创建候选节点表。`AppTarget::Node` 创建隐藏的 `__CV_APP_<group-id>` 选择组，只允许选中的代理节点或其原始 provider，并在分流规则后追加相同进程条件的 `REJECT` 兜底。历史 `Direct` 目标仍由后端识别，但新的分组 UI 不提供该选项。

### 默认出口

- `rule`：原始订阅规则按其顶层顺序继续匹配。
- `global`：生成器将未被委托的连接转到 `GLOBAL`，同时保持已选节点不受 APP 分组影响。可选择的全局成员取自 APP 私有分组加入**之前**的内核列表，防止私有组污染全局候选。
- `direct`：未被委托的连接走 `DIRECT`。

全局模式与规则模式的交替并非二次代理；每条连接仅在当前规则链中选择一次终结出口。

## 3. 本地目标优先级

`src-tauri/src/enhance/app_routing.rs` 的 `LOCAL_RULES` 固定前置，包括：

| 类型 | 匹配范围 |
| --- | --- |
| Loopback | `127.0.0.0/8`、`::1/128` |
| Local name suffixes | `localhost`、`local`、`lan` |
| IPv4 private / link-local | `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16` |
| IPv6 unique/link-local | `fc00::/7`、`fe80::/10` |

这些是 **内核规则匹配之后的 DIRECT 决策**，不是绕过 TUN 的路由表排除配置。IP 匹配项含 `no-resolve`，不会仅为该项触发解析。固定前置规则也未按 TUN 入站类型进一步收窄：当订阅故意代理目标私有网段时，这些规则可能覆盖原策略。公网代理失败不触发直连回退。

## 4. 固定节点的失败语义

固定出口持有 `(provider, node name)` 身份，而不只是一个可模糊替代的显示名称：

- 原来源不存在或节点被删除：选项保留，运行时阻断。
- 节点失败：不切到第二候选、`GLOBAL`、订阅规则或 `DIRECT`。
- 节点对协议不兼容：额外 `REJECT` 防止规则引擎继续落入后续出口。
- 修改选择时：更新目标分组，不重写其他分组的选项；新连接按更新后配置处理。

`fancy-regex` 仅负责筛选候选节点名称，并在保存时校验表达式；它不会成为 Mihomo 连接规则。多个筛选表达式取并集，环视/反向引用由 Rust 引擎处理，回溯限制为 100,000 次。对每个节点的出站转发无需再次运行这些表达式。

## 5. 系统边界与隔离

进程名/路径匹配属于发起连接的可执行程序身份，不推导父子进程所有权。短时进程只要其连接进入内核、进程元数据可被识别，已保存规则仍可匹配；运行程序选择器本身只是采样列表。基于目录的动态继承、跨可执行文件的父子进程归属，以及浏览器标签页级路由不属于现有实现。

服务与上游使用不同的 SCM 服务名、可执行文件、IPC 通道、配置根目录和内核名称；GUI 与服务的私有协议版本校验必须一致。运行时资源由当前发行版的安装器部署，不能把上游服务改名后替换。

路由覆盖层在隔离入站模拟与真实 Mihomo 内核配置解析中经过验证；生产网络中的完整 TUN 端到端行为仍依赖操作系统环境与实际进程识别。

**代码锚点**：`src-tauri/src/enhance/app_routing.rs`、`src-tauri/src/config/app_routing.rs`、`src-tauri/src/feat/app_routing.rs`、`src/components/app-rules/app-proxy-groups.tsx`、`src/pages/proxies.tsx`。
