use crate::config::app_routing::{AppMatchKind, AppMatcher, AppRoutingConfig, AppTarget};
use anyhow::{Result, bail};
use serde_yaml_ng::{Mapping, Value};

pub const GROUP_PREFIX: &str = "__CV_APP_";

// Hex escapes keep literal names out of Mihomo's comma/parenthesis rule grammar
// and its backtick-separated group-filter grammar.
fn literal_pattern(value: &str) -> String {
    let mut escaped = String::new();
    for character in value.chars() {
        match character {
            ',' | '(' | ')' | '`' | '\n' | '\r' => escaped.push_str(&format!("\\x{{{:x}}}", character as u32)),
            '\\' | '.' | '+' | '*' | '?' | '[' | ']' | '{' | '}' | '^' | '$' | '|' => {
                escaped.push('\\');
                escaped.push(character);
            }
            _ => escaped.push(character),
        }
    }
    format!("^{escaped}$")
}

fn process_condition(app: &AppMatcher) -> String {
    let rule_type = match app.kind {
        AppMatchKind::Name => "PROCESS-NAME-REGEX",
        AppMatchKind::Path => "PROCESS-PATH-REGEX",
    };
    let value = if cfg!(windows) && matches!(app.kind, AppMatchKind::Path) {
        app.value.replace('/', "\\")
    } else {
        app.value.clone()
    };
    let flags = if cfg!(windows) { "(?i)" } else { "" };
    format!("{rule_type},{flags}{}", literal_pattern(&value))
}

fn logical(operator: &str, conditions: &[String]) -> String {
    let children = conditions
        .iter()
        .map(|condition| format!("({condition})"))
        .collect::<Vec<_>>()
        .join(",");
    format!("{operator},({children})")
}

fn any(conditions: &[String]) -> String {
    if conditions.len() == 1 {
        conditions[0].clone()
    } else {
        logical("OR", conditions)
    }
}

fn locked_group(config: &Mapping, id: &str, name: &str, provider: &Option<String>) -> Value {
    let mut group = Mapping::new();
    group.insert("name".into(), format!("{GROUP_PREFIX}{id}").into());
    group.insert("type".into(), "select".into());
    group.insert("hidden".into(), true.into());
    group.insert("empty-fallback".into(), "REJECT".into());
    group.insert("default-selected".into(), name.into());
    group.insert("interval".into(), 0.into());
    if let Some(provider) = provider {
        let exists = config
            .get("proxy-providers")
            .and_then(Value::as_mapping)
            .is_some_and(|providers| providers.contains_key(provider.as_str()));
        if exists {
            group.insert("use".into(), Value::Sequence(vec![provider.as_str().into()]));
            group.insert("filter".into(), literal_pattern(name).into());
        } else {
            group.insert("proxies".into(), Value::Sequence(vec!["REJECT".into()]));
        }
    } else {
        let exists = config
            .get("proxies")
            .and_then(Value::as_sequence)
            .is_some_and(|proxies| {
                proxies.iter().any(|proxy| {
                    proxy.get("name").and_then(Value::as_str) == Some(name)
                        && !matches!(
                            proxy.get("type").and_then(Value::as_str),
                            Some("direct" | "reject" | "pass" | "rematch")
                        )
                })
            });
        group.insert(
            "proxies".into(),
            Value::Sequence(vec![if exists { name.into() } else { "REJECT".into() }]),
        );
    }
    Value::Mapping(group)
}

// These exceptions protect local IPC/LAN destinations before any APP or default exit.
const LOCAL_RULES: &[&str] = &[
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR6,::1/128,DIRECT,no-resolve",
    "DOMAIN-SUFFIX,localhost,DIRECT",
    "DOMAIN-SUFFIX,local,DIRECT",
    "DOMAIN-SUFFIX,lan,DIRECT",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,169.254.0.0/16,DIRECT,no-resolve",
    "IP-CIDR6,fc00::/7,DIRECT,no-resolve",
    "IP-CIDR6,fe80::/10,DIRECT,no-resolve",
];

