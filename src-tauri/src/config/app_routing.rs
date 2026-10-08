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
            let patterns = compile_patterns(&group.node_patterns)?;
            if let AppTarget::Node { name, provider } = &group.target {
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
