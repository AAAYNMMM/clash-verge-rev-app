import { Button, Paper, Stack, Typography } from '@mui/material'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { BaseLoading } from '@/components/base'
import { ProxyGroups } from '@/components/proxy/proxy-groups'
import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import {
  matchAppNodes,
  selectAppGroupNode,
  selectAppRuleNode,
} from '@/services/cmds'
import { mutate } from '@/services/mutate'
import { showNotice } from '@/services/notice-service'
import { setCacheData, useQuery } from '@/services/query-client'
import type {
  ProxyGroupView,
  ProxyViewV1,
  ResolvedProxyMember,
} from '@/types/proxy-view'
import {
  appProxyGroupsForView,
  originalAppRuleGroupName,
} from '@/utils/app-proxy-view'
import { appNodes, nodeTarget, targetKey } from '@/utils/app-routing'
import { appRoutingActive } from '@/utils/proxy-mode'

export const AppProxyGroups = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { verge } = useVerge()
  const { proxyView, isProxyViewPending } = useProxiesData()
  const { refreshProxy } = useAppRefreshers()
  const active = appRoutingActive(verge)
  const selections = verge?.app_routing?.rule_selections
  const groups = verge?.app_routing?.groups
  const nodes = useMemo(() => appNodes(proxyView), [proxyView])
  const nodeNames = useMemo(
    () => [...new Set(nodes.map((node) => node.source.proxyName))].sort(),
    [nodes],
  )
  const fixedGroups = useMemo(
    () =>
      (groups ?? []).filter(
        (group) =>
          group.enabled &&
          group.apps.length > 0 &&
          group.target.kind === 'node',
      ),
    [groups],
  )
  const patterns = fixedGroups.map((group) => [group.id, group.node_patterns])
  const candidates = useQuery({
    queryKey: ['app-group-node-candidates', patterns, nodeNames],
    queryFn: async () => {
      const entries = await Promise.all(
        fixedGroups.map(
          async (group) =>
            [
              group.id,
              await matchAppNodes(group.node_patterns, nodeNames),
            ] as const,
        ),
      )
      return Object.fromEntries(entries)
    },
    enabled: !!proxyView && fixedGroups.length > 0,
    retry: false,
  })
  const visibleGroups = useMemo(
    () =>
      appProxyGroupsForView(
        proxyView,
        groups ?? [],
        nodes,
        candidates.data ?? {},
        selections,
        active,
      ),
    [proxyView, groups, nodes, candidates.data, selections, active],
  )
  const writingRef = useRef(false)
  const requestsRef = useRef(
    new Map<
      string,
      {
        group: ProxyGroupView
        member: ResolvedProxyMember
        fixedId?: string
      }
    >(),
  )

  const select = async (group: ProxyGroupView, member: ResolvedProxyMember) => {
    if (!verge?.app_routing || member.kind === 'unresolved') return
    const original = originalAppRuleGroupName(group.name)
    const fixed = !original
      ? groups?.find((item) => '__CV_APP_' + item.id === group.name)
      : undefined
    if (
      !original &&
      (!fixed || fixed.target.kind !== 'node' || member.kind !== 'node')
    )
      return
    if (!writingRef.current) {
      if (original && group.now === member.ref.name) return
      if (
        fixed &&
        member.kind === 'node' &&
        targetKey(fixed.target) === targetKey(nodeTarget(member.node))
      )
        return
    }
    // Keep the latest pending choice per group without discarding choices for other groups.
    requestsRef.current.set(group.name, { group, member, fixedId: fixed?.id })
    if (writingRef.current) return
    writingRef.current = true
    try {
      while (requestsRef.current.size) {
        const request = requestsRef.current.values().next().value!
        requestsRef.current.delete(request.group.name)
        const { group: current, member: chosen, fixedId } = request
        const rule = originalAppRuleGroupName(current.name)
        try {
          const result = await mutate(
            () =>
              rule
                ? selectAppRuleNode(rule, chosen.ref.name)
                : selectAppGroupNode(
                    fixedId!,
                    nodeTarget(
                      (chosen as Extract<ResolvedProxyMember, { kind: 'node' }>)
                        .node,
                    ),
                  ),
            {
              id: 'patch-verge-config',
              onFulfilled: (routing) => {
                void setCacheData<IVergeConfig>(['getVergeConfig'], (value) =>
                  value ? { ...value, app_routing: routing } : value,
                )
                if (rule)
                  void setCacheData<ProxyViewV1>(['getProxyView'], (value) =>
                    value
                      ? {
                          ...value,
                          groups: value.groups.map((entry) =>
                            entry.name === current.name
                              ? {
                                  ...entry,
                                  now: chosen.ref.name,
                                  ...(entry.type === 'Selector'
                                    ? {}
                                    : { fixed: chosen.ref.name }),
                                }
                              : entry,
                          ),
                        }
                      : value,
                  )
              },
              errorNotice: false,
            },
          )
          if (!result.ok) continue
        } catch (error) {
          showNotice.error(error)
          // An ambiguous backend error needs authoritative state, not a successful-looking local selection.
          void refreshProxy().catch(() => {})
        }
      }
    } finally {
      writingRef.current = false
    }
  }

  if (
    !verge ||
    isProxyViewPending ||
    (fixedGroups.length > 0 && candidates.isPending)
  )
    return <BaseLoading />

  if (!visibleGroups.length) {
    return (
      <Paper variant="outlined" sx={{ m: 1.25, p: 3, textAlign: 'center' }}>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <Typography color="text.secondary">
            {t('rules.appRouting.emptyGroupsPage')}
          </Typography>
          <Button variant="contained" onClick={() => navigate('/app-rules')}>
            {t('rules.appRouting.manageGroups')}
          </Button>
        </Stack>
      </Paper>
    )
  }

  return (
    <ProxyGroups
      mode="app"
      appGroups={visibleGroups}
      onAppSelect={(group, member) => {
        void select(group, member)
      }}
    />
  )
}
