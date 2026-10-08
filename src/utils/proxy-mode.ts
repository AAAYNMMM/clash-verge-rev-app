export const PROXY_MODES = ['rule', 'global', 'direct'] as const
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
  appActive: boolean = false,
): ProxyMode | undefined => {
  const core = parseProxyMode(running)
  const source = parseProxyMode(saved === 'app' ? 'rule' : saved)
  // APP overlays use the rule engine even when the user's default exit is GLOBAL.
  return appActive && core === 'rule' ? (source ?? core) : (core ?? source)
}

export const coreProxyMode = (mode: ProxyMode, appActive = false): ProxyMode =>
  appActive ? 'rule' : mode

export const appRoutingAvailable = (verge?: Partial<IVergeConfig>) =>
  verge?.enable_tun_mode === true && verge.enable_system_proxy !== true

export const appRoutingActive = (verge?: Partial<IVergeConfig>) =>
  verge?.enable_app_routing === true && appRoutingAvailable(verge)
