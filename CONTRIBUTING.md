# Engineering Contributions

Clash Verge Rev App is an independently packaged Mihomo client. Development targets the `dev` branch of [this fork](https://github.com/AAAYNMMM/clash-verge-rev-app); upstream services, IPC identities, installers and configuration paths must remain isolated.

## Architecture boundaries

| Area | Owner |
| --- | --- |
| APP group persistence / validation | `src-tauri/src/config/app_routing.rs` |
| TUN APP rule compilation | `src-tauri/src/enhance/app_routing.rs` |
| Config transactions and restart effects | `src-tauri/src/feat/` |
| Desktop process/UI state | `src/components/`, `src/pages/`, `src/services/` |
| Privileged service, IPC protocol | `crates/clash-verge-rev-app-service/` |
| Package assembly | `scripts/prebuild.mjs`, `src-tauri/packages/windows/` |

Routing changes must preserve first-match group priority, original root Rule semantics, source-bound manual node selection, fail-closed behavior and the `IN-TYPE,TUN` boundary. Keep inbound capture and process-specific routing responsibilities separate.

## Build

Use the pinned Rust toolchain, Tauri platform prerequisites, Node and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm prebuild
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Build service helpers from the vendored service source, not renamed upstream binaries. Do not include per-user `profiles.yaml`, `verge.yaml`, subscription URLs, access tokens, service owner credentials or signing private keys in Git or release assets.

Quality checks should target modified behavior, with actual Mihomo syntax and isolation checks for routing changes. Unit tests cannot establish production TUN end-to-end behavior.

## Public Windows bundles

Release builds use an isolated Cargo cache outside the developer profile and a
path-remapping Rust toolchain. Set the `CVR_PUBLIC_CARGO_HOME` environment variable
to that cache and run `node scripts/build-public-windows.mjs` (or `--fast` for
test bundles). The driver rebuilds the bundled service helpers, signs the
installer using the configured Tauri signing key, and refuses binaries containing
local user-directory metadata via `scripts/check-public-bundle.mjs`. The cache must
not contain personal project configuration or credentials.

## Change policy

Scope patches to the reported issue and avoid unrelated refactors. Keep generated wire contracts aligned across Rust backend and TypeScript UI. Service protocol changes require real IPC regression coverage. Do not weaken IPC authentication, release signatures or installation ownership checks to bypass failures.

Follow [AGENTS.md](AGENTS.md) for repository-specific commit, review and disclosure conventions. Licensed under GPL-3.0; retain attribution and vendor provenance.
