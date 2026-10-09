import { Button, Paper, Stack, Typography } from '@mui/material'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { selectNodeForGroup } from 'tauri-plugin-mihomo-api'

import { BaseLoading } from '@/components/base'
import { ProxyGroups } from '@/components/proxy/proxy-groups'
import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import { matchAppNodes, selectAppGroupNode } from '@/services/cmds'
import { mutate } from '@/services/mutate'
import { showNotice } from '@/services/notice-service'
import { setCacheData, useQuery } from '@/services/query-client'
import type { ProxyGroupView, ResolvedProxyMember } from '@/types/proxy-view'
import {
  appProxyGroupsForView,
  originalAppRuleGroupName,
} from '@/utils/app-proxy-view'
import { appNodes, nodeTarget, targetKey } from '@/utils/app-routing'
import { appRoutingActive } from '@/utils/proxy-mode'

export const AppProxyGroups = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { verge, patchVerge } = useVerge()
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
  const [pending, setPending] = useState(false)
  const writingRef = useRef(false)

  const select = async (group: ProxyGroupView, member: ResolvedProxyMember) => {
    if (
      writingRef.current ||
      !verge?.app_routing ||
      member.kind === 'unresolved'
    )
      return

    const original = originalAppRuleGroupName(group.name)
    const fixed = !original
      ? groups?.find((item) => '__CV_APP_' + item.id === group.name)
      : undefined

    if (original && group.now === member.ref.name) return
    if (
      !original &&
      (!fixed || fixed.target.kind !== 'node' || member.kind !== 'node')
    )
      return
    if (
      fixed &&
      member.kind === 'node' &&
      targetKey(fixed.target) === targetKey(nodeTarget(member.node))
    )
      return

    writingRef.current = true
    setPending(true)
    try {
      if (original) {
        const routing = verge.app_routing
        await patchVerge({
          app_routing: {
            ...routing,
            rule_selections: {
              ...routing.rule_selections,
              [original]: member.ref.name,
            },
          },
        })
        if (active) await selectNodeForGroup(group.name, member.ref.name)
      } else if (fixed && member.kind === 'node') {
        await mutate(() => selectAppGroupNode(fixed.id, member.node.recordId), {
          id: 'patch-verge-config',
          onFulfilled: (routing) => {
            void setCacheData<IVergeConfig>(['getVergeConfig'], (current) =>
              current ? { ...current, app_routing: routing } : current,
            )
          },
          revalidate: [['getVergeConfig'], ['getProxyView']],
          errorNotice: false,
        })
      }
      await refreshProxy()
    } catch (error) {
      showNotice.error(error)
    } finally {
      writingRef.current = false
      setPending(false)
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
        if (!pending) void select(group, member)
      }}
    />
  )
}
