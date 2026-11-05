import { expect, it } from 'vitest'

import { displayVersion, version } from './app-version'

it('displays the requested four-part revision without changing SemVer manifests', () => {
  expect(displayVersion('2.5.8+1')).toBe('2.5.8.1')
  expect(displayVersion('2.5.8')).toBe('2.5.8')
  expect(displayVersion('2.5.8+20261025.abc')).toBe('2.5.8+20261025.abc')
  expect(displayVersion('2.5.8-beta+1')).toBe('2.5.8-beta+1')
  expect(version).toBe('2.5.10')
})
