use crate::config::{Config, IVerge};
use anyhow::Result;
use clash_verge_draft::SharedDraft;
use serde_yaml_ng::Mapping;
use tokio::sync::MutexGuard;

pub async fn patch_clash(patch: &Mapping) -> Result<()> {
    if let Some(mode) = patch.get("mode")
        && !matches!(mode.as_str(), Some("rule" | "global" | "direct"))
    {
        anyhow::bail!("Unsupported proxy mode");
    }
    let config_write = Config::try_lock_config_write()?;
    super::executor::apply(
        &config_write,
        super::executor::Patch::Clash(patch),
        super::effects::clash_effects(patch),
    )
    .await
}

/// Apply a patch, then reconcile TUN when its setting changes.
///
/// TUN patches do not always produce a Run State transition, so reconciliation is explicit.
pub async fn patch_verge(patch: &IVerge, not_save_file: bool) -> Result<()> {
    apply_verge_patch(patch, not_save_file).await?;
    if patch.app_routing.is_some()
        && Config::verge().await.data_arc().app_routing_active()
        && Config::verge().await.data_arc().auto_close_connection.unwrap_or(false)
    {
        super::clash::after_change_clash_mode();
    }
    if patch.enable_tun_mode.is_some() {
        super::reconcile_tun_availability().await;
    }
    Ok(())
}

/// Apply a patch without post-update reconciliation.
pub(super) async fn apply_verge_patch(patch: &IVerge, not_save_file: bool) -> Result<()> {
    let config_write = Config::try_lock_config_write()?;
    apply_verge_patch_locked(&config_write, patch, not_save_file).await
}

/// Apply a patch with the shared configuration write lock already held.
/// Callers must pass the guard returned by [`Config::lock_config_write`].
pub(super) async fn apply_verge_patch_locked(
    _config_write: &MutexGuard<'_, ()>,
    patch: &IVerge,
    not_save_file: bool,
) -> Result<()> {
    let current = Config::verge().await.latest_arc();
    let patch = normalize_app_patch(&current, patch)?;
    if let Some(routing) = &patch.app_routing {
        routing.validate()?;
    }
    super::executor::apply(
        _config_write,
        super::executor::Patch::Verge {
            patch: &patch,
            persist: !not_save_file,
        },
        verge_patch_effects(&current, &patch),
    )
    .await
}

pub async fn fetch_verge_config() -> Result<SharedDraft<IVerge>> {
    let draft = Config::verge().await;
    let data = draft.data_arc();
    Ok(data)
}

fn verge_patch_effects(current: &IVerge, patch: &IVerge) -> super::effects::Effects {
    let mut next = current.clone();
    next.patch_config(patch);
    let mut effect_patch = patch.clone();
    // Editing inactive APP choices must not reload or start the core.
    if !current.app_routing_active() && !next.app_routing_active() {
        effect_patch.app_routing = None;
    }
    super::effects::verge_effects(&effect_patch)
}

fn normalize_app_patch(current: &IVerge, patch: &IVerge) -> Result<IVerge> {
    let mut next = current.clone();
    next.patch_config(patch);
    anyhow::ensure!(
        patch.enable_app_routing != Some(true) || next.app_routing_available(),
        "APP routing requires TUN enabled and system proxy disabled."
    );
    let mut patch = patch.clone();
    if next.disable_unavailable_app_routing() {
        patch.enable_app_routing = Some(false);
    }
    Ok(patch)
}

#[cfg(test)]
mod app_overlay_tests {
    use super::*;

    #[test]
    fn inactive_app_choices_persist_without_changing_core_or_enable_state() -> Result<()> {
        use super::super::effects::Effect;
        let current = IVerge {
            enable_tun_mode: Some(true),
            enable_system_proxy: Some(false),
            enable_app_routing: Some(false),
            ..Default::default()
        };
        let patch = normalize_app_patch(
            &current,
            &IVerge {
                app_routing: Some(Default::default()),
                ..Default::default()
            },
        )?;
        assert!(patch.enable_app_routing.is_none());
        assert!(verge_patch_effects(&current, &patch).is_empty());
        let enabling = IVerge {
            enable_app_routing: Some(true),
            ..patch.clone()
        };
        assert!(verge_patch_effects(&current, &enabling).contains(&Effect::ClashConfig));
        let active = IVerge {
            enable_app_routing: Some(true),
            ..current.clone()
        };
        assert!(verge_patch_effects(&active, &patch).contains(&Effect::ClashConfig));
        let mixed = IVerge {
            enable_tun_mode: Some(false),
            ..patch
        };
        assert!(verge_patch_effects(&current, &mixed).contains(&Effect::ClashConfig));
        Ok(())
    }

    #[test]
    fn app_enable_requires_tun_and_no_system_proxy() {
        for tun in [false, true] {
            for sys in [false, true] {
                let current = IVerge {
                    enable_tun_mode: Some(tun),
                    enable_system_proxy: Some(sys),
                    ..Default::default()
                };
                let patch = IVerge {
                    enable_app_routing: Some(true),
                    ..Default::default()
                };
                assert_eq!(normalize_app_patch(&current, &patch).is_ok(), tun && !sys);
            }
        }
    }

    #[test]
    fn transport_changes_disable_only_the_overlay_and_preserve_groups() -> Result<()> {
        let current = IVerge {
            enable_tun_mode: Some(true),
            enable_system_proxy: Some(false),
            enable_app_routing: Some(true),
            app_routing: Some(Default::default()),
            ..Default::default()
        };
        for requested in [
            IVerge {
                enable_tun_mode: Some(false),
                ..Default::default()
            },
            IVerge {
                enable_system_proxy: Some(true),
                ..Default::default()
            },
        ] {
            let patch = normalize_app_patch(&current, &requested)?;
            assert_eq!(patch.enable_app_routing, Some(false));
            assert!(patch.app_routing.is_none());
            assert!(super::super::effects::verge_effects(&patch).contains(&super::super::effects::Effect::ClashConfig));
        }
        let disabled = IVerge {
            enable_app_routing: Some(false),
            ..current.clone()
        };
        let patch = normalize_app_patch(
            &disabled,
            &IVerge {
                enable_system_proxy: Some(false),
                ..Default::default()
            },
        )?;
        assert!(patch.enable_app_routing.is_none());
        Ok(())
    }
}
