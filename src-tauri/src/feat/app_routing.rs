use crate::config::{
    Config, IVerge,
    app_routing::{AppRoutingConfig, AppTarget},
};
use anyhow::{Result, ensure};

pub async fn select_app_group_node(group_id: &str, target: AppTarget) -> Result<AppRoutingConfig> {
    let config_write = Config::try_lock_config_write()?;
    let verge = Config::verge().await.latest_arc();
    ensure!(
        verge.app_routing_active(),
        "Enable TUN and APP routing, and disable system proxy, before selecting a group node"
    );
    // Merge one choice into current config; another group's selection or edits must not be overwritten.
    let routing = verge
        .app_routing
        .clone()
        .unwrap_or_default()
        .with_selected_node(group_id, target)?;
    let patch = IVerge {
        app_routing: Some(routing.clone()),
        ..Default::default()
    };
    super::apply_verge_patch_locked(&config_write, &patch, false).await?;
    if verge.auto_close_connection.unwrap_or(false) {
        super::clash::after_change_clash_mode();
    }
    Ok(routing)
}
