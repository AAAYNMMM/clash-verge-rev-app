use serde::Serialize;
use std::collections::BTreeMap;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

#[derive(Debug, Serialize)]
pub struct RunningApp {
    pub name: String,
    pub path: Option<String>,
    pub process_count: usize,
}

fn group_applications(processes: impl Iterator<Item = (String, Option<String>)>) -> Vec<RunningApp> {
    let mut apps: BTreeMap<(bool, String), RunningApp> = BTreeMap::new();
    for (name, path) in processes {
        if name.is_empty() {
            continue;
        }
        let path = path.filter(|path| !path.is_empty());
        let identity = path.as_deref().unwrap_or(&name);
        let key = if cfg!(windows) {
            identity.replace('/', "\\").to_lowercase()
        } else {
            identity.to_owned()
        };
        apps.entry((path.is_some(), key))
            .and_modify(|app| app.process_count += 1)
            .or_insert(RunningApp {
                name,
                path,
                process_count: 1,
            });
    }
    let mut apps: Vec<_> = apps.into_values().collect();
    apps.sort_by_cached_key(|app| (app.name.to_lowercase(), app.path.clone()));
    apps
}

pub fn list_running_apps() -> Vec<RunningApp> {
    let mut system = System::new();
    // Only read executable identities, never command lines or environment variables.
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .without_tasks()
            .with_exe(UpdateKind::Always),
    );
    group_applications(
        system
            .processes()
            .iter()
            .filter(|(pid, _)| pid.as_u32() != 0)
            .map(|(_, process)| {
                let path = process.exe().map(|path| path.to_string_lossy().into_owned());
                let name = process
                    .exe()
                    .and_then(|path| path.file_name())
                    .unwrap_or(process.name())
                    .to_string_lossy()
                    .into_owned();
                (name, path)
            }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_same_executable_but_keeps_other_installations_and_name_only_entries() {
        let apps = group_applications(
            [
                ("browser.exe".into(), Some("/one/browser.exe".into())),
                ("browser.exe".into(), Some("/one/browser.exe".into())),
                ("browser.exe".into(), Some("/two/browser.exe".into())),
                ("restricted.exe".into(), None),
            ]
            .into_iter(),
        );
        assert_eq!(apps.len(), 3);
        assert_eq!(apps[0].process_count, 2);
        assert_ne!(apps[0].path, apps[1].path);
        assert_eq!(apps[2].path, None);
    }

    #[test]
    fn running_list_contains_the_current_program_without_launching_anything() -> std::io::Result<()> {
        let current = std::env::current_exe()?;
        let current = current.to_string_lossy();
        assert!(
            list_running_apps()
                .iter()
                .any(|app| app.path.as_deref().is_some_and(|path| {
                    if cfg!(windows) {
                        path.eq_ignore_ascii_case(&current)
                    } else {
                        path == current
                    }
                }))
        );
        Ok(())
    }
}
