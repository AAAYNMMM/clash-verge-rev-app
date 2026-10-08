import {
  CheckCircleRounded,
  ExpandLessRounded,
  ExpandMoreRounded,
  RefreshRounded,
  SettingsOutlined,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Collapse,
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'

import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import { matchAppNodes, selectAppGroupNode } from '@/services/cmds'
import { mutate } from '@/services/mutate'
import { showNotice } from '@/services/notice-service'
import { setCacheData, useQuery } from '@/services/query-client'
import type { AppRoutingGroup } from '@/types/app-routing'
import type { ProxyNodeView } from '@/types/proxy-view'
import {
  appNodes,
  findAppNode,
  groupNodeCandidates,
  nodeTarget,
  targetKey,
} from '@/utils/app-routing'

interface GroupProps {
  group: AppRoutingGroup
  nodes: ProxyNodeView[]
  loading: boolean
  unavailable: boolean
  busy: boolean
  pendingKey: string | null
  onSelect: (group: AppRoutingGroup, node: ProxyNodeView) => void
}

const AppProxyGroup = ({
  group,
  nodes,
  loading,
  unavailable,
  busy,
  pendingKey,
  onSelect,
}: GroupProps) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(true)
  const fixedNode = group.target.kind === 'node'
  const names = [...new Set(nodes.map((node) => node.source.proxyName))].sort()
  const filters = group.node_patterns
  const preview = useQuery({
    queryKey: ['matchAppNodes', filters, names],
    queryFn: () => matchAppNodes(filters, names),
    enabled: fixedNode && !loading && !unavailable,
    retry: false,
  })
  const candidates = groupNodeCandidates(group, nodes, preview.data ?? [])
  const waiting =
    fixedNode &&
    !unavailable &&
    (loading || (preview.isPending && !preview.error))
  const missing =
    fixedNode && !loading && !unavailable && !findAppNode(nodes, group.target)
  const selectedKey = targetKey(group.target)
  const label =
    fixedNode && group.target.kind === 'node'
      ? group.target.name
      : t(
          group.target.kind === 'rule'
            ? 'rules.appRouting.ruleMode'
            : 'rules.appRouting.direct',
        )

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        overflow: 'hidden',
        opacity: group.enabled ? 1 : 0.65,
      }}
    >
      <ButtonBase
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        sx={{
          display: 'flex',
          width: '100%',
          textAlign: 'left',
          p: 1.75,
          gap: 1.5,
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography
              variant="subtitle1"
              component="span"
              sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}
            >
              {group.name}
            </Typography>
            {!group.enabled && (
              <Chip size="small" label={t('rules.appRouting.disabledGroup')} />
            )}
          </Stack>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, overflowWrap: 'anywhere' }}
          >
            {t('rules.appRouting.selectedTarget')}: {label}
          </Typography>
          <Typography
            variant="caption"
            component="p"
            color="text.secondary"
            sx={{ mt: 0.5, overflowWrap: 'anywhere' }}
          >
            {group.apps.length
              ? group.apps
                  .map((app) => app.value.split(/[/\\]/).at(-1))
                  .join(' · ')
              : t('rules.appRouting.noApplications')}
          </Typography>
        </Box>
        {fixedNode && (
          <Chip
            size="small"
            label={waiting ? '…' : candidates.length}
            color="primary"
            variant="outlined"
          />
        )}
        {expanded ? <ExpandLessRounded /> : <ExpandMoreRounded />}
      </ButtonBase>
      <Collapse in={expanded}>
        <Stack spacing={1.25} sx={{ px: 1.75, pb: 1.75 }}>
          {group.target.kind === 'rule' && (
            <Alert severity="info">
              {t('rules.appRouting.ruleGroupSummary')}
            </Alert>
          )}
          {group.target.kind === 'direct' && (
            <Alert severity="warning">
              {t('rules.appRouting.legacyDirect')}
            </Alert>
          )}
          {fixedNode && (
            <Typography variant="caption" color="text.secondary">
              {t('rules.appRouting.groupClickHelp')}
            </Typography>
          )}
          {missing && (
            <Alert severity="warning">
              {t('rules.appRouting.missingNode')}
            </Alert>
          )}
          {fixedNode && unavailable && (
            <Alert severity="warning">
              {t('rules.appRouting.nodesUnavailable')}
            </Alert>
          )}
          {fixedNode && preview.error && (
            <Alert severity="error">
              {String(preview.error?.detail ?? preview.error)}
            </Alert>
          )}
          {waiting && (
            <Box sx={{ py: 2, textAlign: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {fixedNode &&
            !waiting &&
            !unavailable &&
            !preview.error &&
            candidates.length === 0 && (
              <Alert severity="info">
                {t('rules.appRouting.noGroupNodes')}
              </Alert>
            )}
          {fixedNode &&
            !waiting &&
            !unavailable &&
            !preview.error &&
            candidates.length > 0 && (
              <Box
                role="radiogroup"
                aria-label={group.name}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr',
                    sm: 'repeat(2, minmax(0, 1fr))',
                  },
                  gap: 1,
                }}
              >
                {candidates.map((node) => {
                  const key = targetKey(nodeTarget(node))
                  const selected = key === selectedKey
                  const pending = pendingKey === JSON.stringify([group.id, key])
                  const delay = node.history.at(-1)?.delay
                  return (
                    <ButtonBase
                      key={key}
                      role="radio"
                      aria-checked={selected}
                      aria-label={
                        node.name +
                        (node.source.kind === 'provider'
                          ? ' · ' + node.source.providerName
                          : '')
                      }
                      disabled={busy || !group.enabled}
                      onClick={() => onSelect(group, node)}
                      sx={(theme) => ({
                        width: '100%',
                        minWidth: 0,
                        textAlign: 'left',
                        justifyContent: 'space-between',
                        p: 1.25,
                        gap: 1,
                        minHeight: 72,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: selected ? 'primary.main' : 'divider',
                        borderLeftWidth: selected ? 3 : 1,
                        bgcolor: selected
                          ? alpha(theme.palette.primary.main, 0.14)
                          : 'background.default',
                        '&:hover': {
                          bgcolor: alpha(theme.palette.primary.main, 0.08),
                        },
                        '&.Mui-disabled': { opacity: 0.65 },
                      })}
                    >
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography
                          variant="body2"
                          component="span"
                          sx={{
                            display: 'block',
                            overflowWrap: 'anywhere',
                            fontWeight: selected ? 600 : 400,
                          }}
                        >
                          {node.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          component="span"
                          color="text.secondary"
                          sx={{ display: 'block', mt: 0.4 }}
                        >
                          {node.type}
                          {node.udp ? ' · UDP' : ''}
                          {node.xudp ? ' · XUDP' : ''}
                        </Typography>
                        {node.source.kind === 'provider' && (
                          <Typography
                            variant="caption"
                            component="span"
                            color="text.secondary"
                            sx={{ display: 'block', overflowWrap: 'anywhere' }}
                          >
                            {node.source.providerName}
                          </Typography>
                        )}
                      </Box>
                      <Stack
                        spacing={0.5}
                        sx={{ alignItems: 'flex-end', flexShrink: 0 }}
                      >
                        {pending ? (
                          <CircularProgress size={18} />
                        ) : selected ? (
                          <CheckCircleRounded
                            fontSize="small"
                            color="primary"
                          />
                        ) : null}
                        {delay !== undefined && (
                          <Typography
                            variant="caption"
                            component="span"
                            color={delay > 0 ? 'success.main' : 'warning.main'}
                          >
                            {delay > 0
                              ? String(delay) + ' ms'
                              : t('rules.appRouting.timeout')}
                          </Typography>
                        )}
                      </Stack>
                    </ButtonBase>
                  )
                })}
              </Box>
            )}
        </Stack>
      </Collapse>
    </Paper>
  )
}

