import { describe, expect, it } from 'vitest'

import {
  parseApplications,
  targetKey,
  mergeApplications,
  groupRouteFields,
} from './app-routing'
import {
  coreProxyMode,
  resolveProxyMode,
  appRoutingActive,
  appRoutingAvailable,
} from './proxy-mode'

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

  it('keeps Global and APP active while the core evaluates rules', () => {
    expect(resolveProxyMode('global', 'rule', true)).toBe('global')
    expect(resolveProxyMode('direct', 'rule', true)).toBe('direct')
    expect(resolveProxyMode('rule', 'rule', true)).toBe('rule')
    expect(coreProxyMode('global', true)).toBe('rule')
    expect(coreProxyMode('global', false)).toBe('global')
    expect(resolveProxyMode('app', undefined)).toBe('rule')
  })

  it('uses the live core mode when APP is off or changed externally', () => {
    expect(resolveProxyMode('global', 'rule', false)).toBe('rule')
    expect(resolveProxyMode('rule', 'global', true)).toBe('global')
    expect(resolveProxyMode(undefined, 'GLOBAL')).toBe('global')
  })
})

it('only permits the independent APP switch for TUN without system proxy', () => {
  for (const tun of [false, true]) {
    for (const system of [false, true]) {
      const settings = {
        enable_tun_mode: tun,
        enable_system_proxy: system,
        enable_app_routing: true,
      }
      expect(appRoutingAvailable(settings)).toBe(tun && !system)
      expect(appRoutingActive(settings)).toBe(tun && !system)
      expect(appRoutingActive({ ...settings, enable_app_routing: false })).toBe(
        false,
      )
    }
  }
  expect(appRoutingAvailable(undefined)).toBe(false)
})

it('deduplicates program-picker paths without merging separate installations', () => {
  expect(
    mergeApplications(
      '"C:/Apps/Browser.exe"',
      ['c:/apps/browser.exe', 'D:/Apps/Browser.exe'],
      true,
    ),
  ).toBe('C:/Apps/Browser.exe\nD:/Apps/Browser.exe')
})

it('rule delegation clears all node filtering and node mode defaults to all candidates', () => {
  expect(groupRouteFields({ kind: 'rule' }, '[')).toEqual({
    target: { kind: 'rule' },
    node_patterns: [],
  })
  expect(groupRouteFields({ kind: 'node', name: 'home-1' }, '')).toEqual({
    target: { kind: 'node', name: 'home-1' },
    node_patterns: ['.*'],
  })
})
