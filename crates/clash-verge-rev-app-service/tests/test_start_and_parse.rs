#![cfg(all(feature = "standalone", feature = "client", feature = "test"))]

mod common;

use anyhow::{Context as _, Result};
#[cfg(unix)]
use clash_verge_service_ipc::stop_ipc_server;
use clash_verge_service_ipc::{PROTOCOL_EPOCH, PROTOCOL_REVISION, VERSION, get_status, get_version};
use common::{start_server, stop_server};
use serial_test::serial;

#[cfg(unix)]
#[tokio::test]
#[serial]
async fn a_stale_ipc_path_requires_service_reinstallation() -> Result<()> {
    let _ = stop_ipc_server().await;
    let ipc_path = std::path::Path::new(clash_verge_service_ipc::IPC_PATH);
    std::fs::create_dir_all(ipc_path.parent().context("IPC path has no parent")?)?;
    std::fs::write(ipc_path, b"")?;

    assert!(clash_verge_service_ipc::is_reinstall_service_needed().await);

    std::fs::remove_file(ipc_path)?;
    Ok(())
}

#[tokio::test]
#[serial]
async fn running_server_reports_its_protocol_and_status() -> Result<()> {
    let server = start_server().await?;

    let version = get_version().await?.data.context("version omitted data")?;
    assert_eq!(version.build_version, VERSION);
    assert_eq!(version.protocol.epoch, PROTOCOL_EPOCH);
    assert_eq!(version.protocol.revision, PROTOCOL_REVISION);
    assert!(get_status(&common::owner_credentials()).await?.data.is_some());

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let socket = std::path::Path::new(clash_verge_service_ipc::IPC_PATH);
        assert_eq!(std::fs::metadata(socket)?.permissions().mode() & 0o777, 0o666);
        assert_eq!(
            std::fs::metadata(socket.parent().context("IPC path has no parent")?)?
                .permissions()
                .mode()
                & 0o777,
            0o755
        );
    }

    stop_server(server).await
}

#[tokio::test]
#[serial]
async fn installation_probe_validates_the_protocol_over_real_ipc() -> Result<()> {
    use clash_verge_service_ipc::{
        IPC_AUTH_EXPECT, IpcCommand, SERVICE_PROTOCOL_HEADER, ServiceErrorCode, connect, inspect_installation,
    };
    let server = start_server().await?;
    let result: Result<()> = async {
        let version = get_version().await?.data.context("version omitted data")?;
        assert_eq!(version.protocol.epoch, PROTOCOL_EPOCH);
        let inspection = inspect_installation(&[]).await?;
        assert_eq!(inspection.protocol.protocol, version.protocol);
        for protocol in [None, Some("0.0"), Some("2.0")] {
            let client = connect().await?;
            let request = client
                .post(IpcCommand::InspectInstallation.as_ref())
                .header("X-IPC-Magic", IPC_AUTH_EXPECT);
            let request = match protocol {
                Some(value) => request.header(SERVICE_PROTOCOL_HEADER, value),
                None => request,
            };
            let response = request
                .json_body(&serde_json::json!([]))
                .send()
                .await?
                .json::<serde_json::Value>()?;
            assert_eq!(response["code"], ServiceErrorCode::ProtocolMismatch as u16);
        }
        Ok(())
    }
    .await;
    stop_server(server).await?;
    result
}
