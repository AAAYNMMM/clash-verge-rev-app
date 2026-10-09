use crate::{
    config::{
        Config,
        app_routing::{AppRoutingConfig, AppTarget},
    },
    core::{
        CoreManager,
        handle::Handle,
        notify::{Refresh, announce},
    },
    enhance::app_routing::{GROUP_PREFIX, app_node_group_name, app_rule_group_name, is_proxy_node_type},
    process::AsyncHandler,
};
use anyhow::{Context as _, Result, bail, ensure};
use clash_verge_draft::DraftTransaction;
use serde_yaml_ng::Value;
use tauri_plugin_mihomo::models::{Connection, Proxy};

async fn validate_fixed_target(target: &AppTarget) -> Result<()> {
    let AppTarget::Node { name, provider } = target else {
        bail!("Choose a proxy node")
    };
    if let Some(provider) = provider {
        let found = Handle::mihomo().get_proxy_provider_by_name(provider).await?;
        ensure!(
            found
                .proxies
                .iter()
                .any(|node| node.name == *name && is_proxy_node_type(node.proxy_type.as_str())),
            "APP node is no longer available from this provider"
        );
    } else {
        let runtime = Config::runtime().await.data_arc();
        let found = runtime
            .config
            .as_ref()
            .and_then(|c| c.get("proxies"))
            .and_then(Value::as_sequence)
            .is_some_and(|nodes| {
                nodes.iter().any(|node| {
                    node.get("name").and_then(Value::as_str) == Some(name.as_str())
                        && node.get("type").and_then(Value::as_str).is_some_and(is_proxy_node_type)
                })
            });
        ensure!(found, "APP node is no longer available from this source");
    }
    Ok(())
}

fn validate_member(group: &Proxy, member: &str) -> Result<()> {
    ensure!(
        matches!(group.proxy_type.as_str(), "Selector" | "URLTest" | "Fallback"),
        "This proxy group cannot be selected manually"
    );
    ensure!(
        group
            .all
            .as_ref()
            .is_some_and(|members| members.iter().any(|m| m == member)),
        "Node is no longer in this APP group; refresh the node list"
    );
    Ok(())
}

fn affected_connections(
    connections: Vec<Connection>,
    group: &str,
    cutoff: chrono::DateTime<chrono::Utc>,
) -> Vec<String> {
    connections
        .into_iter()
        .filter(|c| {
            c.chains.iter().any(|chain| chain == group)
                && chrono::DateTime::parse_from_rfc3339(&c.start).is_ok_and(|start| start <= cutoff)
        })
        .map(|c| c.id)
        .collect()
}

type ConnectionSnapshot = Option<tokio::task::JoinHandle<Vec<String>>>;

fn old_connections(group: &str, enabled: bool) -> ConnectionSnapshot {
    if !enabled {
        return None;
    }
    let group = group.to_owned();
    let cutoff = chrono::Utc::now();
    // A large connection table must not block the selector API. The cutoff excludes
    // connections established after this switch even if its snapshot arrives later.
    Some(tokio::spawn(async move {
        match tokio::time::timeout(
            std::time::Duration::from_millis(250),
            Handle::mihomo().get_connections(),
        )
        .await
        {
            Ok(Ok(snapshot)) => affected_connections(snapshot.connections.unwrap_or_default(), &group, cutoff),
            _ => {
                tracing::warn!("APP connection snapshot unavailable; leaving existing connections intact");
                vec![]
            }
        }
    }))
}

fn close_old_connections(snapshot: ConnectionSnapshot) {
    let Some(snapshot) = snapshot else {
        return;
    };
    AsyncHandler::spawn(move || async move {
        use futures::{StreamExt as _, stream};
        let Ok(ids) = snapshot.await else {
            return;
        };
        stream::iter(ids)
            .for_each_concurrent(16, |id| async move {
                if let Err(error) = Handle::mihomo().close_connection(&id).await {
                    tracing::debug!("APP old connection cleanup failed: {error}");
                }
            })
            .await;
    });
}

