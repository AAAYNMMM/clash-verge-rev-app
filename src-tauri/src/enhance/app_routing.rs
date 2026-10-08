use crate::config::app_routing::{AppMatchKind, AppMatcher, AppRoutingConfig, AppTarget, UnmatchedPolicy};
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

pub fn apply(mut config: Mapping, routing: &AppRoutingConfig) -> Result<Mapping> {
    if config.get("mode").and_then(Value::as_str) != Some("app") {
        return Ok(config);
    }
    config.insert("mode".into(), "rule".into());
    // Enforce the policy even for restored configurations that still contain both switches.
    if config
        .get("tun")
        .and_then(|tun| tun.get("enable"))
        .and_then(Value::as_bool)
        == Some(true)
    {
        return Ok(config);
    }
    routing.validate()?;
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

    let mut rules = vec![
        Value::from("IP-CIDR,127.0.0.0/8,DIRECT,no-resolve"),
        Value::from("IP-CIDR6,::1/128,DIRECT,no-resolve"),
    ];
    let mut claimed = Vec::new();
    let mut rule_apps = Vec::new();
    for group in routing
        .groups
        .iter()
        .filter(|group| group.enabled && !group.apps.is_empty())
    {
        let conditions: Vec<_> = group.apps.iter().map(process_condition).collect();
        let condition = if claimed.is_empty() {
            any(&conditions)
        } else {
            logical("AND", &[any(&conditions), logical("NOT", &[any(&claimed)])])
        };
        match &group.target {
            AppTarget::Rule => rule_apps.extend(conditions.iter().cloned()),
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
    if routing.unmatched == UnmatchedPolicy::Direct {
        if rule_apps.is_empty() {
            rules.push("MATCH,DIRECT".into());
        } else {
            rules.push(format!("{},DIRECT", logical("NOT", &[any(&rule_apps)])).into());
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
        serde_yaml_ng::from_str("mode: app\nproxies:\n- {name: home-1, type: socks5}\n- {name: home-2, type: socks5}\nrules: ['DOMAIN,example.com,PASS', 'MATCH,normal']\nproxy-groups:\n- {name: normal, type: select, proxies: [home-2]}\n").expect("fixture")
    }

    fn fixed() -> AppTarget {
        AppTarget::Node {
            name: "home-1".into(),
            provider: None,
        }
    }

    #[test]
    fn tun_does_not_compile_app_rules_or_validate_inactive_node_filters() {
        let mut config = fixture();
        config.insert("tun".into(), serde_yaml_ng::from_str("{enable: true}").expect("tun"));
        let mut invalid = group("ai", fixed());
        invalid.node_patterns = vec!["[".into()];
        let original_rules = config["rules"].clone();
        let result = apply(
            config,
            &AppRoutingConfig {
                groups: vec![invalid],
                ..Default::default()
            },
        )
        .expect("tun");
        assert_eq!(result["mode"], Value::from("rule"));
        assert_eq!(result["rules"], original_rules);
        assert!(!result.contains_key("find-process-mode"));
        let mut rule = group("browser", AppTarget::Rule);
        rule.node_patterns = vec!["[".into()];
        assert!(
            AppRoutingConfig {
                groups: vec![rule],
                ..Default::default()
            }
            .validate()
            .is_ok()
        );
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
                    ..Default::default()
                },
            )?;
            selected.node_patterns = vec![r"^(?=home-)(?!.*office)home-\d+$".into()];
            let actual = apply(
                config,
                &AppRoutingConfig {
                    groups: vec![selected],
                    ..Default::default()
                },
            )?;
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
                ..Default::default()
            },
        )
        .expect("compile");
        assert_eq!(result["mode"], Value::from("rule"));
        assert_eq!(result["find-process-mode"], Value::from("always"));
        let locked = &result["proxy-groups"][1];
        assert_eq!(locked["proxies"], Value::Sequence(vec!["home-1".into()]));
        assert_eq!(locked["empty-fallback"], Value::from("REJECT"));
        assert!(result["rules"][2].as_str().expect("rule").ends_with(",__CV_APP_ai"));
        assert!(result["rules"][3].as_str().expect("rule").ends_with(",REJECT"));
    }

    #[test]
    fn a_deleted_node_is_rejected_not_replaced_by_another_node() {
        let mut config = fixture();
        config.remove("proxies");
        let result = apply(
            config,
            &AppRoutingConfig {
                groups: vec![group("ai", fixed())],
                ..Default::default()
            },
        )
        .expect("compile");
        assert_eq!(
            result["proxy-groups"][1]["proxies"],
            Value::Sequence(vec!["REJECT".into()])
        );
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
                ..Default::default()
            },
        )
        .expect("compile");
        let locked = &result["proxy-groups"][1];
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
                ..Default::default()
            },
        )
        .expect("compile");
        let rules = result["rules"].as_sequence().expect("rules");
        assert!(rules[2].as_str().expect("guard").contains("NOT"));
        assert_eq!(&rules[rules.len() - 3..rules.len() - 1], original.as_slice());
        assert_eq!(result["proxy-groups"][0]["name"], Value::from("normal"));
    }

    #[test]
    fn normal_mode_is_unchanged_and_disabled_groups_are_ignored() {
        let mut normal = fixture();
        normal.insert("mode".into(), "global".into());
        assert_eq!(
            apply(normal.clone(), &AppRoutingConfig::default()).expect("compile"),
            normal
        );
        let mut disabled = group("ai", fixed());
        disabled.enabled = false;
        let result = apply(
            fixture(),
            &AppRoutingConfig {
                groups: vec![disabled],
                ..Default::default()
            },
        )
        .expect("compile");
        assert_eq!(result["proxy-groups"].as_sequence().expect("groups").len(), 1);
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
        assert!(
            AppRoutingConfig {
                groups: vec![invalid],
                ..Default::default()
            }
            .validate()
            .is_err()
        );
    }
}
