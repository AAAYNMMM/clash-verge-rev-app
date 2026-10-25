import { version as buildVersion } from '@root/package.json'

export const displayVersion = (value: string): string =>
  value.replace(/^(\d+\.\d+\.\d+)\+(\d+)$/, '$1.$2')

export const version = displayVersion(buildVersion)
