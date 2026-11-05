import { fetch } from '@tauri-apps/plugin-http'
import { compareVersions } from 'compare-versions'

import { version as appVersion } from '@root/package.json'

const RELEASES_API =
  'https://api.github.com/repos/AAAYNMMM/clash-verge-rev-app/releases/latest'
const VERSION = /^v?(\d+\.\d+\.\d+)(?:\.(\d+)|\+(\d+))?$/i

export interface ReleaseUpdate {
  available: true
  version: string
  body: string
}

const comparableVersion = (version: string): string | null => {
  const match = version.trim().match(VERSION)
  if (!match) return null
  return `${match[1]}.${match[2] ?? match[3] ?? '0'}`
}

export const checkUpdateSafe = async (): Promise<ReleaseUpdate | null> => {
  const response = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!response.ok)
    throw new Error(`Release check failed: HTTP ${response.status}`)
  const release: unknown = await response.json()
  if (
    !release ||
    typeof release !== 'object' ||
    !('tag_name' in release) ||
    typeof release.tag_name !== 'string'
  ) {
    throw new Error('Release check returned an invalid version')
  }
  const remote = comparableVersion(release.tag_name)
  const local = comparableVersion(appVersion)
  if (!remote || !local)
    throw new Error('Release check returned an invalid version')
  if (compareVersions(remote, local) <= 0) return null
  return {
    available: true,
    version: release.tag_name.replace(/^v/i, ''),
    body:
      'body' in release && typeof release.body === 'string' ? release.body : '',
  }
}
