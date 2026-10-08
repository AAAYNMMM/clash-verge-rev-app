use anyhow::Result;
use sysproxy::{Autoproxy, Sysproxy};

#[derive(Debug, PartialEq, Eq)]
enum Ownership {
    Vacant,
    Ours,
    Foreign,
}

#[derive(Default)]
struct Snapshot {
    servers: Option<String>,
    pac: Option<String>,
}

fn ownership(snapshot: &Snapshot, targets: &[(&Sysproxy, &Autoproxy)]) -> Ownership {
    if snapshot.servers.is_none() && snapshot.pac.is_none() {
        return Ownership::Vacant;
    }
    let own_servers = snapshot.servers.as_ref().is_none_or(|servers| {
        !servers.trim().is_empty()
            && servers.split(';').all(|entry| {
                let address = entry.split_once('=').map_or(entry, |(_, address)| address).trim();
                targets.iter().any(|(sys, _)| {
                    sys.port != 0 && address.eq_ignore_ascii_case(&format!("{}:{}", sys.host, sys.port))
                })
            })
    });
    let own_pac = snapshot
        .pac
        .as_ref()
        .is_none_or(|url| !url.is_empty() && targets.iter().any(|(_, auto)| !auto.url.is_empty() && auto.url == *url));
    if own_servers && own_pac {
        Ownership::Ours
    } else {
        Ownership::Foreign
    }
}

fn allowed(ownership: Ownership, enabling: bool) -> Result<bool> {
    match (ownership, enabling) {
        (Ownership::Foreign, true) => anyhow::bail!(
            "Another application owns the system proxy. Turn off its system proxy before enabling Clash Verge Rev App."
        ),
        (Ownership::Foreign | Ownership::Vacant, false) => Ok(false),
        _ => Ok(true),
    }
}

pub(super) fn may_write(sys: &Sysproxy, auto: &Autoproxy, previous: (&Sysproxy, &Autoproxy)) -> Result<bool> {
    let snapshot = read_snapshot()?;
    allowed(
        ownership(&snapshot, &[(sys, auto), previous]),
        sys.enable || auto.enable,
    )
}

#[cfg(not(target_os = "windows"))]
fn read_snapshot() -> Result<Snapshot> {
    let sys = Sysproxy::get_system_proxy()?;
    let auto = Autoproxy::get_auto_proxy()?;
    Ok(Snapshot {
        servers: sys.enable.then(|| format!("{}:{}", sys.host, sys.port)),
        pac: auto.enable.then_some(auto.url),
    })
}

#[cfg(target_os = "windows")]
fn read_snapshot() -> Result<Snapshot> {
    use std::{mem::size_of, ptr};
    use windows_sys::Win32::{
        Foundation::GlobalFree,
        Networking::WinInet::{
            INTERNET_OPTION_PER_CONNECTION_OPTION, INTERNET_PER_CONN_AUTOCONFIG_URL, INTERNET_PER_CONN_FLAGS,
            INTERNET_PER_CONN_OPTION_LISTW, INTERNET_PER_CONN_OPTIONW, INTERNET_PER_CONN_PROXY_SERVER,
            InternetQueryOptionW, PROXY_TYPE_AUTO_PROXY_URL, PROXY_TYPE_PROXY,
        },
    };
    let mut options = [
        INTERNET_PER_CONN_FLAGS,
        INTERNET_PER_CONN_PROXY_SERVER,
        INTERNET_PER_CONN_AUTOCONFIG_URL,
    ]
    .map(|dw_option| INTERNET_PER_CONN_OPTIONW {
        dwOption: dw_option,
        ..Default::default()
    });
    let mut list = INTERNET_PER_CONN_OPTION_LISTW {
        dwSize: size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32,
        pszConnection: ptr::null_mut(),
        dwOptionCount: options.len() as u32,
        dwOptionError: 0,
        pOptions: options.as_mut_ptr(),
    };
    let mut length = size_of::<INTERNET_PER_CONN_OPTION_LISTW>() as u32;
    // A stale AutoConfigURL remains after PAC is disabled; only WinINET flags prove ownership.
    let succeeded = unsafe {
        InternetQueryOptionW(
            ptr::null(),
            INTERNET_OPTION_PER_CONNECTION_OPTION,
            (&mut list as *mut INTERNET_PER_CONN_OPTION_LISTW).cast(),
            &mut length,
        )
    };
    let error = std::io::Error::last_os_error();
    let flags = unsafe { options[0].Value.dwValue };
    let mut strings = Vec::with_capacity(2);
    for option in &options[1..] {
        let raw = unsafe { option.Value.pszValue };
        let value = if raw.is_null() {
            String::new()
        } else {
            let length = (0..32768).take_while(|index| unsafe { *raw.add(*index) } != 0).count();
            let value = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(raw, length) });
            unsafe {
                GlobalFree(raw.cast());
            }
            value
        };
        strings.push(value);
    }
    anyhow::ensure!(succeeded != 0, "Could not inspect system proxy ownership: {error}");
    let pac = strings.pop().unwrap_or_default();
    let servers = strings.pop().unwrap_or_default();
    Ok(Snapshot {
        servers: (flags & PROXY_TYPE_PROXY != 0).then_some(servers),
        pac: (flags & PROXY_TYPE_AUTO_PROXY_URL != 0).then_some(pac),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn target(port: u16) -> (Sysproxy, Autoproxy) {
        (
            Sysproxy {
                host: "127.0.0.1".into(),
                port,
                ..Default::default()
            },
            Autoproxy {
                url: "http://127.0.0.1:32123/commands/pac".into(),
                enable: false,
            },
        )
    }
    #[test]
    fn foreign_proxy_survives_startup_and_shutdown() -> Result<()> {
        let (sys, auto) = target(17897);
        let snapshot = Snapshot {
            servers: Some("127.0.0.1:7897".into()),
            pac: None,
        };
        assert_eq!(ownership(&snapshot, &[(&sys, &auto)]), Ownership::Foreign);
        assert!(!allowed(Ownership::Foreign, false)?);
        assert!(allowed(Ownership::Foreign, true).is_err());
        Ok(())
    }
    #[test]
    fn changing_ports_and_cleaning_our_proxy_remain_allowed() -> Result<()> {
        let (old, auto) = target(17897);
        let (new, _) = target(17890);
        let snapshot = Snapshot {
            servers: Some("http=127.0.0.1:17897;https=127.0.0.1:17897".into()),
            pac: None,
        };
        assert_eq!(ownership(&snapshot, &[(&old, &auto), (&new, &auto)]), Ownership::Ours);
        assert!(allowed(Ownership::Ours, false)?);
        assert!(allowed(Ownership::Vacant, true)?);
        assert!(!allowed(Ownership::Vacant, false)?);
        Ok(())
    }
    #[test]
    fn mixed_protocol_or_foreign_pac_is_not_ours() {
        let (sys, auto) = target(17897);
        for snapshot in [
            Snapshot {
                servers: Some("http=127.0.0.1:17897;https=127.0.0.1:7897".into()),
                pac: None,
            },
            Snapshot {
                servers: None,
                pac: Some("http://127.0.0.1:1111/commands/pac".into()),
            },
        ] {
            assert_eq!(ownership(&snapshot, &[(&sys, &auto)]), Ownership::Foreign);
        }
        assert_eq!(
            ownership(
                &Snapshot {
                    servers: None,
                    pac: Some(auto.url.clone())
                },
                &[(&sys, &auto)]
            ),
            Ownership::Ours
        );
    }
}
