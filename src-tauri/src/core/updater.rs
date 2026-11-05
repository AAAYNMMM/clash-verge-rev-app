use crate::{config::Config, singleton, utils::dirs};
use anyhow::{Context as _, Result};
use clash_verge_logging::{Type, logging};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::Duration,
};
use tauri_plugin_updater::{Update, UpdaterExt as _};
use tokio_util::sync::CancellationToken;

pub struct SilentUpdater {
    update_ready: AtomicBool,
    manual_cancel: Mutex<Option<CancellationToken>>,
    background_cancel: Mutex<Option<CancellationToken>>,
}

singleton!(SilentUpdater, SILENT_UPDATER);

impl SilentUpdater {
    const fn new() -> Self {
        Self {
            update_ready: AtomicBool::new(false),
            manual_cancel: Mutex::new(None),
            background_cancel: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Deserialize, specta::Type)]
struct UpdateCacheMeta {
    version: String,
    downloaded_at: String,
}

impl SilentUpdater {
    fn cache_dir() -> Result<PathBuf> {
        Ok(dirs::app_home_dir()?.join("update_cache"))
    }

    fn read_cache_bytes() -> Result<Vec<u8>> {
        let bin_path = Self::cache_dir()?.join("pending_update.bin");
        std::fs::read(&bin_path).with_context(|| format!("failed to read update cache {}", bin_path.display()))
    }

    fn read_cache_meta() -> Result<UpdateCacheMeta> {
        let meta_path = Self::cache_dir()?.join("pending_update.json");
        let content = std::fs::read_to_string(meta_path)?;
        Ok(serde_json::from_str(&content)?)
    }

    fn delete_cache() {
        if let Ok(cache_dir) = Self::cache_dir()
            && cache_dir.exists()
        {
            if let Err(e) = std::fs::remove_dir_all(&cache_dir) {
                logging!(
                    warn,
                    Type::System,
                    "Failed to delete update cache {}: {e}",
                    cache_dir.display()
                );
            } else {
                logging!(info, Type::System, "Update cache deleted");
            }
        }
    }

    /// Returns the cached installer for `update`, deleting a cache that does not match it.
    fn verified_cache(app_handle: &tauri::AppHandle, update: &Update) -> Option<Vec<u8>> {
        let meta = Self::read_cache_meta().ok()?;
        let bytes = if meta.version == update.version {
            Self::read_cache_bytes().and_then(|bytes| {
                verify_signature(app_handle, &bytes, &update.signature, &update.version)?;
                Ok(bytes)
            })
        } else {
            Err(anyhow::anyhow!("server offers v{}", update.version))
        };
        match bytes {
            Ok(bytes) => Some(bytes),
            Err(e) => {
                logging!(
                    info,
                    Type::System,
                    "Update cache v{} is unusable: {e:#}, cleaning up",
                    meta.version
                );
                Self::delete_cache();
                None
            }
        }
    }
}

/// The cache directory is user-writable and feeds an elevated installer, so it is re-verified
/// with the same rules `Update::download` applies.
fn verify_signature(app_handle: &tauri::AppHandle, bytes: &[u8], signature: &str, version: &str) -> Result<()> {
    use base64::Engine as _;

    let decode = |value: &str| -> Result<String> {
        Ok(String::from_utf8(
            base64::engine::general_purpose::STANDARD.decode(value)?,
        )?)
    };
    let config: tauri_plugin_updater::Config = serde_json::from_value(
        app_handle
            .config()
            .plugins
            .0
            .get("updater")
            .cloned()
            .context("updater is not configured")?,
    )?;

    let public_key = minisign_verify::PublicKey::decode(&decode(&config.pubkey)?)?;
    let signature = minisign_verify::Signature::decode(&decode(signature)?)?;
    public_key
        .verify(bytes, &signature, true)
        .context("signature mismatch")?;

    match signature
        .trusted_comment()
        .split('\t')
        .find_map(|field| field.strip_prefix("version:"))
    {
        Some(signed) => anyhow::ensure!(
            signed.trim_start_matches('v') == version,
            "signed for v{signed}, not v{version}"
        ),
        None => anyhow::ensure!(!config.require_signed_version, "signature carries no version"),
    }
    Ok(())
}

pub fn is_build_to_stable(current: &str, remote: &str) -> bool {
    let Some((base, build)) = current.trim_start_matches('v').split_once('+') else {
        return false;
    };
    !build.is_empty()
        && !build.bytes().all(|byte| byte.is_ascii_digit())
        && !base.contains('-')
        && base == remote.trim_start_matches('v')
}

pub fn numeric_revision_update(current: &str, remote: &str) -> Option<bool> {
    let parse = |version: &str| {
        let version = version.trim_start_matches('v');
        let (base, build) = version.split_once('+').unwrap_or((version, "0"));
        if base.contains('-') {
            return None;
        }
        Some((base.to_owned(), build.parse::<u64>().ok()?))
    };
    let (current_base, current_revision) = parse(current)?;
    let (remote_base, remote_revision) = parse(remote)?;
    (current_base == remote_base).then_some(remote_revision > current_revision)
}

/// Numeric build metadata is the fourth release component; other suffixes retain legacy ordering.
#[cfg(test)]
fn version_lte(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        let v = v.trim_start_matches('v');
        let (base, build) = v.split_once('+').unwrap_or((v, "0"));
        let mut parts: Vec<u64> = base
            .split('-')
            .next()
            .unwrap_or("0")
            .split('.')
            .filter_map(|part| part.parse::<u64>().ok())
            .collect();
        if !base.contains('-') {
            parts.push(build.parse::<u64>().unwrap_or(0));
        }
        parts
    };

