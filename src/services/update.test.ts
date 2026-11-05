import { beforeEach, expect, it, vi } from 'vitest'

import { checkUpdateSafe } from './update'

const state = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: state.fetch }))
vi.mock('@root/package.json', () => ({ version: '2.5.8+1' }))

beforeEach(() => state.fetch.mockReset())

it.each(['v2.5.8', 'v2.5.8.1', 'v2.5.7'])(
  'does not offer older or equal release %s',
  async (tag_name) => {
    state.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name }),
    })
    expect(await checkUpdateSafe()).toBeNull()
  },
)

it('returns a newer stable release and notes', async () => {
  state.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ tag_name: 'v2.5.10', body: 'Release notes' }),
  })
  expect(await checkUpdateSafe()).toEqual({
    available: true,
    version: '2.5.10',
    body: 'Release notes',
  })
})

it('reports a failed request instead of reporting the latest version', async () => {
  state.fetch.mockResolvedValue({ ok: false, status: 403 })
  await expect(checkUpdateSafe()).rejects.toThrow('HTTP 403')
})

it('rejects a release with an invalid tag', async () => {
  state.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ tag_name: 'updater' }),
  })
  await expect(checkUpdateSafe()).rejects.toThrow('invalid version')
})
