import {
  selectNodeForGroup,
  getConnections,
  closeConnection,
} from 'tauri-plugin-mihomo-api'
import { expect, it, vi } from 'vitest'

import { useProxySelection } from './use-proxy-selection'

const record = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({ cleanup: false }))
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
}))
vi.mock('@/hooks/use-record-selection', () => ({
  useRecordSelection: () => record,
  useForgetSelection: () => vi.fn(),
}))
vi.mock('@/hooks/use-verge', () => ({
  useVerge: () => ({ verge: { auto_close_connection: state.cleanup } }),
}))
vi.mock('tauri-plugin-mihomo-api', () => ({
  selectNodeForGroup: vi.fn(),
  unfixedProxy: vi.fn(),
  getConnections: vi.fn(),
  closeConnection: vi.fn(),
}))
vi.mock('@/services/cmds', () => ({ syncTrayProxySelection: vi.fn() }))
vi.mock('@/services/notice-service', () => ({ showNotice: { error: vi.fn() } }))
vi.mock('@/services/query-client', () => ({ revalidateQueries: vi.fn() }))

it('applies and records independent group selections while another group is pending', async () => {
  let finishFirst!: () => void
  vi.mocked(selectNodeForGroup)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve
        }),
    )
    .mockResolvedValueOnce(undefined)
  const firstSuccess = vi.fn()
  const secondSuccess = vi.fn()
  const first = useProxySelection({ onSuccess: firstSuccess })
  const second = useProxySelection({ onSuccess: secondSuccess })
  first.changeProxy('Group A', 'Node A')
  second.changeProxy('Group B', 'Node B')
  await vi.waitFor(() =>
    expect(record).toHaveBeenCalledWith('Group B', 'Node B'),
  )
  expect(selectNodeForGroup).toHaveBeenCalledTimes(2)
  expect(firstSuccess).not.toHaveBeenCalled()
  expect(secondSuccess).toHaveBeenCalledOnce()
  finishFirst()
  await vi.waitFor(() =>
    expect(record).toHaveBeenCalledWith('Group A', 'Node A'),
  )
  expect(firstSuccess).toHaveBeenCalledOnce()
})

it('does not close APP connections when the TUN group shares the previous node', async () => {
  state.cleanup = true
  vi.mocked(selectNodeForGroup).mockResolvedValue(undefined)
  vi.mocked(getConnections).mockResolvedValue({
    connections: [
      { id: 'tun-old', chains: ['Japan', 'Traffic'] },
      { id: 'app-old', chains: ['Japan', '__CV_APP_RULE_54726166666963'] },
      { id: 'tun-new', chains: ['Home', 'Traffic'] },
    ],
  } as Awaited<ReturnType<typeof getConnections>>)
  const selection = useProxySelection()
  selection.changeProxy('Traffic', 'Home', 'Japan')
  await vi.waitFor(() =>
    expect(closeConnection).toHaveBeenCalledExactlyOnceWith('tun-old'),
  )
  state.cleanup = false
})
