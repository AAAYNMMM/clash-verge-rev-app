import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import ProxyPage from './proxies'

const state = vi.hoisted(() => ({
  mode: 'global',
  chain: false,
  tun: true,
  app: true,
  system: false,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-clash', () => ({
  useClashMode: () => ({ data: state.mode }),
}))
vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({
    verge: {
      enable_tun_mode: state.tun,
      enable_app_routing: state.app,
      enable_system_proxy: state.system,
    },
  }),
}))
vi.mock('@/providers/app-data-context', () => ({
  useClashConfigData: () => ({
    clashConfig: {
      mode: state.app && state.tun && !state.system ? 'rule' : state.mode,
    },
  }),
  useAppRefreshers: () => ({ refreshClashConfig: vi.fn() }),
}))
vi.mock('@/services/cmds', () => ({
  getRuntimeProxyChainConfig: vi.fn(),
  patchClashMode: vi.fn(),
  updateProxyChainConfigInRuntime: vi.fn(),
}))
vi.mock('@/services/mutate', () => ({ mutate: vi.fn() }))
vi.mock('@/services/notice-service', () => ({ showNotice: { error: vi.fn() } }))
vi.mock('@/components/base', () => ({
  BasePage: ({
    title,
    header,
    children,
  }: {
    title: ReactNode
    header: ReactNode
    children: ReactNode
  }) =>
    createElement(
      'main',
      null,
      createElement('h1', null, title),
      header,
      children,
    ),
  TooltipIcon: () => null,
}))
vi.mock('@/components/proxy/provider-button', () => ({
  ProviderButton: () => null,
}))
vi.mock('@/components/app-rules/app-proxy-groups', () => ({
  AppProxyGroups: () => createElement('section', { 'data-view': 'app-groups' }),
}))
vi.mock('@/components/proxy/proxy-groups', () => ({
  ProxyGroups: ({
    mode,
    isChainMode,
  }: {
    mode: string
    isChainMode: boolean
  }) =>
    createElement('section', {
      'data-view': 'proxy-groups',
      'data-mode': mode,
      'data-chain': isChainMode,
    }),
}))

beforeEach(() => {
  state.mode = 'global'
  state.app = true
  state.system = false
  state.chain = false
  state.tun = true
  vi.stubGlobal('localStorage', {
    getItem: (key: string) =>
      key === 'proxy-chain-mode-enabled' ? String(state.chain) : null,
  })
})
afterEach(() => vi.unstubAllGlobals())

it('restores the chain button without replacing the normal APP groups view', () => {
  const html = renderToStaticMarkup(createElement(ProxyPage))
  expect(html).toContain('proxies.page.actions.toggleChain')
  expect(html).toContain('aria-pressed="false"')
  expect(html).not.toContain('rules.appRouting.manageGroups')
  expect(html).toContain('data-view="app-groups"')
  expect(html).not.toContain('data-view="proxy-groups"')
})

it.each(['rule', 'global', 'direct'])(
  'opens the original chain editor in %s mode',
  (mode) => {
    state.mode = mode
    state.chain = true
    const html = renderToStaticMarkup(createElement(ProxyPage))
    expect(html).toContain('proxies.page.actions.toggleChain')
    expect(html).toContain('proxies.page.title.chainMode')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-chain="true"')
    expect(html).toContain('data-mode="' + mode + '"')
    expect(html).not.toContain('data-view="app-groups"')
  },
)

it('shows APP and Global as independently enabled and keeps a default-exit view', () => {
  const html = renderToStaticMarkup(createElement(ProxyPage))
  expect(html).toContain(
    'aria-label="rules.appRouting.toggle" aria-pressed="true"',
  )
  expect(html).toContain('rules.appRouting.defaultExit')
  expect(html).toContain('proxies.page.modes.global')
  expect(html).toContain('data-view="app-groups"')
})

it.each([
  { tun: false, system: false },
  { tun: true, system: true },
])('disables APP with incompatible transport settings %j', (transport) => {
  Object.assign(state, transport)
  const html = renderToStaticMarkup(createElement(ProxyPage))
  expect(html).not.toContain('data-view="app-groups"')
  expect(html).toContain('data-mode="global"')
  expect(html).toContain('rules.appRouting.tunDisabled')
  expect(html).toContain(
    'aria-label="rules.appRouting.toggle" aria-pressed="false"',
  )
})
