import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import ProxyPage from './proxies'

const state = vi.hoisted(() => ({ mode: 'app', chain: false, tun: false }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-clash', () => ({
  useClashMode: () => ({ data: state.mode }),
}))
vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({ verge: { enable_tun_mode: state.tun } }),
}))
vi.mock('@/providers/app-data-context', () => ({
  useClashConfigData: () => ({
    clashConfig: { mode: state.mode === 'app' ? 'rule' : state.mode },
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
  state.mode = 'app'
  state.chain = false
  state.tun = false
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

it.each(['app', 'rule', 'global', 'direct'])(
  'opens the original chain editor in %s mode',
  (mode) => {
    state.mode = mode
    state.chain = true
    const html = renderToStaticMarkup(createElement(ProxyPage))
    expect(html).toContain('proxies.page.actions.toggleChain')
    expect(html).toContain('proxies.page.title.chainMode')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-chain="true"')
    expect(html).toContain(
      'data-mode="' + (mode === 'app' ? 'rule' : mode) + '"',
    )
    expect(html).not.toContain('data-view="app-groups"')
  },
)
