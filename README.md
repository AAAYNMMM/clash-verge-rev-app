# Clash Verge Rev App

<img src="src-tauri/icons/icon.png" alt="Clash Verge Rev App" width="128">

An independent fork of [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev), with application-based routing, separate installation and a matching fork-specific service namespace. This is **not an official upstream release**.

## APP routing

Select **APP** on the home page or proxy page. Open **APP Rules** in the sidebar to create ordered groups, add process names or executable paths, and filter node names with regular expressions.

A group can delegate to the existing **Rule mode**, use **Direct**, or pin one manually selected node. Rule delegation follows the original rule chain and its current proxy-group selections. A pinned node never fails over to another node or direct when it goes offline or disappears. Unmatched applications default to direct; the fallback is configurable. TUN is needed to capture applications that do not use the system proxy.

## Independent identity

| Item | Clash Verge Rev App |
| --- | --- |
| Windows installation | `C:\Program Files\Clash Verge Rev App` |
| Executable | `clash-verge-rev-app.exe` |
| App/WebView/configuration identifier | `io.github.aaaynmmm.clash-verge-rev-app` |
| Windows configuration | `%APPDATA%\io.github.aaaynmmm.clash-verge-rev-app` |
| Windows service | `clash_verge_rev_app_service` |
| Service executable/data namespace | `cvr-app-service` |
| Core executables | `cvr-app-mihomo`, `cvr-app-mihomo-alpha` |
| Import protocol | `clash-verge-rev-app://` |
| Mixed / SOCKS / HTTP defaults | `17897` / `17898` / `17899` |
| Controller / redir / TProxy defaults | `19097` / `17895` / `17896` |
| Windows/Linux TUN device default | `CVR-App-TUN` |
| macOS TUN device default | `utun178` |

The installer, registry entries, shortcuts, scheduled tasks, service IPC, execution locks, backups and updater cache belong to this fork. The original `clash://` and `clash-verge://` registrations are not taken over. Linux packages do not replace or conflict with the upstream package. Development uses a separate `.dev` application identifier and `cvr-app-service-dev` service channel.

Upstream settings are **not automatically migrated**. Import subscriptions explicitly in this fork. Do not install this fork into the original app directory; the Windows installer rejects directories containing the original executable.

### Shared network settings

Independent installation does not create a second set of OS-wide network settings. Enable system proxy or TUN in **only one client at a time**, and do not enable competing proxy guards. Both clients may remain installed and use separate explicit listener ports. The app checks system-proxy ownership before applying or clearing it, so starting with system proxy disabled or exiting must not clear another client's active proxy. These checks are not an atomic cross-client lock, and cannot prevent an unmodified upstream client from changing global network settings later.

## Build

Install the repository's Rust toolchain, Node and pnpm, plus the platform's Tauri build prerequisites.

```sh
pnpm install --frozen-lockfile
pnpm prebuild
pnpm web:build
pnpm build
```

`prebuild` builds the service and its install/uninstall tools from `crates/clash-verge-rev-app-service`. Do not replace them with upstream service executables, even after renaming: the compiled IPC/service/lock identities must agree with the GUI.

For development, `pnpm dev` preserves the development service's installed state, `pnpm dev:service` explicitly installs/updates this fork's development service, and `pnpm dev:sidecar` uses an unprivileged sidecar. None of these selects the upstream service.

## Updates and signing

[This repository's releases](https://github.com/AAAYNMMM/clash-verge-rev-app/releases) are the only configured application-update source. Automatic checks default to off. No updater metadata or installer is implied to exist until a release is published.

The embedded updater public key is unique to this fork. Release builds require the matching `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` environment variables / repository secrets. Never commit signing keys. The initially generated key is retained locally in `.git/fork-signing/updater.key`; back it up securely before deleting or replacing the workspace. A new clone does not contain that private key. Standard and fixed-WebView2 installers use the same fork public key. Existing upstream signatures are not accepted.

Upstream Winget submissions, Telegram publishing and the inherited scheduled autobuild have been removed. Builds remain available through manual workflow dispatch and release tags. Report fork-specific issues [here](https://github.com/AAAYNMMM/clash-verge-rev-app/issues), not to upstream maintainers.

## Attribution and license

Original authorship and GPL notices are retained. This project builds on [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev), [Clash Verge](https://github.com/zzzgydi/clash-verge), [Mihomo](https://github.com/MetaCubeX/mihomo), [Tauri](https://github.com/tauri-apps/tauri) and [Vite](https://github.com/vitejs/vite). The fork adds a distinct routing-based A icon and wordmark rather than using upstream's cat logo.

See [LICENSE](LICENSE) and [service provenance](crates/clash-verge-rev-app-service/UPSTREAM.md). Historical translated documentation and screenshots describe upstream and may not reflect this fork's identity or APP routing.
