# CONTRIBUTING

Thank you for your interest in contributing to **Clash Verge Rev App**! This guide provides instructions to help you set up your development environment and start contributing effectively.

This fork is maintained at [AAAYNMMM/clash-verge-rev-app](https://github.com/AAAYNMMM/clash-verge-rev-app), on `dev`. The current app version is **2.5.13**. Read the [current guide](docs/README_en.md) and [release notes](docs/releases/v2.5.13.md); historical upstream downloads are not this fork.

## Internationalization (i18n)

We welcome translations and improvements to existing locales. For details on contributing translations, please see [CONTRIBUTING_i18n.md](docs/CONTRIBUTING_i18n.md).

## Contribution Expectations

We welcome AI-assisted contributions — AI assistance itself is not a problem. What we require is **ownership**: every pull request must show that the stated problem is understood and that the change deliberately solves it. Incoming pull requests from contributors without write access are screened by an automated review ([`pr-ai-slop-review`](.github/workflows/pr-ai-slop-review.md)) that evaluates this ownership evidence and may label high-risk submissions `ai-slop:med` or `ai-slop:high`. The policy is maintained in that file and compiled into `pr-ai-slop-review.lock.yml` (`gh aw compile`); never edit the lock file by hand. If you want to adjust the review policy, the easiest path is directing an AI coding agent to make the change — the workflow is documented in [AGENTS.md](AGENTS.md).

To make sure your contribution is assessed fairly:

- **Link a pre-existing issue.** Non-trivial changes should fix or implement something already reported in an issue. An issue created after the pull request is a much weaker signal than a genuine problem report.
- **Keep the diff mapped to the issue.** Every changed area should be explainable from the linked issue. Unrelated refactors, formatting churn, or dependency bumps belong in separate pull requests with their own motivation.
- **Describe the problem in your own words.** A short statement of what breaks or what is needed, and why this approach fixes it, is worth more than a long generated report.
- **Validate against the reported behavior.** Show how the reported problem was reproduced and confirmed fixed. Generic checklists and raw tool output are not verification.
- **Do not pad with tests or defensive code.** New tests are not expected by default. Add them only when the linked issue calls for them, keep them minimal, and explain in the pull request why each is necessary; speculative error handling and coverage of hypothetical failure modes inflate the diff without adding value.
- **Disclose AI automation.** If an AI agent produced or co-produced the change, end the pull request body with the model and effort level (for example, `Assisted by: GPT-5.6 High`; effort is optional when your tool does not report it). The PR template intentionally omits this footer; agents add it themselves. Disclosure is transparency only — it does not affect how the change is assessed.

If your pull request receives an `ai-slop` label, the fastest way to clear it is substantive: link (or ask us to create) the underlying issue, narrow the scope, or push implementation changes that respond to review feedback. Editing the pull request description alone does not change the assessment.

## Development Setup

Before contributing, you need to set up your development environment. Follow the steps below carefully.

### Prerequisites

1. **Install Rust and Node.js**  
   Use the Rust toolchain pinned in `rust-toolchain.toml`, pnpm pinned in `package.json`, and a compatible Node.js installation. The project requires both Rust and Node.js. Follow the official installation instructions [here](https://tauri.app/start/prerequisites/).

### Windows Users

> [!NOTE]  
> **Windows ARM users must also install [LLVM](https://github.com/llvm/llvm-project/releases) (including clang) and set the corresponding environment variables.**  
> The `ring` crate depends on `clang` when building on Windows ARM.

Additional steps for Windows:

- Ensure Rust and Node.js are added to your system `PATH`.

- Install the GNU `patch` tool.

- Use the MSVC toolchain for Rust:

```bash
rustup target add x86_64-pc-windows-msvc
rustup set default-host x86_64-pc-windows-msvc
```

### Install Node.js Package Manager

Enable `corepack`:

```bash
corepack enable
```

### Install Project Dependencies

Node.js dependencies:

```bash
pnpm install --frozen-lockfile
```

Ubuntu-only system packages:

```bash
sudo apt-get install -y libxslt1.1 libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

### Prepare cores and rebuild the fork service

```bash
pnpm run prebuild
pnpm run prebuild --force  # Refresh resources and rebuild the vendored service
```

`prebuild` compiles the fork service and its installer/uninstaller from vendored source. Rerun it after service changes; do not mix cached helpers with a new GUI, or substitute renamed upstream service binaries.

### Run the Development Server

```bash
pnpm dev           # Standard
pnpm dev:diff      # If an app instance already exists
pnpm dev:tauri     # Run Tauri development mode
```

### Build the Project

Standard build:

```bash
pnpm build
```

Fast build for testing:

```bash
pnpm build:fast
```

### Release packaging

The published 2.5.13 installer is a Windows x64 `fast-release` test build, not a fully optimized production build. The current package scripts do not provide a portable package.

Signing requires the matching fork private key through the Tauri signing environment variables or configured CI secrets. Never commit or upload the private key. A clean clone contains only the public key. Updater signatures are not Windows Authenticode signatures.

For documentation-only publication, preserve version fields and verified installer bytes, record the binary's source commit, and upload only the installer, public signature and checksum. Do not publish subscriptions, configuration, logs or workspace archives. Uploading an installer does not create updater metadata. Test prereleases must not be silently advertised through the stable channel.

The inherited tag-triggered build workflow checks main-branch ancestry. Publishing an existing verified dev-branch test installer is separate from the multi-platform build workflow and does not mean other platform artifacts were built.

## Contributing Your Changes

### Before Committing

**Code quality checks:**

```bash
# Rust backend
cargo clippy-all
# Frontend
pnpm lint
```

**Code formatting:**

```bash
# Rust backend
cargo fmt
# Frontend
pnpm format
```

### Signing your commit

Signed commits are required to verify authorship and ensure your contributions can be merged. Reference signing-commits [here](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits).

### Submitting Your Changes

1. Fork the repository.

2. Create a new branch for your feature or bug fix.

3. Commit your changes with clear messages and make sure it's signed.

4. Push your branch and submit a pull request.

We appreciate your contributions and look forward to your participation!
