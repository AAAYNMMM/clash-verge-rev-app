export interface AppMatcher {
  kind: 'name' | 'path'
  value: string
}

export type AppTarget =
  | { kind: 'rule' }
  | { kind: 'direct' }
  | { kind: 'node'; name: string; provider?: string | null }

export interface AppRoutingGroup {
  id: string
  name: string
  enabled: boolean
  apps: AppMatcher[]
  node_patterns: string[]
  target: AppTarget
}

export interface AppRoutingConfig {
  groups: AppRoutingGroup[]
  rule_selections?: Record<string, string>
}

export interface RunningApp {
  name: string
  path: string | null
  process_count: number
}
