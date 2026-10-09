import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'

import type { AppRoutingGroup } from '@/types/app-routing'
import type {
  ProxyGroupView,
  ProxyNodeView,
  ResolvedProxyMember,
} from '@/types/proxy-view'

import { AppProxyGroups } from './app-proxy-groups'

const state = vi.hoisted(() => ({
  groups: [] as AppRoutingGroup[],
  nodes: [] as ProxyNodeView[],
  privateCopies: [] as ProxyGroupView[],
  selected: [] as string[],
  active: true,
  baseGroups: [] as ProxyGroupView[],
  renderedGroups: [] as ProxyGroupView[],
  select: undefined as
    | ((group: ProxyGroupView, member: ResolvedProxyMember) => void)
    | undefined,
  patch: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
  coreSelect: vi.fn(async () => {}),
  ruleSelect: vi.fn(),
  fixedSelect: vi.fn(),
  cache: vi.fn(),
  error: vi.fn(),
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
      enable_app_routing: state.active,
      enable_system_proxy: false,
    },
    patchVerge: state.patch,
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
      groups: [...state.baseGroups, ...state.privateCopies],
      records: Object.fromEntries(
        state.nodes.map((node) => [node.recordId, node]),
      ),
      standalone: [],
      providers: [],
    },
    isProxyViewPending: false,
    isProxyViewError: false,
  }),
  useAppRefreshers: () => ({ refreshProxy: state.refresh }),
}))
vi.mock('@/components/base', () => ({
  BaseLoading: () => createElement('p', null, 'Loading'),
}))
vi.mock('@/components/proxy/proxy-groups', () => ({
  ProxyGroups: ({
    mode,
    appGroups,
    onAppSelect,
  }: {
    mode: string
    appGroups: ProxyGroupView[]
    onAppSelect?: (group: ProxyGroupView, member: ResolvedProxyMember) => void
  }) => {
    state.select = onAppSelect
    state.renderedGroups = appGroups
    return createElement(
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
    )
  },
}))
vi.mock('tauri-plugin-mihomo-api', () => ({
  selectNodeForGroup: state.coreSelect,
}))
vi.mock('@/services/cmds', () => ({
  matchAppNodes: vi.fn(),
  selectAppGroupNode: state.fixedSelect,
  selectAppRuleNode: state.ruleSelect,
}))
vi.mock('@/services/notice-service', () => ({
  showNotice: { error: state.error },
}))
vi.mock('@/services/query-client', () => ({
  setCacheData: state.cache,
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
  state.active = true
  state.baseGroups = []
  state.renderedGroups = []
  state.select = undefined
  state.patch.mockClear()
  state.refresh.mockClear()
  state.coreSelect.mockClear()
  state.cache.mockClear()
  state.error.mockClear()
  state.ruleSelect
    .mockReset()
    .mockImplementation(async (name: string, member: string) => ({
      groups: state.groups,
      rule_selections: { [name]: member },
    }))
  state.fixedSelect
    .mockReset()
    .mockImplementation(
      async (id: string, target: AppRoutingGroup['target']) => ({
        groups: state.groups.map((g) => (g.id === id ? { ...g, target } : g)),
      }),
    )
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

it('saves an inactive APP node preference without enabling routing or touching a live selector', async () => {
  state.active = false
  state.groups = state.groups.filter((group) => group.target.kind === 'rule')
  state.baseGroups = [
    {
      ...privateGroup('Main'),
      name: 'Main',
      hidden: false,
      now: 'home-1',
      members: [
        { kind: 'node', name: 'home-1', recordId: 'home-1' },
        { kind: 'node', name: 'home-2', recordId: 'home-2' },
      ],
    },
  ]
  const html = renderToStaticMarkup(createElement(AppProxyGroups))
  expect(html).toContain('data-name="Main"')
  const group = state.renderedGroups[0]
  const node = state.nodes.find((entry) => entry.name === 'home-2')!
  state.select!(group, {
    kind: 'node',
    ref: { kind: 'node', name: 'home-2', recordId: 'home-2' },
    node,
  })
  await vi.waitFor(() =>
    expect(state.ruleSelect).toHaveBeenCalledWith('Main', 'home-2'),
  )
  expect(state.patch).not.toHaveBeenCalled()
  expect(state.refresh).not.toHaveBeenCalled()
  expect(state.coreSelect).not.toHaveBeenCalled()
  expect(state.active).toBe(false)
})

const selectNode = (group: ProxyGroupView, name: string) => {
  const node = state.nodes.find((n) => n.name === name)!
  state.select!(group, {
    kind: 'node',
    ref: { kind: 'node', name, recordId: node.recordId },
    node,
  })
}

it('uses one hot selector command while active without patching or reloading configuration', async () => {
  state.privateCopies = [
    {
      ...privateGroup('Main'),
      now: 'home-1',
      members: state.nodes.map((n) => ({
        kind: 'node',
        name: n.name,
        recordId: n.recordId,
      })),
    },
  ]
  renderToStaticMarkup(createElement(AppProxyGroups))
  selectNode(state.renderedGroups[0], 'home-2')
  await vi.waitFor(() => expect(state.cache).toHaveBeenCalledTimes(2))
  expect(state.ruleSelect).toHaveBeenCalledExactlyOnceWith('Main', 'home-2')
  expect(state.patch).not.toHaveBeenCalled()
  expect(state.coreSelect).not.toHaveBeenCalled()
  expect(state.refresh).not.toHaveBeenCalled()
})

it('sends a fixed node source identity rather than an unstable record index', async () => {
  state.nodes[0].source = {
    kind: 'provider',
    providerName: 'source-two',
    proxyName: 'home-1',
  }
  renderToStaticMarkup(createElement(AppProxyGroups))
  selectNode(state.renderedGroups[0], 'home-1')
  await vi.waitFor(() => expect(state.cache).toHaveBeenCalledOnce())
  expect(state.fixedSelect).toHaveBeenCalledExactlyOnceWith('ai', {
    kind: 'node',
    name: 'home-1',
    provider: 'source-two',
  })
  expect(state.refresh).not.toHaveBeenCalled()
})

it('coalesces queued clicks but still applies the last choice instead of ignoring it', async () => {
  let release!: (value: unknown) => void
  state.ruleSelect.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  state.privateCopies = [{ ...privateGroup('Main'), now: 'home-1' }]
  renderToStaticMarkup(createElement(AppProxyGroups))
  const group = state.renderedGroups[0]
  selectNode(group, 'home-2')
  selectNode(group, 'office-1')
  selectNode(group, 'home-1')
  expect(state.ruleSelect).toHaveBeenCalledOnce()
  release({ groups: state.groups, rule_selections: { Main: 'home-2' } })
  await vi.waitFor(() => expect(state.ruleSelect).toHaveBeenCalledTimes(2))
  expect(state.ruleSelect.mock.calls).toEqual([
    ['Main', 'home-2'],
    ['Main', 'home-1'],
  ])
})

it('does not publish a successful selection on backend failure', async () => {
  state.ruleSelect.mockRejectedValueOnce(Error('disk failed'))
  state.privateCopies = [privateGroup('Main')]
  renderToStaticMarkup(createElement(AppProxyGroups))
  selectNode(state.renderedGroups[0], 'home-2')
  await vi.waitFor(() => expect(state.error).toHaveBeenCalledOnce())
  expect(state.cache).not.toHaveBeenCalled()
  expect(state.refresh).toHaveBeenCalledOnce()
})
