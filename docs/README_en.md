# Clash Verge Rev App

Independent fork of [Clash Verge Rev](https://github.com/clash-verge-rev/clash-verge-rev), extending [Mihomo](https://github.com/MetaCubeX/mihomo) with **TUN-scoped, process-based outbound overrides**. Selected applications use manually pinned exits; all other traffic retains the configured Rule, Global, or Direct behavior. Not affiliated with the upstream release project.

**Published artifact: `v2.5.13` · Windows x64 test prerelease.**
[Release](https://github.com/AAAYNMMM/clash-verge-rev-app/releases/tag/v2.5.13) · [Routing contract](APP_ROUTING.md) · [中文](../README.md) · [License](../LICENSE)

## Routing architecture

APP routing is an independent overlay, not an additional mutually exclusive Mihomo mode. It becomes effective only when TUN is enabled and system proxy is disabled. Changing either transport condition disables the overlay without discarding group selections or the underlying outbound mode.

~~~text
           Mihomo routing engine
                   │
          Local destination rules
                   │
           TUN ingress condition
           ┌───────┴────────┐
           │                │
      APP matches      Non-APP ingress
           │                │
     Fixed exit / Rule      │
          └───────────┬─────┘
                      │
            Rule / Global / Direct
~~~

- **Match precedence**: local destination exceptions, then ordered APP groups, then the default exit. The first enabled group matching an executable wins.
- **Executable identity**: exact, escaped matching by process name or full executable path; rendered as Mihomo `PROCESS-NAME-REGEX` / `PROCESS-PATH-REGEX` rules.
- **Pinned exits**: a group retains one manually selected node and provider identity. Missing, unusable, or unsupported exits fail closed; there is no implicit failover or fallback to Global, subscription rules, or Direct.
- **Rule delegation**: a group can re-enter the original subscription rule chain without inheriting Global fallback from unrelated connections.
- **Default exit**: unmatched connections continue to Rule, Global, or Direct, rather than becoming implicitly direct.

When the overlay is active, the generated Mihomo config uses `mode: rule`. A configured Global default is modeled by an explicit `GLOBAL` selector for traffic not captured by an APP override. When the overlay is inactive, the core uses the native selected mode. The compiler is implemented in `src-tauri/src/enhance/app_routing.rs`.

## Components

| Boundary | Responsibility |
| --- | --- |
| React / Tauri | Configuration, running-process picker, per-group node selection and state presentation |
| Verge configuration | Persisted APP activation state, groups, and native fallback mode |
| Config compiler | Composes ordered process predicates, locked selectors, and root rules |
| Mihomo | TUN capture, process metadata, rule evaluation and outbound transport |
| Independent privileged service | Runtime provisioning, IPC authorization, core lifecycle and service ownership |

Candidate selection uses Rust `fancy-regex`, supporting lookaround and backreferences with a 100,000-backtracking limit. These expressions filter node names **only while editing or validating the configuration**; they are not evaluated per connection or per packet.

### Constraints

- Only `IN-TYPE,TUN` traffic is subject to APP overrides; explicit HTTP/SOCKS proxy ingress bypasses them.
- Matching is by executable, not browser tab, URL, parent-process lineage, or installation directory.
- The running-process picker is a snapshot, not a persistent process attribution engine.
- Preceding local destination rules may override custom private-address routes in a subscription; see the [routing contract](APP_ROUTING.md).
- Tests cover Mihomo parsing and isolated traffic cases, not a comprehensive production TUN end-to-end validation.

## Distribution and isolation

| Identity | Value |
| --- | --- |
| Windows application | `C:\Program Files\Clash Verge Rev App\clash-verge-rev-app.exe` |
| Configuration root | `%APPDATA%\io.github.aaaynmmm.clash-verge-rev-app` |
| Application ID | `io.github.aaaynmmm.clash-verge-rev-app` |
| Windows service | `clash_verge_rev_app_service` |
| Service / core binaries | `cvr-app-service` / `cvr-app-mihomo` |
| URL scheme | `clash-verge-rev-app://` |
| Mixed / SOCKS / HTTP listeners | `17897` / `17898` / `17899` |
| Controller | `19097` |

The registry, service, IPC channel, instance lock, configuration, updater, and shortcuts are namespaced independently from upstream. Independent installations **do not** isolate OS-wide proxy and routing state; concurrent network ownership by two clients remains unsupported.

The published test release contains one Windows x64 NSIS installer, its SHA-256 checksum and its application updater signature. `.sig` is not an Authenticode signature. Helper executables must be built from `crates/clash-verge-rev-app-service` and cannot be replaced by renamed upstream service binaries.

Source attribution and GPL obligations remain intact; see [LICENSE](../LICENSE) and [service provenance](../crates/clash-verge-rev-app-service/UPSTREAM.md).
