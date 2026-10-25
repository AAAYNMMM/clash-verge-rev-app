pub fn display_version(version: &str) -> String {
    if let Some((base, revision)) = version.split_once('+')
        && !base.contains('-')
        && !revision.is_empty()
        && revision.bytes().all(|byte| byte.is_ascii_digit())
    {
        format!("{base}.{revision}")
    } else {
        version.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numeric_revision_has_a_four_part_public_label() {
        assert_eq!(display_version("2.5.8+1"), "2.5.8.1");
        assert_eq!(display_version("2.5.8"), "2.5.8");
        assert_eq!(display_version("2.5.8+20261025.abc"), "2.5.8+20261025.abc");
        assert_eq!(display_version("2.5.8-beta+1"), "2.5.8-beta+1");
    }
}
