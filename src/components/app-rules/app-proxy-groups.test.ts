import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'

import type { AppRoutingGroup } from '@/types/app-routing'
import type { ProxyNodeView } from '@/types/proxy-view'

import { AppProxyGroups } from './app-proxy-groups'

const state = vi.hoisted(() => ({
  groups: [] as AppRoutingGroup[],
  nodes: [] as ProxyNodeView[],
}))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({
    verge: { app_routing: { groups: state.groups }, enable_tun_mode: false },
  }),
}))
vi.mock('@/providers/app-data-context', () => ({
  useProxiesData: () => ({
    proxyView: {
      groups: [
        { name: 'Upstream selector' },
        { name: 'Automatic testing' },
        { name: 'Fallback' },
      ],
      records: Object.fromEntries(
        state.nodes.map((node) => [node.recordId, node]),
      ),
    },
    isProxyViewPending: false,
    isProxyViewError: false,
  }),
  useAppRefreshers: () => ({ refreshProxy: vi.fn() }),
}))
vi.mock('@/services/cmds', () => ({
  matchAppNodes: vi.fn(),
  selectAppGroupNode: vi.fn(),
}))
vi.mock('@/services/notice-service', () => ({ showNotice: { error: vi.fn() } }))
vi.mock('@/services/mutate', () => ({ mutate: vi.fn() }))
vi.mock('@/services/query-client', () => ({
  setCacheData: vi.fn(),
  useQuery: ({ enabled }: { enabled: boolean }) => ({
    data: enabled ? ['home-1', 'home-2'] : undefined,
    isPending: false,
  }),
}))

beforeEach(() => {
  state.groups = [
    {
      id: 'ai',
      name: 'My AI apps',
      apps: [{ kind: 'name', value: 'ai.exe' }],
      enabled: true,
      node_patterns: ['home'],
      target: { kind: 'node', name: 'home-2' },
    },
    {
      id: 'browser',
      name: 'My browsers',
      apps: [],
      enabled: true,
      node_patterns: [],
      target: { kind: 'rule' },
    },
  ]
  state.nodes = ['home-1', 'home-2', 'office-1'].map((name) => ({
    recordId: name,
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
})

it('renders only user APP groups, matching nodes and the saved selection', () => {
  const html = renderToStaticMarkup(createElement(AppProxyGroups))
  for (const value of ['My AI apps', 'My browsers', 'home-1', 'home-2'])
    expect(html).toContain(value)
  for (const value of [
    'Upstream selector',
    'Automatic testing',
    'Fallback',
    'office-1',
  ])
    expect(html).not.toContain(value)
  expect(html.match(/role="radio"/g)).toHaveLength(2)
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
})

it('does not render independent nodes for a rule-delegated group', () => {
  state.groups = state.groups.filter((group) => group.target.kind === 'rule')
  const html = renderToStaticMarkup(createElement(AppProxyGroups))
  expect(html).toContain('My browsers')
  expect(html).toContain('rules.appRouting.ruleGroupSummary')
  expect(html).not.toContain('role="radio"')
})

it('shows setup guidance rather than subscription groups when no APP groups exist', () => {
  state.groups = []
  const html = renderToStaticMarkup(createElement(AppProxyGroups))
  expect(html).toContain('rules.appRouting.emptyGroupsPage')
  expect(html).not.toContain('Upstream selector')
  expect(html).not.toContain('home-1')
})