    let a_parts = parse(a);
    let b_parts = parse(b);
    let len = a_parts.len().max(b_parts.len());

    for i in 0..len {
        let av = a_parts.get(i).copied().unwrap_or(0);
        let bv = b_parts.get(i).copied().unwrap_or(0);
        if av < bv {
            return true;
        }
        if av > bv {
            return false;
        }
    }
    true // equal
}

#[cfg(test)]
mod version_tests {
    use super::*;

    #[test]
    fn numeric_revisions_are_not_autobuilds_and_cached_updates_cannot_downgrade() {
        assert!(!is_build_to_stable("2.5.8+1", "2.5.8"));
        assert!(is_build_to_stable("2.5.8+20261025.abc", "2.5.8"));
        assert!(version_lte("2.5.8", "2.5.8+1"));
        assert!(version_lte("2.5.8+1", "2.5.8+1"));
        assert!(!version_lte("2.5.8+2", "2.5.8+1"));
        assert!(!version_lte("2.5.9", "2.5.8+1"));
        assert_eq!(numeric_revision_update("2.5.8+1", "2.5.8"), Some(false));
        assert_eq!(numeric_revision_update("2.5.8+1", "2.5.8+2"), Some(true));
        assert_eq!(numeric_revision_update("2.5.8", "2.5.8+1"), Some(true));
        assert_eq!(numeric_revision_update("2.5.8+1", "2.5.9"), None);
        assert_eq!(numeric_revision_update("2.5.8+20261025.abc", "2.5.8"), None);
    }
}

/// Maps UI language to one of the three NSIS translations, defaulting to English.
#[cfg(target_os = "windows")]
fn nsis_language_id(app_language: &str) -> &'static str {
    match app_language {
        "zh" | "zhtw" => "2052", // SimpChinese
        "ru" => "1049",          // Russian
        _ => "1033",             // English
    }
}

/// Same wire shape as the updater plugin's JS `DownloadEvent`.
#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

const MIRRORS: [&str; 2] = ["https://update.hwdns.net/", "https://gh-proxy.org/"];
/// A source delivering less than this per window is dropped for the next one.
const MIN_PROGRESS: u64 = 1024 * 1024;
const PROGRESS_WINDOW: Duration = Duration::from_secs(30);

/// The manifest's URL, then the other mirror, then GitHub itself.
fn download_sources(url: &tauri::Url) -> Vec<tauri::Url> {
    let origin = MIRRORS
        .iter()
        .find_map(|mirror| url.as_str().strip_prefix(mirror))
        .unwrap_or(url.as_str());
    let mut sources = vec![url.clone()];
    if origin.starts_with("https://github.com/") {
        let candidates = MIRRORS.iter().map(|mirror| format!("{mirror}{origin}"));
        for candidate in candidates.chain([origin.to_owned()]) {
            if let Ok(candidate) = tauri::Url::parse(&candidate)
                && !sources.contains(&candidate)
            {
                sources.push(candidate);
            }
        }
    }
    sources
}

