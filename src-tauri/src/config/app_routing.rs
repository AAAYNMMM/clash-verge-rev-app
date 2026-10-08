use anyhow::{Result, bail};
use fancy_regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Default, Debug, Clone, Deserialize, Serialize)]
#[serde(default)]
pub struct AppRoutingConfig {
    pub groups: Vec<AppRoutingGroup>,
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

// Candidate filters never enter Mihomo rules; limit backtracking during editing and validation.
const NODE_FILTER_BACKTRACK_LIMIT: usize = 100_000;

pub fn compile_patterns(patterns: &[String]) -> Result<Vec<Regex>> {
    patterns
        .iter()
        .map(|pattern| {
            if pattern.trim().is_empty() {
                bail!("APP node filters must not be blank");
            }
            RegexBuilder::new(pattern)
                .backtrack_limit(NODE_FILTER_BACKTRACK_LIMIT)
                .build()
                .map_err(|error| anyhow::anyhow!("Invalid APP node filter {pattern:?}: {error}"))
        })
        .collect()
}

pub fn matches_node(filters: &[Regex], name: &str) -> Result<bool> {
    for filter in filters {
        let matched = filter.is_match(name).map_err(|error| {
            anyhow::anyhow!(
                "APP node filter {:?} failed for node {name:?}: {error}. Simplify the expression to reduce backtracking.",
                filter.as_str()
            )
        })?;
        if matched {
            return Ok(true);
        }
    }
    Ok(false)
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
                if !matches_node(&patterns, name)? {
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

#[cfg(test)]
mod filter_tests {
    use super::*;

    #[test]
    fn supports_basic_filters_lookaround_and_backreferences() -> Result<()> {
        for (pattern, included, excluded) in [
            (r"(?i)home|家宽", "HOME-1", "office-1"),
            (
                r"^(?=.*家宽)(?!.*(?:到期|流量)).*$",
                "日本 家宽 01",
                "日本 家宽 剩余流量",
            ),
            (r"(?<=JP-)home-\d+$", "JP-home-01", "US-home-01"),
            (r"(?<!office-)home-\d+$", "JP-home-01", "office-home-01"),
            (r"^([A-Z]{2})-\1$", "JP-JP", "JP-US"),
        ] {
            let filters = compile_patterns(&[pattern.into()])?;
            assert!(matches_node(&filters, included)?, "{pattern}");
            assert!(!matches_node(&filters, excluded)?, "{pattern}");
        }
        Ok(())
    }

    #[test]
    fn multiple_filters_keep_union_semantics_and_invalid_patterns_report_errors() -> Result<()> {
        let filters = compile_patterns(&[r"^JP-(?=.*home)".into(), r"^US-(?=.*home)".into()])?;
        for name in ["JP-home-1", "US-home-2"] {
            assert!(matches_node(&filters, name)?);
        }
        assert!(!matches_node(&filters, "UK-home-1")?);
        assert!(!matches_node(&compile_patterns(&[])?, "JP-home-1")?);
        for pattern in ["[", " ", "(?="] {
            assert!(compile_patterns(&[pattern.into()]).is_err());
        }
        Ok(())
    }

    #[test]
    fn excessive_backtracking_is_an_error_not_a_nonmatch() -> Result<()> {
        let filters = compile_patterns(&[r"^(a|aa)+(?=b)$".into()])?;
        let result = matches_node(&filters, &"a".repeat(64));
        assert!(result.is_err());
        assert!(
            result
                .err()
                .is_some_and(|error| error.to_string().contains("backtrack"))
        );
        Ok(())
    }

    #[test]
    fn saved_selection_uses_fancy_filters_without_changing_other_settings() -> Result<()> {
        let routing: AppRoutingConfig = serde_yaml_ng::from_str(
            r#"
groups:
- id: ai
  name: AI
  apps: [{kind: name, value: ai.exe}]
  node_patterns: ['^(?=.*home)(?!.*office).*$']
  target: {kind: node, name: JP-home-1}
"#,
        )?;
        routing.validate()?;
        let snapshot = serde_yaml_ng::to_string(&routing)?;
        let selected = routing.with_selected_node(
            "ai",
            AppTarget::Node {
                name: "US-home-2".into(),
                provider: Some("subscription".into()),
            },
        )?;
        assert!(
            matches!(&selected.groups[0].target, AppTarget::Node { name, provider } if name == "US-home-2" && provider.as_deref() == Some("subscription"))
        );
        assert_eq!(selected.groups[0].node_patterns, routing.groups[0].node_patterns);
        assert!(
            routing
                .with_selected_node(
                    "ai",
                    AppTarget::Node {
                        name: "office-home-2".into(),
                        provider: None,
                    }
                )
                .is_err()
        );
        assert_eq!(serde_yaml_ng::to_string(&routing)?, snapshot);
        Ok(())
    }
}
