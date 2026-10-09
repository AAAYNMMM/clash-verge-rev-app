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

const appRuleName = (name: string) =>
  APP_RULE_PREFIX +
  Array.from(new TextEncoder().encode(name))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

const previewRuleGroups = (
  view: ProxyViewV1,
  selections: Readonly<Record<string, string>>,
): ProxyGroupView[] => {
  const originals = view.groups.filter(
    (group) => !group.name.startsWith(APP_GROUP_PREFIX),
  )
  if (
    view.global &&
    !originals.some((group) => group.name === view.global?.name)
  )
    originals.push(view.global)
  const aliases = new Map(
    originals.map((group) => [group.name, appRuleName(group.name)]),
  )
  return originals.map((group) => {
    const members = group.members.map((member) =>
      member.kind === 'group'
        ? { ...member, name: aliases.get(member.name) ?? member.name }
        : member,
    )
    const saved = selections[group.name]
    const selected = saved ? (aliases.get(saved) ?? saved) : undefined
    return {
      ...group,
      name: appRuleName(group.name),
      displayName: group.name,
      hidden: group.name === 'GLOBAL',
      members,
      // The TUN selector's current choice is not an APP preference.
      now: members.some((member) => member.name === selected)
        ? selected
        : members[0]?.name,
    }
  })
}

export const withAppProxyGroups = (
  view: ProxyViewV1 | undefined,
  groups: readonly ProxyGroupView[] | undefined,
  selections: Readonly<Record<string, string>> = {},
): ProxyViewV1 | undefined => {
  if (!view || !groups) return view
  const merged = new Map(
    [...previewRuleGroups(view, selections), ...view.groups, ...groups].map(
      (group) => [group.name, group],
    ),
  )
  return { ...view, groups: [...merged.values()] }
}

export const appProxyGroupsForView = (
  view: ProxyViewV1 | undefined,
  routingGroups: readonly AppRoutingGroup[],
  nodes: readonly ProxyNodeView[],
  matches: Readonly<Record<string, readonly string[]>>,
  selections: Readonly<Record<string, string>> = {},
  active = true,
): ProxyGroupView[] => {
  if (!view) return []

  const hasRuleGroup = routingGroups.some(
    (group) =>
      group.enabled && group.apps.length > 0 && group.target.kind === 'rule',
  )
  const ruleGroups = active
    ? view.groups
    : hasRuleGroup
      ? previewRuleGroups(view, selections)
      : []
  const privateRules = ruleGroups.flatMap((group) => {
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