// Saving preferences and touching a selector are distinct from changing the compiled routing graph.
async fn switch_and_persist<S, SF, P, PF, R, RF>(select: S, persist: P, rollback: R) -> Result<()>
where
    S: FnOnce() -> SF,
    SF: std::future::Future<Output = Result<()>>,
    P: FnOnce() -> PF,
    PF: std::future::Future<Output = Result<()>>,
    R: FnOnce() -> RF,
    RF: std::future::Future<Output = Result<()>>,
{
    let result = async {
        select().await?;
        persist().await
    }
    .await;
    if let Err(error) = result {
        // A timed-out selector request may already have applied. Restore even when its response was lost.
        return match rollback().await {
            Ok(()) => Err(error),
            Err(restore) => Err(error.context(format!(
                "APP selection rollback also failed: {restore}; refresh the core state"
            ))),
        };
    }
    Ok(())
}

async fn persist_choice(routing: &AppRoutingConfig, live: Option<(&str, &str, &Proxy)>) -> Result<()> {
    let verge = Config::verge().await;
    let transaction = DraftTransaction::begin(vec![&verge])?;
    verge.edit_draft(|config| config.app_routing = Some(routing.clone()));
    if let Some((group, member, old)) = live {
        let previous = old
            .fixed
            .as_deref()
            .or(old.now.as_deref())
            .context("APP selector has no current selection")?;
        switch_and_persist(
            || async {
                Handle::mihomo()
                    .select_node_for_group(group, member)
                    .await
                    .map_err(Into::into)
            },
            || async { verge.latest_arc().save_file().await },
            || async {
                if old.proxy_type.as_str() != "Selector" && old.fixed.is_none() {
                    Handle::mihomo().unfixed_proxy(group).await.map_err(Into::into)
                } else {
                    Handle::mihomo()
                        .select_node_for_group(group, previous)
                        .await
                        .map_err(Into::into)
                }
            },
        )
        .await?;
    } else {
        verge.latest_arc().save_file().await?;
    }
    transaction.commit();
    announce(Refresh::Verge);
    Ok(())
}

pub async fn select_app_group_node(group_id: &str, target: AppTarget) -> Result<AppRoutingConfig> {
    let config_write = Config::lock_config_write().await;
    let verge = Config::verge().await.data_arc();
    let routing = verge
        .app_routing
        .clone()
        .unwrap_or_default()
        .with_selected_node(group_id, target.clone())?;
    let AppTarget::Node { name, provider } = &target else {
        bail!("Choose a proxy node")
    };
    if !verge.app_routing_active() {
        validate_fixed_target(&target).await?;
        persist_choice(&routing, None).await?;
        return Ok(routing);
    }
    let lifecycle = CoreManager::global().lifecycle_lock.lock().await;
    let group = format!("{GROUP_PREFIX}{group_id}");
    let member = app_node_group_name(name, provider.as_deref());
    let old = Handle::mihomo().get_proxy_by_name(&group).await?;
    if !old.all.as_ref().is_some_and(|all| all.contains(&member)) {
        // Newly discovered provider membership is a structural change, never the steady-state switch path.
        validate_fixed_target(&target).await?;
        let ids = old_connections(&group, verge.auto_close_connection.unwrap_or(false));
        drop(lifecycle);
        super::apply_verge_patch_locked(
            &config_write,
            &crate::config::IVerge {
                app_routing: Some(routing.clone()),
                ..Default::default()
            },
            false,
        )
        .await?;
        close_old_connections(ids);
        return Ok(routing);
    }
    validate_member(&old, &member)?;
    let ids = old_connections(&group, verge.auto_close_connection.unwrap_or(false));
    persist_choice(&routing, Some((&group, &member, &old))).await?;
    close_old_connections(ids);
    Ok(routing)
}

