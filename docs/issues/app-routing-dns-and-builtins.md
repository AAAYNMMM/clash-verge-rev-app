# APP routing: internal DNS isolation and built-in exits

Local maintainer request, approved in the development conversation on 2026-10-24. This is a local development issue; no upstream issue or pull request has been published.

Baseline: `16a6a0f556ad050e596e89a79f80d1870edf0b23` (`dev`, application version 2.5.8).

## Reported regression

With TUN enabled, the default exit set to Global and Chrome using an APP Rule group, YouTube uses the APP-selected Singapore node but DIRECT destinations such as Baidu and Bilibili fail.

Read-only production diagnostics found DNS upstream traffic with inbound type `Inner` and no process identity hitting the non-APP GLOBAL catch-all. Both core DNS queries timed out. Independently binding diagnostic sockets to the physical interface resolved both domains through domestic DNS servers and established HTTPS successfully. Production configuration was not changed.

## Required behavior

- Internal DNS traffic honoring routing rules must not be captured by the APP overlay's non-APP Global/Direct catch-all. Preserve the subscription's original internal routing policy and explicit DNS upstream routing choices; do not hardcode domestic resolvers or disable rule-respecting DNS globally.
- APP Rule groups and the selected default mode remain independent. Do not assign internal DNS to a browser identity or its private APP selectors.
- The APP group editor's exit selection offers Rule, fixed node, Direct and Reject. Direct and Reject require no node or node filter and must save, reload and display correctly.
- Direct and Reject APP rules are terminal, TUN-only and respect existing first-match priority and local-destination exceptions. They do not enter the subscription rule chain or use a proxy node.
- Preserve existing fixed-node hot switching, source identity, fail-closed semantics and inactive editing.

## Verification scope

Add focused regression tests for the reported DNS boundary and the new built-in exits. Validate generated configurations with the installed Mihomo binary in an isolated temporary runtime with TUN disabled, different listener ports and independent data files; never reload or reconfigure the running production core. Compare broken and repaired DNS behavior where the host network permits it. Run frontend tests, type checks, lint and applicable Rust checks/builds. Distinguish isolated-core validation from production TUN/GUI acceptance.

Do not modify the installed application, live proxy configuration, production service or OS network settings. The maintainer explicitly requested the public label `v2.5.8.1`; use valid internal SemVer and verify Windows mapping and update downgrade protection. This overrides the earlier no-version-increment wording. Keep baseline and artifact hashes; publication requires completed maintainer manual testing and explicit authorization. Do not change updater metadata or rebuild the accepted installer as part of a manual asset upload.