/// Tries every source with a throughput floor, then again stopping only on a stall, so a link
/// that is slow everywhere still finishes.
async fn download(update: &Update, on_event: impl Fn(DownloadEvent) + Sync) -> Result<Vec<u8>> {
    let sources = download_sources(&update.download_url);
    let mut last_error = None;
    for floor in [MIN_PROGRESS, 1] {
        for url in &sources {
            logging!(info, Type::System, "Downloading update v{} from {url}", update.version);
            match download_from(update, url, floor, &on_event).await {
                Ok(bytes) => {
                    on_event(DownloadEvent::Finished);
                    return Ok(bytes);
                }
                Err(e) => {
                    logging!(warn, Type::System, "Update download from {url} failed: {e:#}");
                    last_error = Some(e);
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("no update download source")))
}

async fn download_from(
    update: &Update,
    url: &tauri::Url,
    floor: u64,
    on_event: &(impl Fn(DownloadEvent) + Sync),
) -> Result<Vec<u8>> {
    let mut source = update.clone();
    source.download_url = url.clone();
    let received = AtomicU64::new(0);
    let mut started = false;
    let fetch = source.download(
        |chunk_length, content_length| {
            if !std::mem::replace(&mut started, true) {
                on_event(DownloadEvent::Started { content_length });
            }
            received.fetch_add(chunk_length as u64, Ordering::Relaxed);
            on_event(DownloadEvent::Progress { chunk_length });
        },
        || {},
    );
    tokio::pin!(fetch);
    let mut seen = 0;
    loop {
        tokio::select! {
            result = &mut fetch => return Ok(result?),
            () = tokio::time::sleep(PROGRESS_WINDOW) => {
                let total = received.load(Ordering::Relaxed);
                anyhow::ensure!(total - seen >= floor, "only {} bytes in {PROGRESS_WINDOW:?}", total - seen);
                seen = total;
            }
        }
    }
}

impl SilentUpdater {
    /// Checks the server; Windows receives `/LANG` to suppress the NSIS language dialog,
    /// see `packages/windows/installer.nsi`.
    async fn check(app_handle: &tauri::AppHandle) -> Result<Option<Update>> {
        let updater_builder = app_handle.updater_builder();
        #[cfg(target_os = "windows")]
        let updater_builder = {
            let verge_lang = Config::verge().await.latest_arc().language.clone();
            let lang_id = nsis_language_id(&clash_verge_i18n::current_language(verge_lang.as_deref()));
            updater_builder.installer_arg(format!("/LANG={lang_id}"))
        };
        Ok(updater_builder.build()?.check().await?)
    }

    async fn install(update: Update, bytes: Vec<u8>) -> Result<()> {
        Ok(tokio::task::spawn_blocking(move || update.install(&bytes)).await??)
    }

    /// Installs `version` for the update dialog, reusing the cache when it holds that version;
    /// `false` when cancelled before the installer starts.
    pub async fn install_update(
        &self,
        app_handle: &tauri::AppHandle,
        version: &str,
        on_event: impl Fn(DownloadEvent) + Sync,
    ) -> Result<bool> {
        let cancel = CancellationToken::new();
        *self.manual_cancel.lock() = Some(cancel.clone());
        let prepared = tokio::select! {
            prepared = Self::prepare_install(app_handle, version, on_event) => Some(prepared),
            () = cancel.cancelled() => None,
        };
        // `cancel_download` cancels under the lock, so once the token is taken back its state is
        // final; a cancel during the last synchronous poll of `prepare_install` still wins.
        self.manual_cancel.lock().take();
        let Some((update, bytes)) = prepared.filter(|_| !cancel.is_cancelled()).transpose()? else {
            logging!(info, Type::System, "Update v{version} cancelled");
            return Ok(false);
        };

        logging!(info, Type::System, "Installing update v{version}...");
        Self::install(update, bytes).await?;
        Self::delete_cache();
        Ok(true)
    }

    async fn prepare_install(
        app_handle: &tauri::AppHandle,
        version: &str,
        on_event: impl Fn(DownloadEvent) + Sync,
    ) -> Result<(Update, Vec<u8>)> {
        let update = Self::check(app_handle)
            .await?
            .filter(|update| update.version == version)
            .with_context(|| format!("v{version} is no longer offered"))?;
        let bytes = match Self::verified_cache(app_handle, &update) {
            Some(bytes) => bytes,
            None => download(&update, on_event).await?,
        };
        Ok((update, bytes))
    }

    pub fn cancel_download(&self) {
        let mut slot = self.manual_cancel.lock();
        if let Some(cancel) = slot.take() {
            cancel.cancel();
        }
    }

    /// Drops the downloaded update and aborts a background download in flight.
    pub fn discard_pending(&self) {
        let cancel = self.background_cancel.lock().take();
        if let Some(cancel) = cancel {
            cancel.cancel();
        }
        self.update_ready.store(false, Ordering::Release);
        Self::delete_cache();
    }
}
