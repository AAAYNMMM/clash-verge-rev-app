use super::{CmdResult, WithErrorCode as _};
use crate::config::app_routing::{compile_patterns, matches_node};

#[tauri::command]
pub async fn match_app_nodes(patterns: Vec<String>, names: Vec<String>) -> CmdResult<Vec<String>> {
    tokio::task::spawn_blocking(move || {
        let filters = compile_patterns(&patterns).with_error_code("APP_NODE_FILTER_INVALID")?;
        let mut matched = Vec::new();
        for name in names {
            if matches_node(&filters, &name).with_error_code("APP_NODE_FILTER_FAILED")? {
                matched.push(name);
            }
        }
        Ok(matched)
    })
    .await
    .with_error_code("APP_NODE_FILTER_FAILED")?
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
    target: crate::config::app_routing::AppTarget,
) -> CmdResult<crate::config::app_routing::AppRoutingConfig> {
    crate::feat::select_app_group_node(&group_id, target)
        .await
        .with_error_code("APP_NODE_SELECTION_FAILED")
}

#[tauri::command]
pub async fn select_app_rule_node(
    group_name: String,
    member: String,
) -> CmdResult<crate::config::app_routing::AppRoutingConfig> {
    crate::feat::select_app_rule_node(&group_name, &member)
        .await
        .with_error_code("APP_NODE_SELECTION_FAILED")
}

#[cfg(test)]
mod tests {
    use super::match_app_nodes;

    #[tokio::test]
    async fn preview_uses_fancy_syntax_and_preserves_name_order() -> super::CmdResult {
        let result = match_app_nodes(
            vec![r"^(?=.*家宽)(?!.*流量).*$".into()],
            vec!["日本 家宽 02".into(), "家宽 剩余流量".into(), "美国 家宽 01".into()],
        )
        .await?;
        assert_eq!(result, vec!["日本 家宽 02", "美国 家宽 01"]);
        Ok(())
    }

    #[tokio::test]
    async fn preview_returns_errors_instead_of_partial_results() {
        let invalid = match_app_nodes(vec!["[".into()], vec![]).await;
        assert!(matches!(invalid, Err(error) if error.code.as_deref() == Some("APP_NODE_FILTER_INVALID")));
        let excessive = match_app_nodes(
            vec!["^home-".into(), r"^(a|aa)+(?=b)$".into()],
            vec!["home-1".into(), "a".repeat(64)],
        )
        .await;
        assert!(matches!(excessive, Err(error) if error.code.as_deref() == Some("APP_NODE_FILTER_FAILED")));
    }
}
