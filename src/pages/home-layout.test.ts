import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import HomePage from './home'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({
    verge: {
      home_cards: {
        profile: false,
        proxy: false,
        network: false,
        mode: true,
        app: true,
        traffic: false,
        test: false,
        ip: false,
        clashinfo: false,
        systeminfo: false,
      },
    },
  }),
}))
vi.mock('@/hooks/use-profiles', () => ({
  useProfiles: () => ({ current: undefined, mutateProfiles: vi.fn() }),
}))
vi.mock('@/components/base', () => ({
  BasePage: ({ children }: { children: ReactNode }) =>
    createElement('main', null, children),
}))
vi.mock('@/components/home/enhanced-card', () => ({
  EnhancedCard: ({
    title,
    action,
    children,
  }: {
    title: string
    action?: ReactNode
    children: ReactNode
  }) =>
    createElement(
      'section',
      { 'data-title': title },
      createElement('header', null, title, action),
      createElement('article', null, children),
    ),
}))
vi.mock('@/components/home/current-proxy-card', () => ({
  CurrentProxyCard: () => null,
}))
vi.mock('@/components/home/home-profile-card', () => ({
  HomeProfileCard: () => null,
}))
vi.mock('@/components/home/proxy-tun-card', () => ({
  ProxyTunCard: () => null,
}))
vi.mock('@/components/home/enhanced-traffic-stats', () => ({
  EnhancedTrafficStats: () => null,
}))
vi.mock('@/components/home/clash-mode-card', () => ({
  ClashModeCard: () => createElement('p', null, 'Rule / Global / Direct'),
}))
vi.mock('@/components/app-rules/app-routing-toggle', () => ({
  AppRoutingToggle: () =>
    createElement('button', { 'aria-label': 'APP' }, 'APP'),
}))

it('places the single APP switch in the proxy-mode card header, not in a separate card', () => {
  const html = renderToStaticMarkup(createElement(HomePage))
  expect(html).toContain('data-title="home.page.cards.proxyMode"')
  expect(html).toContain(
    '<header>home.page.cards.proxyMode<button aria-label="APP">APP</button></header>',
  )
  expect(html).not.toContain('data-title="rules.appRouting.toggle"')
  expect(html.match(/aria-label="APP"/g)).toHaveLength(1)
})