export const AppProxyGroups = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { verge } = useVerge()
  const { proxyView, isProxyViewPending, isProxyViewError } = useProxiesData()
  const { refreshProxy } = useAppRefreshers()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const writingRef = useRef(false)
  const groups = verge?.app_routing?.groups ?? []
  const nodes = appNodes(proxyView)
  const select = async (group: AppRoutingGroup, node: ProxyNodeView) => {
    const key = targetKey(nodeTarget(node))
    if (
      writingRef.current ||
      !group.enabled ||
      verge?.enable_tun_mode ||
      group.target.kind !== 'node' ||
      key === targetKey(group.target)
    )
      return
    writingRef.current = true
    setPendingKey(JSON.stringify([group.id, key]))
    try {
      await mutate(() => selectAppGroupNode(group.id, node.recordId), {
        id: 'patch-verge-config',
        onFulfilled: (routing) => {
          void setCacheData<IVergeConfig>(['getVergeConfig'], (current) =>
            current ? { ...current, app_routing: routing } : current,
          )
        },
        revalidate: [['getVergeConfig'], ['getProxyView']],
        errorNotice: false,
      })
    } catch (error) {
      showNotice.error(error)
    } finally {
      writingRef.current = false
      setPendingKey(null)
    }
  }

  return (
    <Stack spacing={1.5} sx={{ p: 1.25 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t('rules.appRouting.groupsPageHelp')}
        </Typography>
        <Button
          size="small"
          startIcon={<RefreshRounded />}
          disabled={isProxyViewPending || !!pendingKey}
          onClick={() => void refreshProxy()}
        >
          {t('rules.appRouting.refreshNodes')}
        </Button>
      </Stack>
      {!verge ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : groups.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t('rules.appRouting.emptyGroupsPage')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<SettingsOutlined />}
            onClick={() => navigate('/app-rules')}
          >
            {t('rules.appRouting.manageGroups')}
          </Button>
        </Paper>
      ) : (
        groups.map((group) => (
          <AppProxyGroup
            key={group.id}
            group={group}
            nodes={nodes}
            loading={isProxyViewPending}
            unavailable={isProxyViewError}
            busy={pendingKey !== null || verge.enable_tun_mode === true}
            pendingKey={pendingKey}
            onSelect={(group, node) => {
              void select(group, node)
            }}
          />
        ))
      )}
    </Stack>
  )
}