fn preserve_global_members(config: &Mapping, groups: &mut Vec<Value>) {
    if groups
        .iter()
        .any(|group| group.get("name").and_then(Value::as_str) == Some("GLOBAL"))
    {
        return;
    }
    // Freeze the original built-in membership before adding private APP selectors.
    let mut members = vec![Value::from("DIRECT"), Value::from("REJECT")];
    for item in config
        .get("proxies")
        .and_then(Value::as_sequence)
        .into_iter()
        .flatten()
        .chain(groups.iter())
    {
        if matches!(item.get("type").and_then(Value::as_str), Some("pass" | "pass-rule")) {
            continue;
        }
        if let Some(name) = item.get("name").and_then(Value::as_str) {
            members.push(name.into());
        }
    }
    let mut global = Mapping::new();
    global.insert("name".into(), "GLOBAL".into());
    global.insert("type".into(), "select".into());
    global.insert("proxies".into(), members.into());
    groups.push(global.into());
}

pub fn apply(mut config: Mapping, routing: &AppRoutingConfig, enabled: bool) -> Result<Mapping> {
    if config.get("mode").and_then(Value::as_str) == Some("app") {
        config.insert("mode".into(), "rule".into());
    }
    if !enabled
        || config
            .get("tun")
            .and_then(|tun| tun.get("enable"))
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Ok(config);
    }
    let base_mode = config.get("mode").and_then(Value::as_str).unwrap_or("rule").to_owned();
    routing.validate()?;
    config.insert("mode".into(), "rule".into());
    config.insert("find-process-mode".into(), "always".into());

    let original_rules = config
        .remove("rules")
        .and_then(|value| value.as_sequence().cloned())
        .unwrap_or_default();
    let mut groups = config
        .get("proxy-groups")
        .and_then(Value::as_sequence)
        .cloned()
        .unwrap_or_default();
    let has_reserved_name = groups
        .iter()
        .chain(config.get("proxies").and_then(Value::as_sequence).into_iter().flatten())
        .any(|item| {
            item.get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| name.starts_with(GROUP_PREFIX))
        });
    if has_reserved_name {
        bail!("Proxy names starting with {GROUP_PREFIX} are reserved for APP routing");
    }

    preserve_global_members(&config, &mut groups);
    let mut rules: Vec<Value> = LOCAL_RULES.iter().map(|rule| Value::from(*rule)).collect();
    let mut claimed = Vec::new();
    let mut rule_apps = Vec::new();
    for group in routing
        .groups
        .iter()
        .filter(|group| group.enabled && !group.apps.is_empty())
    {
        let conditions: Vec<_> = group.apps.iter().map(process_condition).collect();
        let process = if claimed.is_empty() {
            any(&conditions)
        } else {
            logical("AND", &[any(&conditions), logical("NOT", &[any(&claimed)])])
        };
        // System/explicit HTTP and SOCKS requests must never enter APP overrides.
        let condition = logical("AND", &["IN-TYPE,TUN".into(), process]);
        match &group.target {
            AppTarget::Rule => rule_apps.push(condition.clone()),
            AppTarget::Direct => rules.push(format!("{condition},DIRECT").into()),
            AppTarget::Node { name, provider } => {
                groups.push(locked_group(&config, &group.id, name, provider));
                rules.push(format!("{condition},{GROUP_PREFIX}{}", group.id).into());
                // Mihomo skips a proxy rule for unsupported UDP. Never let that
                // fall through to another group's node or the DIRECT default.
                rules.push(format!("{condition},REJECT").into());
            }
        }
        claimed.extend(conditions);
    }
    if base_mode != "rule" {
        let condition = if rule_apps.is_empty() {
            "MATCH".into()
        } else {
            logical("NOT", &[any(&rule_apps)])
        };
        let target = if base_mode == "global" { "GLOBAL" } else { "DIRECT" };
        rules.push(format!("{condition},{target}").into());
        // A global UDP-incompatible/PASS exit cannot fall into the subscription's rule chain.
        if base_mode == "global" {
            rules.push(format!("{condition},REJECT").into());
        }
    }
    // Keep the original rule chain at root. Moving it into SUB-RULE would change
    // PASS and existing nested SUB-RULE semantics.
    rules.extend(original_rules);
    rules.push("MATCH,DIRECT".into());
    config.insert("proxy-groups".into(), Value::Sequence(groups));
    config.insert("rules".into(), Value::Sequence(rules));
    Ok(config)
}

#[cfg(test)]
#[allow(clippy::expect_used, reason = "tests assert fixture validity")]
mod tests {
    use super::*;
    use crate::config::app_routing::AppRoutingGroup;

    fn apply(config: Mapping, routing: &AppRoutingConfig) -> Result<Mapping> {
        super::apply(config, routing, true)
    }

