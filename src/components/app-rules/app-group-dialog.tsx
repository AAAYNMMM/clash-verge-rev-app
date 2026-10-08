import { FolderOpenOutlined, PlaylistAddRounded } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { open } from '@tauri-apps/plugin-dialog'
import { useDebounce } from 'ahooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { matchAppNodes } from '@/services/cmds'
import { showNotice } from '@/services/notice-service'
import { useQuery } from '@/services/query-client'
import type { AppRoutingGroup, AppTarget } from '@/types/app-routing'
import type { ProxyNodeView } from '@/types/proxy-view'
import {
  findAppNode,
  groupRouteFields,
  mergeApplications,
  nodeFilters,
  nodeTarget,
  parseApplications,
  targetKey,
} from '@/utils/app-routing'

import { RunningAppPicker } from './running-app-picker'

interface Props {
  group: AppRoutingGroup
  nodes: ProxyNodeView[]
  saving: boolean
  onSave: (group: AppRoutingGroup) => Promise<boolean>
  onClose: () => void
}

export const AppGroupDialog = ({
  group,
  nodes,
  saving,
  onSave,
  onClose,
}: Props) => {
  const { t } = useTranslation()
  const [name, setName] = useState(group.name)
  const [apps, setApps] = useState(
    group.apps.map((app) => app.value).join('\n'),
  )
  const [manual, setManual] = useState(false)
  const [picking, setPicking] = useState(false)
  const [routeMode, setRouteMode] = useState<'rule' | 'node' | null>(
    group.target.kind === 'direct' ? null : group.target.kind,
  )
  const [selectedNode, setSelectedNode] = useState<AppTarget | null>(
    group.target.kind === 'node' ? group.target : null,
  )
  const [patterns, setPatterns] = useState(group.node_patterns.join('\n'))
  const debouncedPatterns = useDebounce(patterns, { wait: 200 })
  const filters = nodeFilters(debouncedPatterns)
  const names = [
    ...new Set([
      ...nodes.map((node) => node.source.proxyName),
      ...(selectedNode?.kind === 'node' ? [selectedNode.name] : []),
    ]),
  ].sort()
  const preview = useQuery({
    queryKey: ['matchAppNodes', filters, names],
    queryFn: () => matchAppNodes(filters, names),
    retry: false,
    enabled: routeMode === 'node',
  })
  const matched = new Set(preview.data ?? [])
  const candidates = nodes.filter((node) => matched.has(node.source.proxyName))
  const selectedKey = selectedNode ? targetKey(selectedNode) : ''
  const missing =
    selectedNode?.kind === 'node' && !findAppNode(nodes, selectedNode)
  const outsideFilter =
    selectedNode?.kind === 'node' && !matched.has(selectedNode.name)
  const needsSavedOption =
    selectedNode?.kind === 'node' &&
    !candidates.some((node) => targetKey(nodeTarget(node)) === selectedKey)
  const previewPending =
    preview.isPending || !preview.data || patterns !== debouncedPatterns
  const invalid =
    !name.trim() ||
    routeMode === null ||
    (routeMode === 'node' &&
      (selectedNode?.kind !== 'node' ||
        !!preview.error ||
        previewPending ||
        outsideFilter))
  const applications = parseApplications(
    mergeApplications(apps, [], OS_PLATFORM === 'win32'),
  )

  const addApps = (values: string[]) =>
    setApps((current) =>
      mergeApplications(current, values, OS_PLATFORM === 'win32'),
    )
  const chooseFiles = async () => {
    try {
      const chosen = await open({
        multiple: true,
        directory: false,
        filters:
          OS_PLATFORM === 'win32'
            ? [
                {
                  name: t('rules.appRouting.applications'),
                  extensions: ['exe'],
                },
              ]
            : undefined,
      })
      if (chosen) addApps(Array.isArray(chosen) ? chosen : [chosen])
    } catch (error) {
      showNotice.error(error)
    }
  }
  const save = async () => {
    if (invalid || saving) return
    const target =
      routeMode === 'rule' ? { kind: 'rule' as const } : selectedNode
    if (!target || target.kind === 'direct') return
    const success = await onSave({
      ...group,
      name: name.trim(),
      apps: applications,
      ...groupRouteFields(target, patterns),
    })
    if (success) onClose()
  }

  return (
    <>
      <Dialog
        open
        fullWidth
        maxWidth="sm"
        onClose={saving ? undefined : onClose}
      >
        <DialogTitle>{t('rules.appRouting.editGroup')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              label={t('rules.appRouting.groupName')}
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('rules.appRouting.applications')}
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ flexWrap: 'wrap', mb: 1 }}
              >
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PlaylistAddRounded />}
                  disabled={saving}
                  onClick={() => setPicking(true)}
                >
                  {t('rules.appRouting.chooseRunningApps')}
                </Button>
                <Button
                  size="small"
                  startIcon={<FolderOpenOutlined />}
                  disabled={saving}
                  onClick={chooseFiles}
                >
                  {t('rules.appRouting.chooseExecutable')}
                </Button>
              </Stack>
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ flexWrap: 'wrap', mb: 1 }}
              >
                {applications.map((app) => (
                  <Tooltip key={app.value} title={app.value}>
                    <Chip
                      label={app.value.split(/[/\\]/).at(-1)}
                      size="small"
                      disabled={saving}
                      onDelete={() =>
                        setApps(
                          applications
                            .filter((item) => item.value !== app.value)
                            .map((item) => item.value)
                            .join('\n'),
                        )
                      }
                    />
                  </Tooltip>
                ))}
                {!applications.length && (
                  <Typography variant="body2" color="text.secondary">
                    {t('rules.appRouting.noApplications')}
                  </Typography>
                )}
              </Stack>
              <Button
                size="small"
                disabled={saving}
                onClick={() => setManual((value) => !value)}
                aria-expanded={manual}
              >
                {t('rules.appRouting.manualApplications')}
              </Button>
              <Collapse in={manual}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={5}
                  value={apps}
                  disabled={saving}
                  label={t('rules.appRouting.processes')}
                  sx={{ mt: 1 }}
                  onChange={(event) => setApps(event.target.value)}
                />
              </Collapse>
              <Typography
                variant="caption"
                component="p"
                color="text.secondary"
                sx={{ mt: 1 }}
              >
                {t('rules.appRouting.appsHelp')}
              </Typography>
            </Box>
            <FormControl disabled={saving}>
              <FormLabel id="app-route-mode-label">
                {t('rules.appRouting.routeMode')}
              </FormLabel>
              <RadioGroup
                row
                aria-labelledby="app-route-mode-label"
                value={routeMode ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'rule' || value === 'node') setRouteMode(value)
                }}
              >
                <FormControlLabel
                  value="rule"
                  control={<Radio />}
                  label={t('rules.appRouting.ruleMode')}
                />
                <FormControlLabel
                  value="node"
                  control={<Radio />}
                  label={t('rules.appRouting.fixedNode')}
                />
              </RadioGroup>
            </FormControl>
            {routeMode === null && (
              <Alert severity="warning">
                {t('rules.appRouting.legacyDirect')}
              </Alert>
            )}
            {routeMode === 'rule' && (
              <Alert severity="info">{t('rules.appRouting.ruleHelp')}</Alert>
            )}
            {routeMode === 'node' && (
              <>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  maxRows={4}
                  value={patterns}
                  disabled={saving}
                  label={t('rules.appRouting.nodePatterns')}
                  placeholder="(?i)residential|家宽"
                  error={!!preview.error}
                  onChange={(event) => setPatterns(event.target.value)}
                  helperText={
                    preview.error
                      ? String(preview.error?.detail ?? preview.error)
                      : t('rules.appRouting.patternsHelp')
                  }
                />
                <Typography variant="caption" color="text.secondary">
                  {previewPending
                    ? t('rules.appRouting.loading')
                    : t('rules.appRouting.matchedNodes', {
                        count: candidates.length,
                      })}
                </Typography>
                <FormControl fullWidth>
                  <InputLabel id="app-group-target-label">
                    {t('rules.appRouting.selectedTarget')}
                  </InputLabel>
                  <Select
                    labelId="app-group-target-label"
                    label={t('rules.appRouting.selectedTarget')}
                    value={selectedKey}
                    disabled={saving || !!preview.error}
                    onChange={(event) => {
                      const node = candidates.find(
                        (node) =>
                          targetKey(nodeTarget(node)) === event.target.value,
                      )
                      if (node) setSelectedNode(nodeTarget(node))
                    }}
                    MenuProps={{
                      slotProps: { paper: { sx: { maxHeight: 360 } } },
                    }}
                  >
                    <MenuItem value="" disabled>
                      {t('rules.appRouting.chooseNode')}
                    </MenuItem>
                    {needsSavedOption && selectedNode?.kind === 'node' && (
                      <MenuItem value={selectedKey} disabled>
                        {selectedNode.name} —{' '}
                        {t('rules.appRouting.unavailable')}
                      </MenuItem>
                    )}
                    {candidates.map((node) => (
                      <MenuItem
                        key={targetKey(nodeTarget(node))}
                        value={targetKey(nodeTarget(node))}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{ overflowWrap: 'anywhere' }}
                          >
                            {node.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {node.source.kind === 'provider'
                              ? node.source.providerName
                              : t('rules.appRouting.currentProfile')}
                            {' · '}
                            {node.type}
                            {node.history.length > 0 &&
                              ' · ' +
                                (node.history.at(-1)?.delay
                                  ? String(node.history.at(-1)?.delay) + ' ms'
                                  : t('rules.appRouting.timeout'))}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Alert severity="info">
                  {t('rules.appRouting.manualOnly')}
                </Alert>
                {missing && (
                  <Alert severity="warning">
                    {t('rules.appRouting.missingNode')}
                  </Alert>
                )}
                {!previewPending && outsideFilter && (
                  <Alert severity="warning">
                    {t('rules.appRouting.outsideFilter')}
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            {t('rules.appRouting.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving || invalid}
          >
            {t(saving ? 'rules.appRouting.saving' : 'rules.appRouting.save')}
          </Button>
        </DialogActions>
      </Dialog>
      {picking && (
        <RunningAppPicker
          existing={applications.map((app) => app.value)}
          onAdd={addApps}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}
