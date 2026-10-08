use anyhow::{Result, bail};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Default, Debug, Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct AppRoutingConfig {
    pub groups: Vec<AppRoutingGroup>,
    pub unmatched: UnmatchedPolicy,
}

#[derive(Default, Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum UnmatchedPolicy {
    #[default]
    Direct,
    Rule,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AppRoutingGroup {
    pub id: String,
    pub name: String,
    #[serde(default = "enabled_by_default")]
    pub enabled: bool,
    #[serde(default)]
    pub apps: Vec<AppMatcher>,
    #[serde(default)]
    pub node_patterns: Vec<String>,
    pub target: AppTarget,
}

const fn enabled_by_default() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AppMatcher {
    pub kind: AppMatchKind,
    pub value: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppMatchKind {
    Name,
    Path,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AppTarget {
    Rule,
    Direct,
    Node {
        name: String,
        // A provider is part of a node's identity, not an interchangeable source.
        #[serde(default)]
        provider: Option<String>,
    },
}

pub fn compile_patterns(patterns: &[String]) -> Result<Vec<Regex>> {
    patterns
        .iter()
        .map(|pattern| {
            if pattern.trim().is_empty() {
                bail!("APP node filters must not be blank");
            }
            Regex::new(pattern).map_err(|error| anyhow::anyhow!("Invalid APP node filter {pattern:?}: {error}"))
        })
        .collect()
}

impl AppRoutingConfig {
    pub fn with_selected_node(&self, group_id: &str, target: AppTarget) -> Result<Self> {
        if !matches!(target, AppTarget::Node { .. }) {
            bail!("Choose a proxy node, not a routing mode");
        }
        let mut next = self.clone();
        let group = next
            .groups
            .iter_mut()
            .find(|group| group.id == group_id)
            .ok_or_else(|| anyhow::anyhow!("APP group no longer exists"))?;
        if !group.enabled || !matches!(group.target, AppTarget::Node { .. }) {
            bail!("This APP group is disabled or uses Rule mode; edit the group first");
        }
        group.target = target;
        next.validate()?;
        Ok(next)
    }

    pub fn validate(&self) -> Result<()> {
        let mut ids = HashSet::new();
        for group in &self.groups {
            if group.id.is_empty()
                || !group
                    .id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
                || !ids.insert(&group.id)
            {
                bail!("APP groups require unique alphanumeric IDs");
            }
            if group.name.trim().is_empty() {
                bail!("APP group names must not be blank");
            }
            for app in &group.apps {
                if app.value.trim().is_empty() || app.value.chars().any(char::is_control) {
                    bail!("Invalid application in APP group {:?}", group.name);
                }
            }
            if let AppTarget::Node { name, provider } = &group.target {
                let patterns = compile_patterns(&group.node_patterns)?;
                if name.is_empty() || provider.as_ref().is_some_and(|name| name.is_empty()) {
                    bail!("APP groups require a node name and a valid source");
                }
                if !patterns.iter().any(|pattern| pattern.is_match(name)) {
                    bail!(
                        "The selected node in APP group {:?} must match a node filter",
                        group.name
                    );
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod selection_tests {
    use super::*;

    fn fixture() -> Result<AppRoutingConfig> {
        Ok(serde_yaml_ng::from_str(
            r#"
groups:
- {id: ai, name: AI, apps: [{kind: name, value: ai.exe}], node_patterns: ['^home-'], target: {kind: node, name: home-1}}
- {id: chat, name: Chat, apps: [{kind: name, value: chat.exe}], node_patterns: ['^home-'], target: {kind: node, name: home-1}}
- {id: browser, name: Browser, apps: [{kind: name, value: browser.exe}], target: {kind: rule}}
"#,
        )?)
    }

    #[test]
    fn manual_selection_preserves_other_groups_and_node_source() -> Result<()> {
        let routing = fixture()?;
        let first = routing.with_selected_node(
            "ai",
            AppTarget::Node {
                name: "home-2".into(),
                provider: Some("provider-one".into()),
            },
        )?;
        let second = first.with_selected_node(
            "chat",
            AppTarget::Node {
                name: "home-3".into(),
                provider: None,
            },
        )?;
        assert!(
            matches!(&second.groups[0].target, AppTarget::Node { name, provider } if name == "home-2" && provider.as_deref() == Some("provider-one"))
        );
        assert!(matches!(&second.groups[1].target, AppTarget::Node { name, .. } if name == "home-3"));
        assert!(matches!(&second.groups[2].target, AppTarget::Rule));
        assert_eq!(
            serde_yaml_ng::to_string(&second.groups[0].apps)?,
            serde_yaml_ng::to_string(&routing.groups[0].apps)?
        );
        assert_eq!(second.groups[0].node_patterns, routing.groups[0].node_patterns);
        Ok(())
    }

    #[test]
    fn stale_group_modes_and_outside_filter_choices_do_not_mutate_selection() -> Result<()> {
        let mut routing = fixture()?;
        let original = serde_yaml_ng::to_string(&routing)?;
        let node = || AppTarget::Node {
            name: "home-2".into(),
            provider: None,
        };
        assert!(routing.with_selected_node("browser", node()).is_err());
        assert!(routing.with_selected_node("deleted", node()).is_err());
        assert!(routing.with_selected_node("ai", AppTarget::Rule).is_err());
        assert!(
            routing
                .with_selected_node(
                    "ai",
                    AppTarget::Node {
                        name: "office-1".into(),
                        provider: None
                    }
                )
                .is_err()
        );
        assert_eq!(serde_yaml_ng::to_string(&routing)?, original);
        routing.groups[0].enabled = false;
        assert!(routing.with_selected_node("ai", node()).is_err());
        Ok(())
    }
}
