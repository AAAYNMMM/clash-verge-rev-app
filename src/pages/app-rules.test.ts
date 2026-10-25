import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

import AppRulesPage from './app-rules'

const state = vi.hoisted(() => ({ kind: 'direct' as 'direct' | 'reject' }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/components/base', () => ({
  BasePage: ({ children }: { children: import('react').ReactNode }) => children,
}))
vi.mock('@/components/app-rules/app-routing-toggle', () => ({
  AppRoutingToggle: () => null,
}))
vi.mock('@/components/app-rules/app-group-dialog', () => ({
  AppGroupDialog: () => null,
}))
vi.mock('@/hooks/use-clash', () => ({
  useClashMode: () => ({ data: 'global' }),
}))
vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({
    verge: {
      enable_tun_mode: true,
      enable_system_proxy: false,
      enable_app_routing: false,
      app_routing: {
        groups: [
          {
            id: 'translator',
            name: 'Translator',
            enabled: true,
            apps: [{ kind: 'name', value: 'youdao.exe' }],
            node_patterns: [],
            target: { kind: state.kind },
          },
        ],
      },
    },
    patchVerge: vi.fn(),
  }),
}))
vi.mock('@/providers/app-data-context', () => ({
  useProxiesData: () => ({ proxyView: { records: {} } }),
  useAppRefreshers: () => ({ refreshProxy: vi.fn() }),
}))
vi.mock('@/services/notice-service', () => ({ showNotice: { error: vi.fn() } }))

it.each(['direct', 'reject'] as const)(
  'shows the saved %s exit while APP routing is off',
  (kind) => {
    state.kind = kind
    const html = renderToStaticMarkup(createElement(AppRulesPage))
    expect(html).toContain(`rules.appRouting.${kind}`)
    expect(html).not.toContain(
      `rules.appRouting.${kind === 'direct' ? 'reject' : 'direct'}`,
    )
    expect(html).not.toContain('rules.appRouting.missingNode')
  },
)
