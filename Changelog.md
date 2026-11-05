## v2.5.8.1

- 修复 TUN 默认全局与 APP 规则并用时，内核 DNS 被默认出口截获的问题
- 新增 APP 分组的「直连」「拒绝」出口，无需指定代理节点

## v2.5.8

- 修复 APP 切换节点短暂卡顿、连续点击丢失最后选择及无关连接被关闭的问题

- APP 节点视图与分流开关分离，关闭分流时也可预选节点
- 同步上游 v2.5.8 正式版：补全托盘分组测速、同名节点延迟、订阅布局和内核占用提示
- 统一 APP 与规则页代理组布局，APP 开关移至首页代理模式标题右侧
- 缩小首页模式按钮及说明框，APP 提示保持单行

以下 v2.5.9–v2.5.14 为历史分支编号；当前及后续发行版本跟随上游正式版本。

## v2.5.14

- 新增 APP 规则模式的独立域名规则链及代理组节点选择，TUN 与 APP 可使用不同节点而互不干扰
- 移除上游遗留的 Release 推广链接

## v2.5.13

当前安装、配置和验证范围见 [发布说明](docs/releases/v2.5.13.md)。以下旧版本条目为历史记录；当前 APP 仅在 TUN 下启用，可与规则／全局配合。

**🖥️ Windows**

- 修复独立版服务安装、修复反复失败的问题，覆盖升级同步更新已安装服务

## v2.5.12

- 调整 APP 分流为 TUN 下的独立开关，可与规则／全局同时开启，匹配应用优先使用分组出口，其余连接使用默认出口
- 优化 APP 分流保护：本地地址优先直连，固定节点失败不回退；开启系统代理或关闭 TUN 时停用 APP 分流并保留分组

## v2.5.11

- 合并侧栏「规则／APP 规则」为一行双入口，左右独立点击与高亮，保留折叠和排序功能

## 历史分支 v2.5.10

- 恢复 APP 页面右上角「链式代理」入口，关闭链式视图后返回自建 APP 分组
- 新增 APP 节点筛选对前后查找、反向引用的支持，复杂表达式超限时提示错误

## v2.5.9

- 新增 APP 分组专用节点视图，仅显示自建分组及筛选节点，点击节点即可手动切换
- 优化应用添加：支持搜索并多选运行中的程序，分流方式改为「规则模式／指定节点」二选一
- 调整 TUN 与 APP 模式为互斥，开启 TUN 自动退出 APP，保留分组设置

## v2.5.8
<!-- Release-notes skeleton. Entries accumulate in ./Changelog.md as PRs land;
     before publishing a release, distill them:
     - user-visible changes only — no dev tooling, CI fixes, or refactors whose
       effect is already covered by another entry
     - describe outcomes, not internals: no internal module names, IPC or
       protocol details, or implementation mechanics — write what the user
       observes, not how the code achieves it
     - one line per theme: merge entries that share a root cause
     - each entry fits a single readable line (about 60 CJK characters); if it
       overflows, it is packing multiple themes or detail that belongs in the
       linked issue/PR — split it or drop the detail
     - line grammar: open with a verb (修复/新增/优化), with the platform
       first (Windows/macOS/Linux) when the change is platform-specific;
       merge sub-symptoms as 主题：症状、症状; full-width punctuation,
       「」 for UI labels, backticks for config keys and commands
     - platform entries sit under their platform heading (bold, emoji
       prefixed, ordered Windows/macOS/Linux, combined for pairs like
       macOS/Linux) at the end of their section;
       scripts-workflow/group_platforms.sh regroups, --check verifies
     HTML comments are stripped by the update dialog's sanitizer and hidden on
     GitHub, so they never reach users. -->
## v2.5.10

- 优化版本更新提醒：发现新版本后前往发布页手动下载

<details>
<summary><strong> 🐞 修复问题 </strong></summary>

- 修复全局模式缺少 `GLOBAL` 策略组，无法单独选择全局出口
- 修复服务模式下，SSH 节点的 `private-key` 使用私钥文件时内核无法启动
- 修复服务模式下，内核更新的 GEO 数据库不会同步回应用目录，导致使用新分类的规则无法通过校验
- 修复订阅的 DNS 配置变化后，「DNS 覆写」实际已关闭但开关仍显示开启且没有提示

**🖥️ Windows**

- Windows：修复安装程序重新安装或覆盖时未提示退出运行中应用，导致卸载报错或覆盖失败

</details>

<details>
<summary><strong> ✨ 新增功能 </strong></summary>

- 新增 Clash Verge Rev App 独立版本，隔离安装、配置、后台服务与更新，并更换品牌图标
- 新增「APP」模式：按应用分组选择固定节点或跟随规则，正则筛选节点且不自动故障切换
- 新增系统托盘代理组中的「测试延迟」菜单项

</details>

<details>
<summary><strong> 🚀 优化改进 </strong></summary>


</details>
