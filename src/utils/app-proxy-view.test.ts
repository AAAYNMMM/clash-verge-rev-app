import { describe, expect, it } from 'vitest'

import type { AppRoutingGroup } from '@/types/app-routing'
import { isSelectedProxyMember, resolveMember } from '@/types/proxy-view'
import type {
  ProxyGroupView,
  ProxyNodeView,
  ProxyViewV1,
} from '@/types/proxy-view'

import {
  appProxyGroupsForView,
  displayAppProxyName,
  originalAppRuleGroupName,
  withAppProxyGroups,
} from './app-proxy-view'

const proxyGroup = (name: string, hidden = false): ProxyGroupView => ({
  name,
  type: 'Selector',
  alive: true,
  hidden,
  now: 'Japan',
  udp: true,
  xudp: false,
  tfo: false,
  mptcp: false,
  smux: false,
  history: [],
  members: [{ kind: 'node', name: 'Japan', recordId: 'jp' }],
})

const privateName = (name: string) =>
  '__CV_APP_RULE_' +
  Array.from(new TextEncoder().encode(name))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const nodes: ProxyNodeView[] = ['Japan', 'home'].map((name) => ({
  recordId: name === 'Japan' ? 'jp' : 'home',
  name,
  type: 'Vless',
  alive: true,
  history: [],
  udp: true,
  xudp: false,
  tfo: false,
  mptcp: false,
  smux: false,
  source: { kind: 'core', proxyName: name },
}))

const view: ProxyViewV1 = {
  schemaVersion: 1,
  orderSource: 'runtime',
  providerState: 'ready',
  global: proxyGroup('GLOBAL'),
  direct: 'DIRECT',
  groups: [
    proxyGroup('Default selector'),
    proxyGroup(privateName('GLOBAL'), true),
    proxyGroup(privateName('地域云'), true),
    proxyGroup(privateName('自动选择'), true),
  ],
  records: Object.fromEntries(nodes.map((node) => [node.recordId, node])),
  standalone: [],
  providers: [],
}

describe('APP proxy-group view isolation', () => {
  it('shows only APP-private clones, decodes original names, and hides copied GLOBAL', () => {
    const result = appProxyGroupsForView(view, [], nodes, {})
    expect(result.map((item) => item.displayName)).toEqual([
      '地域云',
      '自动选择',
    ])
    expect(result.every((item) => item.hidden === false)).toBe(true)
    expect(result[0].name).toBe(privateName('地域云'))
    expect(view.groups[2].hidden).toBe(true)
    expect(view.groups[0].name).toBe('Default selector')
  })

  it('creates a native-layout view for user fixed-node APP groups', () => {
    const appGroup: AppRoutingGroup = {
      id: 'browser',
      name: '浏览器',
      enabled: true,
      apps: [{ kind: 'name', value: 'chrome.exe' }],
      node_patterns: ['Japan|home'],
      target: { kind: 'node', name: 'home' },
    }
    const result = appProxyGroupsForView(view, [appGroup], nodes, {
      browser: ['Japan', 'home'],
    })
    const userGroup = result.at(-1)!
    expect(userGroup.name).toBe('__CV_APP_browser')
    expect(userGroup.displayName).toBe('浏览器')
    expect(userGroup.now).toBe('home')
    expect(userGroup.members).toEqual([
      { kind: 'node', name: 'Japan', recordId: 'jp' },
      { kind: 'node', name: 'home', recordId: 'home' },
    ])
  })

  it('does not leak TUN proxy group identities or accept malformed encoded aliases', () => {
    expect(displayAppProxyName(privateName('地域云'))).toBe('地域云')
    expect(originalAppRuleGroupName('__CV_APP_RULE_abc')).toBeNull()
    expect(originalAppRuleGroupName('__CV_APP_RULE_zz')).toBeNull()
    expect(originalAppRuleGroupName('__CV_APP_RULE_ff')).toBeNull()
    expect(appProxyGroupsForView(undefined, [], nodes, {})).toEqual([])
  })
})

it('keeps same-name fixed-node selections bound to the saved provider', () => {
  const twins: ProxyNodeView[] = ['one', 'two'].map((provider) => ({
    ...nodes[0],
    recordId: provider,
    name: 'Same',
    source: { kind: 'provider', providerName: provider, proxyName: 'Same' },
  }))
  const live = {
    ...view,
    groups: [],
    records: Object.fromEntries(twins.map((node) => [node.recordId, node])),
  }
  const group: AppRoutingGroup = {
    id: 'fixed',
    name: 'Fixed',
    enabled: true,
    apps: [{ kind: 'name', value: 'app.exe' }],
    node_patterns: ['Same'],
    target: { kind: 'node', name: 'Same', provider: 'two' },
  }
  const visible = appProxyGroupsForView(live, [group], twins, {
    fixed: ['Same'],
  })[0]
  expect(visible.selectedRecordId).toBe('two')
  expect(
    visible.members.map((member) =>
      isSelectedProxyMember(visible, resolveMember(live, member)),
    ),
  ).toEqual([false, true])
  const missing = appProxyGroupsForView(live, [group], [twins[0]], {
    fixed: ['Same'],
  })[0]
  expect(missing.selectedRecordId).toBeNull()
  expect(
    isSelectedProxyMember(missing, resolveMember(live, missing.members[0])),
  ).toBe(false)
})

it('keeps inactive APP selections and nested groups independent from TUN without starting routing', () => {
  const child = {
    ...proxyGroup('Child'),
    now: 'home',
    members: [
      { kind: 'node' as const, name: 'Japan', recordId: 'jp' },
      { kind: 'node' as const, name: 'home', recordId: 'home' },
    ],
  }
  const root = {
    ...proxyGroup('Root'),
    now: 'Child',
    members: [{ kind: 'group' as const, name: 'Child' }],
  }
  const live = { ...view, groups: [root, child] }
  const configured: AppRoutingGroup = {
    id: 'browser',
    name: 'Browser',
    enabled: true,
    apps: [{ kind: 'name', value: 'chrome.exe' }],
    node_patterns: [],
    target: { kind: 'rule' },
  }
  const choices = { Child: 'Japan', Root: 'Child' }
  const groups = appProxyGroupsForView(
    live,
    [configured],
    nodes,
    {},
    choices,
    false,
  )
  expect(groups.map((group) => group.displayName)).toEqual(['Root', 'Child'])
  expect(groups[1].now).toBe('Japan')
  const projected = withAppProxyGroups(live, groups, choices)!
  const resolved = resolveMember(projected, groups[0].members[0])
  expect(resolved.kind).toBe('group')
  if (resolved.kind === 'group') {
    expect(resolved.group.name).toBe(privateName('Child'))
    expect(resolved.group.now).toBe('Japan')
  }
  expect(live.groups[1].name).toBe('Child')
  expect(live.groups[1].now).toBe('home')
  expect(live.groups[0].members[0].name).toBe('Child')
})
