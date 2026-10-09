import type { AppRoutingGroup } from '@/types/app-routing'
import type {
  ProxyGroupView,
  ProxyNodeView,
  ProxyViewV1,
} from '@/types/proxy-view'

import { findAppNode, groupNodeCandidates } from './app-routing'

const APP_RULE_PREFIX = '__CV_APP_RULE_'
const APP_GROUP_PREFIX = '__CV_APP_'

export const originalAppRuleGroupName = (name: string): string | null => {
  if (!name.startsWith(APP_RULE_PREFIX)) return null
  const hex = name.slice(APP_RULE_PREFIX.length)
  if (!hex || hex.length % 2 || !/^[\da-f]+$/.test(hex)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(hex.match(/.{2}/g) ?? [], (part) => parseInt(part, 16)),
    )
  } catch {
    return null
  }
}

export const displayAppProxyName = (name: string): string =>
  originalAppRuleGroupName(name) ?? name

export const appProxyGroupsForView = (
  view: ProxyViewV1 | undefined,
  routingGroups: readonly AppRoutingGroup[],
  nodes: readonly ProxyNodeView[],
  matches: Readonly<Record<string, readonly string[]>>,
): ProxyGroupView[] => {
  if (!view) return []

  const privateRules = view.groups.flatMap((group) => {
    const original = originalAppRuleGroupName(group.name)
    // Mihomo's synthetic GLOBAL is a routing primitive, not a selectable APP
    // category. Keep it in the running config if subscription rules require it.
    if (!original || original === 'GLOBAL') return []
    return [{ ...group, displayName: original, hidden: false }]
  })

  const fixedGroups: ProxyGroupView[] = routingGroups.flatMap((group) => {
    if (!group.enabled || !group.apps.length || group.target.kind !== 'node')
      return []

    const candidates = groupNodeCandidates(
      group,
      [...nodes],
      matches[group.id] ?? [],
    )
    const selected = findAppNode([...nodes], group.target)
    const selectedName = selected?.source.proxyName ?? group.target.name
    return [
      {
        name: `${APP_GROUP_PREFIX}${group.id}`,
        displayName: group.name,
        selectedRecordId: selected?.recordId ?? null,
        type: 'Selector',
        alive: true,
        now: selectedName,
        udp: true,
        xudp: false,
        tfo: false,
        mptcp: false,
        smux: false,
        history: [],
        members: candidates.map((node) => ({
          kind: 'node' as const,
          name: node.source.proxyName,
          recordId: node.recordId,
        })),
      },
    ]
  })

  return [...privateRules, ...fixedGroups]
}
