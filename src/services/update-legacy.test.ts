import { expect, it, vi } from 'vitest'

import { checkUpdateSafe } from './update'

const state = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: state.fetch }))
vi.mock('@root/package.json', () => ({ version: '2.5.8' }))

it('offers 2.5.10 to a v2.5.8 installation', async () => {
  state.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ tag_name: 'v2.5.10' }),
  })
  expect(await checkUpdateSafe()).toEqual({
    available: true,
    version: '2.5.10',
    body: '',
  })
})
