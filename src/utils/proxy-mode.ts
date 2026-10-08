export const PROXY_MODES = ['app', 'rule', 'global', 'direct'] as const
export type ProxyMode = (typeof PROXY_MODES)[number]

export const parseProxyMode = (
  value?: string | null,
): ProxyMode | undefined => {
  const mode = value?.toLowerCase()
  return PROXY_MODES.find((candidate) => candidate === mode)
}

export const resolveProxyMode = (
  saved?: string | null,
  running?: string | null,
  tunEnabled: boolean = false,
): ProxyMode | undefined => {
  const core = parseProxyMode(running)
  const source = parseProxyMode(saved)
  const resolved =
    source === 'app' && (!core || core === 'rule') ? 'app' : (core ?? source)
  return tunEnabled && resolved === 'app' ? 'rule' : resolved
}

export const coreProxyMode = (mode: ProxyMode) =>
  mode === 'app' ? 'rule' : mode

export const isProxyModeDisabled = (mode: ProxyMode, tunEnabled: boolean) =>
  mode === 'app' && tunEnabled
