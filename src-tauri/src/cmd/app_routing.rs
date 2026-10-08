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
