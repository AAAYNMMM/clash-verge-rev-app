import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'

import { LayoutSidebar } from './layout-sidebar'

const state = vi.hoisted(() => ({
  collapsed: false,
  menuIcon: 'monochrome',
  order: ['/logs', '/app-rules', '/rules', '/'],
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'layout.components.navigation.tabs.rules': '规则',
          'layout.components.navigation.tabs.appRules': 'APP 规则',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}))
vi.mock('@/assets/image/icon_dark.svg?react', () => ({
  default: () => createElement('svg'),
}))
vi.mock('@/assets/image/icon_light.svg?react', () => ({
  default: () => createElement('svg'),
}))
vi.mock('@/assets/image/logo.svg?react', () => ({
  default: () => createElement('svg'),
}))

vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({
    verge: {
      menu_order: state.order,
      menu_icon: state.menuIcon,
      collapse_navbar: state.collapsed,
    },
    mutateVerge: vi.fn(),
    patchVerge: vi.fn(),
  }),
}))
vi.mock(
  '@/pages/_layout/hooks',
  async () => import('@/pages/_layout/hooks/use-nav-menu-order'),
)
vi.mock('@/pages/_navigation', () => ({
  navItems: [
    { path: '/', label: 'home', icon: [] },
    {
      path: '/rules',
      label: 'layout.components.navigation.tabs.rules',
      icon: [
        createElement('svg', { key: 'mono', 'data-rule-icon': 'mono' }),
        createElement('svg', { key: 'color', 'data-rule-icon': 'color' }),
      ],
    },
    {
      path: '/app-rules',
      label: 'layout.components.navigation.tabs.appRules',
      icon: [],
    },
    { path: '/logs', label: 'logs', icon: [] },
  ],
}))
vi.mock('@dnd-kit/react', () => ({
  DragDropProvider: ({ children }: { children: ReactNode }) => children,
  PointerSensor: {},
  KeyboardSensor: {},
}))
vi.mock('@/components/base', () => ({ SortableItem: () => null }))
vi.mock('./layout-traffic', () => ({ LayoutTraffic: () => null }))
vi.mock('./update-button', () => ({ UpdateButton: () => null }))

const render = (path: string) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(LayoutSidebar, {
        isDark: false,
        isCollapsed: state.collapsed,
      }),
    ),
  )
const ruleLinks = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag)

beforeEach(() => {
  state.collapsed = false
  state.menuIcon = 'monochrome'
  state.order = ['/logs', '/app-rules', '/rules', '/']
})

it('merges old saved navigation into one Rules row without removing either route', () => {
  const html = render('/rules')
  expect(html.match(/<li\b/g)).toHaveLength(3)
  const links = ruleLinks(html)
  expect(links).toHaveLength(2)
  expect(links[0]).toContain('href="/rules"')
  expect(links[1]).toContain('href="/app-rules"')
  expect(html).toContain('grid-template-columns:repeat(2, minmax(0, 1fr))')
  expect(html).toContain('pointer-events:none')
  expect(html.match(/>规则<\//g)).toHaveLength(1)
  expect(html).not.toContain('>APP 规则<')
  expect(html.indexOf('>logs<')).toBeLessThan(html.indexOf('href="/rules"'))
  expect(html.indexOf('href="/app-rules"')).toBeLessThan(html.indexOf('>home<'))
})

it.each(['/rules', '/app-rules', '/logs'])(
  'highlights only the current half at %s',
  (path) => {
    const links = ruleLinks(render(path))
    const selected = links.filter((tag) => tag.includes('aria-current="page"'))
    expect(selected).toHaveLength(path === '/logs' ? 0 : 1)
    if (selected.length) expect(selected[0]).toContain('href="' + path + '"')
  },
)

it('keeps both named, focusable links in one row when collapsed with icons disabled', () => {
  state.collapsed = true
  state.menuIcon = 'disable'
  const html = render('/app-rules')
  const links = ruleLinks(html)
  expect(links).toHaveLength(2)
  expect(links[0]).toContain('aria-label="规则"')
  expect(links[1]).toContain('aria-label="APP 规则"')
  expect(links.some((tag) => tag.includes('tabindex="-1"'))).toBe(false)
  expect(html).not.toContain('>规则<')
  expect(html).toContain('data-rule-icon="mono"')
  expect(html).toContain('AppsOutlinedIcon')
  expect(html.match(/<li\b/g)).toHaveLength(3)
})

it('preserves the colorful rule icon and the APP icon in the combined row', () => {
  state.menuIcon = 'colorful'
  const html = render('/rules')
  expect(html).toContain('data-rule-icon="color"')
  expect(html).not.toContain('data-rule-icon="mono"')
  expect(html).toContain('AppsOutlinedIcon')
})
