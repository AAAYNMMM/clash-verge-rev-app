import {
  AddRounded,
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  DeleteOutlineRounded,
  EditOutlined,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material'
import { nanoid } from 'nanoid'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AppGroupDialog } from '@/components/app-rules/app-group-dialog'
import { AppRoutingToggle } from '@/components/app-rules/app-routing-toggle'
import { BasePage } from '@/components/base'
import { useClashMode } from '@/hooks/use-clash'
import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'
import type { AppRoutingConfig, AppRoutingGroup } from '@/types/app-routing'
import { appNodes, findAppNode } from '@/utils/app-routing'
import {
  appRoutingActive,
  appRoutingAvailable,
  parseProxyMode,
} from '@/utils/proxy-mode'

const EMPTY_ROUTING: AppRoutingConfig = { groups: [] }

const AppRulesPage = () => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const { data: mode } = useClashMode()
  const { proxyView, isProxyViewPending, isProxyViewError } = useProxiesData()
  const { refreshProxy } = useAppRefreshers()
  const appActive = appRoutingActive(verge)
  const appAvailable = appRoutingAvailable(verge)
  const routing = verge?.app_routing ?? EMPTY_ROUTING
  const nodes = appNodes(proxyView)
  const [editing, setEditing] = useState<AppRoutingGroup | null>(null)
  const [deleting, setDeleting] = useState<AppRoutingGroup | null>(null)
  const [saving, setSaving] = useState(false)
  const writingRef = useRef(false)

  const saveRouting = async (next: AppRoutingConfig): Promise<boolean> => {
    if (writingRef.current) return false
    writingRef.current = true
    setSaving(true)
    try {
      await patchVerge({ app_routing: next })
      await Promise.allSettled([refreshProxy()])
      return true
    } catch (error) {
      showNotice.error(error)
      return false
    } finally {
      writingRef.current = false
      setSaving(false)
    }
  }

  const saveGroup = (group: AppRoutingGroup) =>
    saveRouting({
      ...routing,
      groups: routing.groups.some((item) => item.id === group.id)
        ? routing.groups.map((item) => (item.id === group.id ? group : item))
        : [...routing.groups, group],
    })

  const moveGroup = (index: number, offset: number) => {
    const groups = [...routing.groups]
    const other = index + offset
    if (other < 0 || other >= groups.length) return
    ;[groups[index], groups[other]] = [groups[other], groups[index]]
    void saveRouting({ ...routing, groups })
  }

  return (
    <BasePage
      title={t('rules.appRouting.title')}
      header={
        <Stack direction="row" spacing={1}>
          <AppRoutingToggle />
          <Button
            variant="contained"
            size="small"
            startIcon={<AddRounded />}
            disabled={saving || !verge}
            onClick={() =>
              setEditing({
                id: nanoid(),
                name: '',
                enabled: true,
                apps: [],
                node_patterns: [],
                target: { kind: 'rule' },
              })
            }
          >
            {t('rules.appRouting.addGroup')}
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2} sx={{ p: 1 }}>
        <Alert severity="info">{t('rules.appRouting.intro')}</Alert>
        {!appActive && (
          <Alert severity="warning">
            {t(
              appAvailable
                ? 'rules.appRouting.inactive'
                : 'rules.appRouting.tunDisabled',
            )}
          </Alert>
        )}
        <Alert severity="info">{t('rules.appRouting.trafficHelp')}</Alert>
        {isProxyViewError && (
          <Alert severity="warning">
            {t('rules.appRouting.nodesUnavailable')}
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              alignItems: { sm: 'center' },
              justifyContent: 'space-between',
            }}
          >
            <Box>
              <Typography variant="subtitle2">
                {t('rules.appRouting.unmatched')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('rules.appRouting.priority')}
              </Typography>
            </Box>
            <Chip
              color="primary"
              variant="outlined"
              label={t(`proxies.page.modes.${parseProxyMode(mode) ?? 'rule'}`)}
            />
          </Stack>
        </Paper>
        {routing.groups.length === 0 && (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              {t('rules.appRouting.empty')}
            </Typography>
          </Paper>
        )}
        {routing.groups.map((group, index) => {
          const selectedNode = findAppNode(nodes, group.target)
          const missing =
            group.target.kind === 'node' &&
            !isProxyViewPending &&
            !isProxyViewError &&
            !selectedNode
          const delay = selectedNode?.history.at(-1)?.delay
          const timedOut = selectedNode && delay === 0
          return (
            <Paper
              key={group.id}
              variant="outlined"
              sx={{ p: 2, opacity: group.enabled ? 1 : 0.65 }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{ flexWrap: 'wrap', alignItems: 'center' }}
                useFlexGap
              >
                <Chip size="small" label={index + 1} />
                <Typography
                  variant="subtitle1"
                  sx={{ flex: 1, minWidth: 100, overflowWrap: 'anywhere' }}
                >
                  {group.name}
                </Typography>
                <Tooltip title={t('rules.appRouting.moveUp')}>
                  <span>
                    <IconButton
                      size="small"
                      aria-label={t('rules.appRouting.moveUp')}
                      disabled={saving || index === 0}
                      onClick={() => moveGroup(index, -1)}
                    >
                      <ArrowUpwardRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('rules.appRouting.moveDown')}>
                  <span>
                    <IconButton
                      size="small"
                      aria-label={t('rules.appRouting.moveDown')}
                      disabled={saving || index === routing.groups.length - 1}
                      onClick={() => moveGroup(index, 1)}
                    >
                      <ArrowDownwardRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <IconButton
                  size="small"
                  aria-label={t('rules.appRouting.editGroup')}
                  disabled={saving}
                  onClick={() => setEditing(group)}
                >
                  <EditOutlined fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  aria-label={t('rules.appRouting.deleteGroup')}
                  disabled={saving}
                  onClick={() => setDeleting(group)}
                >
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
                <Switch
                  checked={group.enabled}
                  disabled={saving}
                  slotProps={{
                    input: { 'aria-label': t('rules.appRouting.enabled') },
                  }}
                  onChange={(_, enabled) => {
                    void saveGroup({ ...group, enabled })
                  }}
                />
              </Stack>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                >
                  {group.apps.length
                    ? group.apps.map((app) => app.value).join(' · ')
                    : t('rules.appRouting.noApplications')}
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <Typography variant="body2">
                    {t('rules.appRouting.selectedTarget')}:
                  </Typography>
                  <Chip
                    size="small"
                    color={missing || timedOut ? 'warning' : 'primary'}
                    variant="outlined"
                    label={
                      group.target.kind === 'node'
                        ? group.target.name
                        : t(
                            group.target.kind === 'rule'
                              ? 'rules.appRouting.ruleMode'
                              : 'rules.appRouting.direct',
                          )
                    }
                  />
                  {group.target.kind === 'node' && (
                    <Typography variant="caption" color="text.secondary">
                      {group.target.provider ??
                        t('rules.appRouting.currentProfile')}
                    </Typography>
                  )}
                </Stack>
                {group.target.kind === 'node' &&
                  group.node_patterns.length > 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ overflowWrap: 'anywhere' }}
                    >
                      {t('rules.appRouting.nodePatterns')}:{' '}
                      {group.node_patterns.join(' | ')}
                    </Typography>
                  )}
                {(missing || timedOut) && group.enabled && (
                  <Alert severity="warning">
                    {t(
                      missing
                        ? 'rules.appRouting.missingNode'
                        : 'rules.appRouting.failedNode',
                    )}
                  </Alert>
                )}
                <Button
                  size="small"
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => setEditing(group)}
                  disabled={saving}
                >
                  {t('rules.appRouting.selectNode')}
                </Button>
              </Stack>
            </Paper>
          )
        })}
        <Typography variant="caption" color="text.secondary">
          {t('rules.appRouting.connectionHelp')}
        </Typography>
      </Stack>
      {editing && (
        <AppGroupDialog
          key={editing.id}
          group={editing}
          nodes={nodes}
          saving={saving}
          onSave={saveGroup}
          onClose={() => setEditing(null)}
        />
      )}
      <Dialog
        open={deleting !== null}
        onClose={saving ? undefined : () => setDeleting(null)}
      >
        <DialogTitle>{t('rules.appRouting.deleteGroup')}</DialogTitle>
        <DialogContent>
          {t('rules.appRouting.deleteConfirm', { name: deleting?.name ?? '' })}
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setDeleting(null)}>
            {t('rules.appRouting.cancel')}
          </Button>
          <Button
            color="error"
            disabled={saving}
            onClick={async () => {
              if (
                await saveRouting({
                  ...routing,
                  groups: routing.groups.filter(
                    (group) => group.id !== deleting?.id,
                  ),
                })
              )
                setDeleting(null)
            }}
          >
            {t('rules.appRouting.deleteGroup')}
          </Button>
        </DialogActions>
      </Dialog>
    </BasePage>
  )
}

export default AppRulesPage