    fn locked(result: &Mapping) -> &Value {
        result["proxy-groups"]
            .as_sequence()
            .expect("groups")
            .iter()
            .find(|group| group["name"] == Value::from("__CV_APP_ai"))
            .expect("APP group")
    }

    fn group(id: &str, target: AppTarget) -> AppRoutingGroup {
        AppRoutingGroup {
            id: id.into(),
            name: id.into(),
            enabled: true,
            apps: vec![AppMatcher {
                kind: AppMatchKind::Name,
                value: "client.exe".into(),
            }],
            node_patterns: vec![".*".into()],
            target,
        }
    }

    fn fixture() -> Mapping {
        serde_yaml_ng::from_str("mode: rule\ntun: {enable: true}\nproxies:\n- {name: home-1, type: socks5}\n- {name: home-2, type: socks5}\nrules: ['DOMAIN,example.com,PASS', 'MATCH,normal']\nproxy-groups:\n- {name: normal, type: select, proxies: [home-2]}\n").expect("fixture")
    }

    fn fixed() -> AppTarget {
        AppTarget::Node {
            name: "home-1".into(),
            provider: None,
        }
    }

    #[test]
    fn inactive_or_non_tun_config_never_compiles_app_overrides() {
        let mut invalid = group("ai", fixed());
        invalid.node_patterns = vec!["[".into()];
        let routing = AppRoutingConfig { groups: vec![invalid] };
        let config = fixture();
        assert_eq!(super::apply(config.clone(), &routing, false).expect("inactive"), config);
        let mut no_tun = config;
        no_tun.insert("tun".into(), serde_yaml_ng::from_str("{enable: false}").expect("tun"));
        assert_eq!(super::apply(no_tun.clone(), &routing, true).expect("no tun"), no_tun);
    }

    #[test]
    fn global_fallback_follows_app_matches_and_never_replaces_them() {
        let mut config = fixture();
        config.insert("mode".into(), "global".into());
        let result = apply(
            config,
            &AppRoutingConfig {
                groups: vec![group("ai", fixed())],
            },
        )
        .expect("compile");
        let rules = result["rules"].as_sequence().expect("rules");
        assert_eq!(result["mode"], Value::from("rule"));
        assert!(
            rules[LOCAL_RULES.len()]
                .as_str()
                .expect("app rule")
                .contains("IN-TYPE,TUN")
        );
        assert_eq!(rules[LOCAL_RULES.len() + 2], Value::from("MATCH,GLOBAL"));
        assert_eq!(rules[LOCAL_RULES.len() + 3], Value::from("MATCH,REJECT"));
        let global = result["proxy-groups"]
            .as_sequence()
            .expect("groups")
            .iter()
            .find(|g| g["name"] == Value::from("GLOBAL"))
            .expect("global");
        assert!(
            !global["proxies"]
                .as_sequence()
                .expect("members")
                .iter()
                .any(|n| n.as_str().unwrap_or_default().starts_with(GROUP_PREFIX))
        );
    }

    #[test]
    fn rule_delegation_under_global_is_gated_and_exhaustion_does_not_reenter_global() {
        let mut config = fixture();
        config.insert("mode".into(), "global".into());
        let original = config["rules"].as_sequence().expect("rules").clone();
        let result = apply(
            config,
            &AppRoutingConfig {
                groups: vec![group("browser", AppTarget::Rule), group("ai", fixed())],
            },
        )
        .expect("compile");
        let rules = result["rules"].as_sequence().expect("rules");
        let fallback = rules[LOCAL_RULES.len() + 2].as_str().expect("global gate");
        assert!(fallback.starts_with("NOT,") && fallback.contains("IN-TYPE,TUN") && fallback.ends_with(",GLOBAL"));
        assert_eq!(&rules[rules.len() - 3..rules.len() - 1], original.as_slice());
        assert_eq!(rules.last(), Some(&Value::from("MATCH,DIRECT")));
    }

    #[test]
    fn fancy_candidate_filters_do_not_change_the_forwarding_config() -> Result<()> {
        for provider in [None, Some("chosen".into())] {
            let mut config = fixture();
            config.insert(
                "proxy-providers".into(),
                serde_yaml_ng::from_str("chosen: {type: inline, payload: []}")?,
            );
            let mut selected = group(
                "ai",
                AppTarget::Node {
                    name: "home-1".into(),
                    provider,
                },
            );
            let baseline = apply(
                config.clone(),
                &AppRoutingConfig {
                    groups: vec![selected.clone()],
                },
            )?;
            selected.node_patterns = vec![r"^(?=home-)(?!.*office)home-\d+$".into()];
            let actual = apply(config, &AppRoutingConfig { groups: vec![selected] })?;
            assert_eq!(actual, baseline);
        }
        Ok(())
    }

