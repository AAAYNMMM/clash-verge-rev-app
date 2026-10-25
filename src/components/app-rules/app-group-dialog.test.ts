import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'

import type { AppRoutingGroup } from '@/types/app-routing'

import { AppGroupDialog } from './app-group-dialog'

const state = vi.hoisted(() => ({
  save: undefined as (() => Promise<void>) | undefined,
  query: vi.fn(),
}))

vi.mock('@mui/material', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mui/material')>()
  return {
    ...actual,
    Dialog: ({ children }: { children: ReactNode }) =>
      createElement('section', null, children),
    Button: (props: import('@mui/material').ButtonProps) => {
      if (props.children === 'rules.appRouting.save')
        state.save = props.onClick as unknown as () => Promise<void>
      return createElement(actual.Button, props)
    },
  }
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/services/cmds', () => ({ matchAppNodes: vi.fn() }))
vi.mock('@/services/notice-service', () => ({
  showNotice: { error: vi.fn() },
}))
vi.mock('@/services/query-client', () => ({
  useQuery: (options: unknown) => {
    state.query(options)
    return { data: [], isPending: false }
  },
}))
vi.mock('./running-app-picker', () => ({ RunningAppPicker: () => null }))

beforeEach(() => {
  state.save = undefined
  state.query.mockClear()
})

it.each(['direct', 'reject'] as const)(
  'edits and saves a %s exit without proxy nodes or node-filter validation',
  async (kind) => {
    const group: AppRoutingGroup = {
      id: 'translator',
      name: 'Translator',
      enabled: true,
      apps: [{ kind: 'name', value: 'youdao.exe' }],
      node_patterns: ['['],
      target: { kind },
    }
    const save = vi.fn(async () => true)
    const close = vi.fn()
    const html = renderToStaticMarkup(
      createElement(AppGroupDialog, {
        group,
        nodes: [],
        saving: false,
        onSave: save,
        onClose: close,
      }),
    )
    for (const mode of ['rule', 'node', 'direct', 'reject'])
      expect(html).toContain(`value="${mode}"`)
    expect(html).not.toContain('rules.appRouting.legacyDirect')
    expect(state.query).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
    await state.save!()
    expect(save).toHaveBeenCalledExactlyOnceWith({
      ...group,
      node_patterns: [],
    })
    expect(close).toHaveBeenCalledOnce()
  },
)
