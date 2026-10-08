#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ChannelIdentity {
    pub id: &'static str,
    pub service_slug: &'static str,
    pub windows_service_name: &'static str,
    pub service_display_name: &'static str,
    pub macos_app_bundle_id: &'static str,
    pub macos_service_id: &'static str,
}

#[cfg(not(feature = "development-channel"))]
pub const CHANNEL_IDENTITY: ChannelIdentity = ChannelIdentity {
    id: "production",
    service_slug: "cvr-app-service",
    windows_service_name: "clash_verge_rev_app_service",
    service_display_name: "Clash Verge Rev App Service",
    macos_app_bundle_id: "io.github.aaaynmmm.clash-verge-rev-app",
    macos_service_id: "io.github.aaaynmmm.clash-verge-rev-app.service",
};

#[cfg(feature = "development-channel")]
pub const CHANNEL_IDENTITY: ChannelIdentity = ChannelIdentity {
    id: "development",
    service_slug: "cvr-app-service-dev",
    windows_service_name: "clash_verge_rev_app_service_dev",
    service_display_name: "Clash Verge Rev App Development Service",
    macos_app_bundle_id: "io.github.aaaynmmm.clash-verge-rev-app.dev",
    macos_service_id: "io.github.aaaynmmm.clash-verge-rev-app.dev.service",
};

pub const SERVICE_SLUG: &str = CHANNEL_IDENTITY.service_slug;
pub const WINDOWS_SERVICE_NAME: &str = CHANNEL_IDENTITY.windows_service_name;
pub const SERVICE_DISPLAY_NAME: &str = CHANNEL_IDENTITY.service_display_name;
pub const MACOS_APP_BUNDLE_ID: &str = CHANNEL_IDENTITY.macos_app_bundle_id;
pub const MACOS_SERVICE_ID: &str = CHANNEL_IDENTITY.macos_service_id;

#[cfg(test)]
mod tests {
    use super::CHANNEL_IDENTITY;

    #[test]
    fn compiled_channel_has_a_self_consistent_identity() {
        assert!(!CHANNEL_IDENTITY.id.is_empty());
        assert!(CHANNEL_IDENTITY.service_slug.starts_with("cvr-app-service"));
        assert!(
            CHANNEL_IDENTITY
                .windows_service_name
                .starts_with("clash_verge_rev_app_service")
        );
        assert!(
            CHANNEL_IDENTITY
                .macos_service_id
                .starts_with(CHANNEL_IDENTITY.macos_app_bundle_id)
        );
    }
}
