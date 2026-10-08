import { describe, expect, it } from 'vitest'

import { parseApplications, targetKey } from './app-routing'
import { coreProxyMode, resolveProxyMode } from './proxy-mode'

describe('APP routing identities and modes', () => {
  it('distinguishes executable paths from process names without interpreting them as regexes', () => {
    expect(
      parseApplications(
        'chrome.exe\n"C:\\Program Files (x86)\\AI,Tools\\client.exe"\nchrome.exe\n',
      ),
    ).toEqual([
      { kind: 'name', value: 'chrome.exe' },
      { kind: 'path', value: 'C:\\Program Files (x86)\\AI,Tools\\client.exe' },
    ])
  })

  it('keeps same-named nodes in separate providers distinct', () => {
    const first = targetKey({ kind: 'node', name: 'home-1', provider: 'one' })
    expect(first).not.toBe(
      targetKey({ kind: 'node', name: 'home-1', provider: 'two' }),
    )
    expect(first).not.toBe(targetKey({ kind: 'node', name: 'home-1' }))
    expect(targetKey({ kind: 'node', name: 'home-1' })).toBe(
      targetKey({ kind: 'node', name: 'home-1', provider: null }),
    )
    expect(targetKey({ kind: 'node', name: 'rule' })).not.toBe(
      targetKey({ kind: 'rule' }),
    )
  })

  it('restores the APP UI mode while Mihomo is running its rule engine', () => {
    expect(resolveProxyMode('app', 'rule')).toBe('app')
    expect(resolveProxyMode('app', undefined)).toBe('app')
    expect(coreProxyMode('app')).toBe('rule')
    expect(resolveProxyMode('rule', 'rule')).toBe('rule')
  })

  it('does not mask external core mode changes', () => {
    expect(resolveProxyMode('app', 'global')).toBe('global')
    expect(resolveProxyMode('app', 'direct')).toBe('direct')
    expect(resolveProxyMode(undefined, 'GLOBAL')).toBe('global')
  })
})
