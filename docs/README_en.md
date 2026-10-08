# Clash Verge Rev App

<img src="../src-tauri/icons/icon.png" alt="Clash Verge Rev App" width="128">

An independent fork of [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev), with **TUN-only APP routing overrides**, separate installation, configuration, services and branding. This is not an official upstream release.

**Current release: 2.5.13 — Windows x64 test build**

[Download](https://github.com/AAAYNMMM/clash-verge-rev-app/releases/tag/v2.5.13) · [简体中文](../README.md) · [Routing reference](APP_ROUTING.md) · [Release notes](releases/v2.5.13.md) · [Changelog](../Changelog.md)

## Install or upgrade

Download `Clash.Verge.Rev.App_2.5.13_x64-test-setup.exe`, exit the running fork, run the installer, accept the administrator prompt and keep the fork's current installation directory. Do not uninstall first or delete configuration. Upstream subscriptions are not imported automatically.

2.5.13 fixes service installation/repair error `1007`. An upgrade replaces the installed fork service rather than just restarting an old copy. On a fresh installation without a service, use the in-app service installation prompt. Renamed upstream service executables are not compatible.

This release reuses the verified installer built from commit `06ba99a6` with the `fast-release` profile. Documentation updates do not alter its bytes. It is a **test prerelease**, not a fully optimized production build. Only Windows x64 is supplied; other platforms, portable and fixed-WebView2 installers are not included.

The `.sha256` file verifies integrity; `.sig` is the updater signature, not a Windows Authenticode signature. Download this prerelease manually; it is not advertised on the stable automatic-update channel. Automatic checks default to off, and uploading an installer alone does not create updater metadata.

## Browser on an ordinary node; other apps on a residential node

Disable the other client's system proxy and TUN. In this fork, disable System proxy, enable TUN, enable the independent **APP** toggle, and select **Global** as the default mode. Choose a residential node under **Default exit**. Use the right half of the sidebar Rules row to create a Browser group, add the browser executable, choose **Specific node**, and manually select an ordinary node.

The browser's TUN connections use its APP node; other unmatched external connections use Global. Codex, Git and short-lived helpers therefore do not each need APP exceptions. Disable explicit proxy settings/extensions for apps meant to use TUN. AI websites inside the same browser process also follow the browser group; this is not per-tab routing.

## Routing and interface

APP is an independent switch, not a fourth mutually exclusive mode. **APP + Rule** and **APP + Global** are supported. The Proxies page has **APP groups** and **Default exit** views; changing views does not disable either layer. APP groups show only user-created groups and their filtered candidate nodes. The **Chain Proxy** button still opens the existing editor. Rules navigation is one row with two equal, independently selected click areas.

Enabled groups match in order, first match wins. A group either delegates to the original Rule chain or pins one manually selected node. A failed, missing, renamed or UDP-incompatible pinned exit does not fall back to another node, Global, subscription rules or Direct. Rule-delegated groups retain the original rule chain even when the default is Global.

Unmatched connections follow the default mode. While APP is active, the generated core configuration runs Rule mode and represents the Global default through a `GLOBAL` fallback. Disabling APP restores native mode behavior. Turning off TUN or turning on System proxy disables APP but preserves groups and the default mode; enabling TUN again does not automatically enable APP. Explicit HTTP/SOCKS ingress is excluded from APP overrides (`IN-TYPE,TUN`).

Upgrading obsolete `mode: app` settings changes the base mode to Rule, preserves groups/nodes and requires explicitly enabling the independent APP switch. The old `unmatched` option is retired in favor of the base mode.

### Applications and node filters

Use the file picker, searchable multi-select running-program list or manual names/full paths. Full paths distinguish different installations. Directory-wide matching, automatic child-process inheritance and terminated-process history are not implemented.

Node filtering uses **fancy-regex**, with lookaround and backreferences. Blank filters list all nodes; multiple lines form a union. Syntax errors or more than 100,000 backtracking attempts report errors. Filtering runs for preview, configuration generation and validation, not per packet; failed nodes never trigger automatic selection.

### Local destination exceptions

While APP is active, fixed local `DIRECT` rules precede APP overrides: loopback; `localhost`, `.local`, `.lan`; RFC1918 IPv4; IPv4 link-local; IPv6 ULA and link-local. This is not a TUN route exclusion or complete local-network detector.

There is no separate toggle. IP rules use `no-resolve`, so arbitrary domains resolving to private addresses are not guaranteed to match. These exceptions may conflict with reaching remote private networks through a proxy. Unlike APP process rules, preliminary local rules are not restricted to TUN and also affect explicit proxy requests received by the same core. See the [exact scope](APP_ROUTING.md).

## Independent Windows identity

| Item | Value |
| --- | --- |
| Installation | `C:\Program Files\Clash Verge Rev App` |
| Executable | `clash-verge-rev-app.exe` |
| App/configuration/WebView ID | `io.github.aaaynmmm.clash-verge-rev-app` |
| Configuration | `%APPDATA%\io.github.aaaynmmm.clash-verge-rev-app` |
| Service | `clash_verge_rev_app_service` |
| Service data | `%PROGRAMDATA%\cvr-app-service` |
| Cores | `cvr-app-mihomo.exe`, `cvr-app-mihomo-alpha.exe` |
| Import protocol | `clash-verge-rev-app://` |
| Mixed / SOCKS / HTTP defaults | `17897` / `17898` / `17899`, when enabled |
| Controller default | `19097`, when enabled |
| TUN interface | `CVR-App-TUN` |

Registry entries, shortcuts, startup tasks, IPC, locks and caches use fork identities. Original `clash://` and `clash-verge://` registrations are not replaced. Do not install into the upstream directory.

Independent installation does not create separate OS-wide network settings. Only one client should manage TUN/system proxy at a time. Ownership checks cannot prevent another client from changing system settings later.

## Verification and limitations

Windows installation, protected service IPC and service-managed core startup were verified. APP/default routing passed real-core parsing and isolated routing checks, but complete live-TUN end-to-end testing has not been done. An automation-sandbox launch produced WebView2 `0x80070005`; service startup worked, and the effect on normal desktop launches was not established. Launch from the desktop/Start menu and preserve logs instead of deleting configuration.

## Development and license

Follow [CONTRIBUTING.md](../CONTRIBUTING.md) and the pinned toolchain/package files. Run `pnpm install --frozen-lockfile`, `pnpm prebuild`, then `pnpm build`; `pnpm build:fast` is for testing. Rebuild all vendored service helpers after service source changes. Keep signing keys, subscriptions, configuration and logs out of release assets.

Original authorship and GPL notices are retained. Built on Clash Verge Rev, Clash Verge, Mihomo, Tauri and Vite. See [LICENSE](../LICENSE) and [service provenance](../crates/clash-verge-rev-app-service/UPSTREAM.md). Report fork-specific issues to [this repository](https://github.com/AAAYNMMM/clash-verge-rev-app/issues). Other translated legacy pages and screenshots describe upstream, not this release.
