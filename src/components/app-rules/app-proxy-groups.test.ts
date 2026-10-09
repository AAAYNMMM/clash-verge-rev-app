import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'

import type { AppRoutingGroup } from '@/types/app-routing'
import type { ProxyGroupView, ProxyNodeView } from '@/types/proxy-view'

import { AppProxyGroups } from './app-proxy-groups'

const state = vi.hoisted(() => ({
  groups: [] as AppRoutingGroup[],
  nodes: [] as ProxyNodeView[],
  privateCopies: [] as ProxyGroupView[],
  selected: [] as string[],
}))

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({
    verge: {
      app_routing: { groups: state.groups },
      enable_tun_mode: true,
      enable_app_routing: true,
      enable_system_proxy: false,
    },
    patchVerge: vi.fn(),
  }),
}))
vi.mock('@/providers/app-data-context', () => ({
  useProxiesData: () => ({
    proxyView: {
      schemaVersion: 1,
      orderSource: 'runtime',
      providerState: 'ready',
      global: null,
      direct: 'DIRECT',
      groups: [
        { name: 'Default TUN selector', type: 'Selector' },
        ...state.privateCopies,
      ],
      records: Object.fromEntries(
        state.nodes.map((node) => [node.recordId, node]),
      ),
      standalone: [],
      providers: [],
    },
    isProxyViewPending: false,
    isProxyViewError: false,
  }),
  useAppRefreshers: () => ({ refreshProxy: vi.fn() }),
}))
vi.mock('@/components/base', () => ({
  BaseLoading: () => createElement('p', null, 'Loading'),
}))
vi.mock('@/components/proxy/proxy-groups', () => ({
  ProxyGroups: ({
    mode,
    appGroups,
  }: {
    mode: string
    appGroups: ProxyGroupView[]
  }) =>
    createElement(
      'section',
      { 'data-mode': mode },
      ...appGroups.map((group) =>
        createElement(
          'div',
          {
            key: group.name,
            'data-name': group.displayName,
            'data-now': group.now,
            'data-count': group.members.length,
          },
          ...group.members.map((member) =>
            createElement('span', { key: member.name }, member.name),
          ),
        ),
      ),
    ),
}))
vi.mock('@/services/cmds', () => ({
  matchAppNodes: vi.fn(),
  selectAppGroupNode: vi.fn(),
}))
vi.mock('@/services/notice-service', () => ({ showNotice: { error: vi.fn() } }))
vi.mock('@/services/mutate', () => ({ mutate: vi.fn() }))
vi.mock('@/services/query-client', () => ({
  setCacheData: vi.fn(),
  useQuery: () => ({
    data: { ai: ['home-1', 'home-2'] },
    isPending: false,
  }),
}))

const privateGroup = (name: string): ProxyGroupView => ({
  name:
    '__CV_APP_RULE_' +
    Array.from(new TextEncoder().encode(name))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''),
  type: 'Selector',
  alive: true,
  now: 'Japan normal',
  hidden: true,
  udp: true,
  xudp: false,
  tfo: false,
  mptcp: false,
  smux: false,
  history: [],
  members: [{ kind: 'node', name: 'Japan normal', recordId: 'jp' }],
})

beforeEach(() => {
  state.selected = []
  state.privateCopies = []
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
      apps: [{ kind: 'name', value: 'chrome.exe' }],
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

it('renders a fixed-node APP group in the same proxy-group list as copied rule groups', () => {
  state.privateCopies = [privateGroup('PROXY')]
  const html = renderToStaticMarkup(createElement(AppProxyGroups))
  expect(html).toContain('data-mode="app"')
  expect(html).toContain('data-name="My AI apps"')
  expect(html).toContain('data-name="PROXY"')
  expect(html).toContain('data-now="home-2"')
  expect(html).toContain('home-1')
  expect(html).toContain('home-2')
  expect(html).not.toContain('office-1')
  expect(html).not.toContain('Default TUN selector')
})

it('hides the copied GLOBAL group while preserving all other APP rule groups', () => {
  state.privateCopies = [privateGroup('GLOBAL'), privateGroup('Auto Select')]
  const html = renderToStaticMarkup(createElement(AppProxyGroups))
  expect(html).toContain('data-name="Auto Select"')
  expect(html).not.toContain('data-name="GLOBAL"')
})

it('shows the management guidance when no active APP groups are configured', () => {
  state.groups = []
  const html = renderToStaticMarkup(createElement(AppProxyGroups))
  expect(html).toContain('rules.appRouting.emptyGroupsPage')
  expect(html).not.toContain('data-mode="app"')
})

it('does not display disabled fixed-node groups in the live proxy view', () => {
  state.groups[0].enabled = false
  const html = renderToStaticMarkup(createElement(AppProxyGroups))
  expect(html).not.toContain('data-name="My AI apps"')
})
