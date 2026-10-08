use super::{CmdResult, WithErrorCode as _};
use crate::config::app_routing::compile_patterns;

#[tauri::command]
pub fn match_app_nodes(patterns: Vec<String>, names: Vec<String>) -> CmdResult<Vec<String>> {
    let filters = compile_patterns(&patterns).with_error_code("APP_NODE_FILTER_INVALID")?;
    Ok(names
        .into_iter()
        .filter(|name| filters.iter().any(|filter| filter.is_match(name)))
        .collect())
}

#[tauri::command]
pub async fn get_running_apps() -> CmdResult<Vec<tauri_plugin_clash_verge_sysinfo::processes::RunningApp>> {
    tokio::task::spawn_blocking(tauri_plugin_clash_verge_sysinfo::processes::list_running_apps)
        .await
        .with_error_code("APP_PROCESS_LIST_FAILED")
}

#[tauri::command]
pub async fn select_app_group_node(
    group_id: String,
    node_record_id: String,
) -> CmdResult<crate::config::app_routing::AppRoutingConfig> {
    use crate::{config::app_routing::AppTarget, core::proxy_view::ProxyNodeSource};
    let view = super::get_proxy_view().await?;
    let node = view.records.get(&node_record_id).ok_or_else(|| {
        super::CommandFailure::coded("APP_NODE_UNAVAILABLE", "Node is no longer available; refresh the list")
    })?;
    if matches!(
        node.proxy_type.as_str().to_ascii_lowercase().as_str(),
        "direct" | "reject" | "rejectdrop" | "reject-drop" | "pass" | "pass-rule" | "compatible" | "dns" | "rematch"
    ) {
        return Err(super::CommandFailure::coded("APP_NODE_INVALID", "Choose a proxy node"));
    }
    let target = match &node.source {
        ProxyNodeSource::Core { proxy_name } => AppTarget::Node {
            name: proxy_name.clone(),
            provider: None,
        },
        ProxyNodeSource::Provider {
            provider_name,
            proxy_name,
        } => AppTarget::Node {
            name: proxy_name.clone(),
            provider: Some(provider_name.clone()),
        },
    };
    crate::feat::select_app_group_node(&group_id, target)
        .await
        .with_error_code("APP_NODE_SELECTION_FAILED")
}
