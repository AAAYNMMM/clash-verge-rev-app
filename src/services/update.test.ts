import { beforeEach, expect, it, vi } from 'vitest'

import { checkUpdateSafe } from './update'

const state = vi.hoisted(() => ({ check: vi.fn() }))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: state.check }))
vi.mock('@root/package.json', () => ({ version: '2.5.8+1' }))

beforeEach(() => state.check.mockReset())

it.each(['2.5.8', '2.5.8+0', '2.5.8+1', '2.5.7'])(
  'does not replace the numeric revision with %s',
  async (version) => {
    const update = { version, close: vi.fn() }
    state.check.mockResolvedValue(update)
    expect(await checkUpdateSafe()).toBeNull()
    expect(update.close).toHaveBeenCalledOnce()
  },
)

it.each(['2.5.8+2', '2.5.9'])('accepts newer release %s', async (version) => {
  const update = { version, close: vi.fn() }
  state.check.mockResolvedValue(update)
  expect(await checkUpdateSafe()).toBe(update)
  expect(update.close).not.toHaveBeenCalled()
})