    #[test]
    fn pins_only_the_chosen_node_and_blocks_udp_fallthrough() {
        let result = apply(
            fixture(),
            &AppRoutingConfig {
                groups: vec![group("ai", fixed())],
            },
        )
        .expect("compile");
        assert_eq!(result["mode"], Value::from("rule"));
        assert_eq!(result["find-process-mode"], Value::from("always"));
        let locked = locked(&result);
        assert_eq!(locked["proxies"], Value::Sequence(vec!["home-1".into()]));
        assert_eq!(locked["empty-fallback"], Value::from("REJECT"));
        assert!(
            result["rules"][LOCAL_RULES.len()]
                .as_str()
                .expect("rule")
                .ends_with(",__CV_APP_ai")
        );
        assert!(
            result["rules"][LOCAL_RULES.len() + 1]
                .as_str()
                .expect("rule")
                .ends_with(",REJECT")
        );
    }

    #[test]
    fn a_deleted_node_is_rejected_not_replaced_by_another_node() {
        let mut config = fixture();
        config.remove("proxies");
        let result = apply(
            config,
            &AppRoutingConfig {
                groups: vec![group("ai", fixed())],
            },
        )
        .expect("compile");
        assert_eq!(locked(&result)["proxies"], Value::Sequence(vec!["REJECT".into()]));
    }

    #[test]
    fn provider_selection_is_source_specific_and_empty_fails_closed() {
        let mut config = fixture();
        config.insert(
            "proxy-providers".into(),
            serde_yaml_ng::from_str("chosen: {type: inline, payload: []}\nother: {type: inline, payload: []}")
                .expect("providers"),
        );
        let target = AppTarget::Node {
            name: "home-1".into(),
            provider: Some("chosen".into()),
        };
        let result = apply(
            config,
            &AppRoutingConfig {
                groups: vec![group("ai", target)],
            },
        )
        .expect("compile");
        let locked = locked(&result);
        assert_eq!(locked["use"], Value::Sequence(vec!["chosen".into()]));
        assert_eq!(locked["filter"], Value::from("^home-1$"));
        assert_eq!(locked["empty-fallback"], Value::from("REJECT"));
    }

    #[test]
    fn rule_delegation_keeps_the_original_root_chain_and_first_group_priority() {
        let config = fixture();
        let original = config["rules"].as_sequence().expect("rules").clone();
        let result = apply(
            config,
            &AppRoutingConfig {
                groups: vec![group("browser", AppTarget::Rule), group("ai", fixed())],
            },
        )
        .expect("compile");
        let rules = result["rules"].as_sequence().expect("rules");
        assert!(rules[LOCAL_RULES.len()].as_str().expect("guard").contains("NOT"));
        assert_eq!(&rules[rules.len() - 3..rules.len() - 1], original.as_slice());
        assert_eq!(result["proxy-groups"][0]["name"], Value::from("normal"));
    }

    #[test]
    fn normal_mode_is_unchanged_and_disabled_groups_are_ignored() {
        let mut normal = fixture();
        normal.insert("mode".into(), "global".into());
        assert_eq!(
            super::apply(normal.clone(), &AppRoutingConfig::default(), false).expect("compile"),
            normal
        );
        let mut disabled = group("ai", fixed());
        disabled.enabled = false;
        let result = apply(fixture(), &AppRoutingConfig { groups: vec![disabled] }).expect("compile");
        assert_eq!(result["proxy-groups"].as_sequence().expect("groups").len(), 2);
    }

    #[test]
    fn executable_paths_and_names_cannot_inject_rules_or_filters() {
        for name in [r"C:\Program Files (x86)\AI,Tools\client.exe", "home(1)`other.*"] {
            let pattern = literal_pattern(name);
            assert!(!pattern.contains([',', '(', ')', '`']));
            let regex = regex::Regex::new(&pattern).expect("regex");
            assert!(regex.is_match(name));
            assert!(!regex.is_match(&format!("{name}-other")));
        }
        let mut invalid = group("ai", fixed());
        invalid.node_patterns = vec!["[".into()];
        assert!(AppRoutingConfig { groups: vec![invalid] }.validate().is_err());
    }
}