pub async fn select_app_rule_node(original: &str, member: &str) -> Result<AppRoutingConfig> {
    let _write = Config::lock_config_write().await;
    let verge = Config::verge().await.data_arc();
    let mut routing = verge.app_routing.clone().unwrap_or_default();
    ensure!(
        routing
            .groups
            .iter()
            .any(|g| g.enabled && !g.apps.is_empty() && matches!(g.target, AppTarget::Rule)),
        "No enabled APP rule group is configured"
    );
    ensure!(
        !original.starts_with(GROUP_PREFIX),
        "Expected the original subscription group name"
    );
    let group = app_rule_group_name(original);
    if verge.app_routing_active() {
        let _lifecycle = CoreManager::global().lifecycle_lock.lock().await;
        let old = Handle::mihomo().get_proxy_by_name(&group).await?;
        validate_member(&old, member)?;
        routing.rule_selections.insert(original.to_owned(), member.to_owned());
        let ids = old_connections(&group, verge.auto_close_connection.unwrap_or(false));
        persist_choice(&routing, Some((&group, member, &old))).await?;
        close_old_connections(ids);
    } else {
        let old = Handle::mihomo().get_proxy_by_name(original).await?;
        let runtime = Config::runtime().await.data_arc();
        let source = runtime
            .config
            .as_ref()
            .and_then(|c| c.get("proxy-groups"))
            .and_then(Value::as_sequence);
        let original_member = old
            .all
            .as_ref()
            .and_then(|all| {
                all.iter().find(|name| {
                    let is_group = name.as_str() == "GLOBAL"
                        || source.is_some_and(|groups| {
                            groups
                                .iter()
                                .any(|g| g.get("name").and_then(Value::as_str) == Some(name.as_str()))
                        });
                    if is_group {
                        app_rule_group_name(name) == member
                    } else {
                        name.as_str() == member
                    }
                })
            })
            .context("Node is no longer in the APP group preview")?;
        validate_member(&old, original_member)?;
        routing.rule_selections.insert(original.to_owned(), member.to_owned());
        persist_choice(&routing, None).await?;
    }
    Ok(routing)
}

pub(crate) async fn restore_app_selections() {
    let verge = Config::verge().await.latest_arc();
    if !verge.app_routing_active() {
        return;
    }
    let routing = verge.app_routing.clone().unwrap_or_default();
    let mut selections: Vec<_> = routing
        .rule_selections
        .iter()
        .map(|(g, n)| (app_rule_group_name(g), n.clone()))
        .collect();
    for group in routing.groups.iter().filter(|g| g.enabled && !g.apps.is_empty()) {
        if let AppTarget::Node { name, provider } = &group.target {
            selections.push((
                format!("{GROUP_PREFIX}{}", group.id),
                app_node_group_name(name, provider.as_deref()),
            ));
        }
    }
    for (group, member) in selections {
        if let Err(error) = Handle::mihomo().select_node_for_group(&group, &member).await {
            tracing::warn!("Could not restore APP selector: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, rc::Rc};
    #[tokio::test]
    async fn hot_switch_persists_after_api_and_rolls_back_on_failure() {
        for (select_ok, save_ok, expected) in [
            (true, true, vec!["select", "save"]),
            (true, false, vec!["select", "save", "rollback"]),
            (false, true, vec!["select", "rollback"]),
        ] {
            let log = Rc::new(RefCell::new(Vec::new()));
            let result = switch_and_persist(
                || async {
                    log.borrow_mut().push("select");
                    ensure!(select_ok, "api failure");
                    Ok(())
                },
                || async {
                    log.borrow_mut().push("save");
                    ensure!(save_ok, "disk failure");
                    Ok(())
                },
                || async {
                    log.borrow_mut().push("rollback");
                    Ok(())
                },
            )
            .await;
            assert_eq!(result.is_ok(), select_ok && save_ok);
            assert_eq!(*log.borrow(), expected);
        }
    }
    #[test]
    fn connection_cleanup_is_scoped_to_the_changed_app_group() {
        let connection = |id: &str, chains: &[&str]| Connection {
            id: id.into(),
            start: "2026-01-01T00:00:00Z".into(),
            chains: chains.iter().map(|s| (*s).into()).collect(),
            ..Default::default()
        };
        let ids = affected_connections(
            vec![
                connection("changed", &["Japan", "__CV_APP_browser"]),
                connection("other-app", &["Japan", "__CV_APP_chat"]),
                connection("tun", &["Japan", "Traffic"]),
                Connection {
                    start: "2999-01-01T00:00:00Z".into(),
                    ..connection("new-app", &["Home", "__CV_APP_browser"])
                },
            ],
            "__CV_APP_browser",
            chrono::Utc::now(),
        );
        assert_eq!(ids, ["changed"]);
    }
}
