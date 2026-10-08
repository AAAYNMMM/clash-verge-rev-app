import { FolderOpenOutlined } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
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
  nodeTarget,
  parseApplications,
  parseLines,
  targetKey,
} from '@/utils/app-routing'

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
  const [patterns, setPatterns] = useState(group.node_patterns.join('\n'))
  const [target, setTarget] = useState<AppTarget>(group.target)
  const debouncedPatterns = useDebounce(patterns, { wait: 200 })
  const filters = parseLines(debouncedPatterns)
  const names = [
    ...new Set([
      ...nodes.map((node) => node.source.proxyName),
      ...(target.kind === 'node' ? [target.name] : []),
    ]),
  ].sort()
  const preview = useQuery({
    queryKey: ['matchAppNodes', filters, names],
    queryFn: () => matchAppNodes(filters, names),
    retry: false,
  })
  const matched = new Set(preview.data ?? [])
  const candidates = nodes.filter((node) => matched.has(node.source.proxyName))
  const selectedKey = targetKey(target)
  const missing = target.kind === 'node' && !findAppNode(nodes, target)
  const outsideFilter = target.kind === 'node' && !matched.has(target.name)
  const needsSavedOption =
    target.kind === 'node' &&
    !candidates.some((node) => targetKey(nodeTarget(node)) === selectedKey)
  const previewPending = preview.isPending || patterns !== debouncedPatterns
  const invalid =
    !name.trim() || !!preview.error || previewPending || outsideFilter

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
      if (!chosen) return
      const paths = Array.isArray(chosen) ? chosen : [chosen]
      setApps((current) =>
        parseLines([current, ...paths].join('\n')).join('\n'),
      )
    } catch (error) {
      showNotice.error(error)
    }
  }

  const selectTarget = (value: string) => {
    if (value === 'rule' || value === 'direct') {
      setTarget({ kind: value })
      return
    }
    const selected = candidates.find(
      (node) => targetKey(nodeTarget(node)) === value,
    )
    if (selected) setTarget(nodeTarget(selected))
  }

  const save = async () => {
    if (invalid || saving) return
    const success = await onSave({
      ...group,
      name: name.trim(),
      apps: parseApplications(apps),
      node_patterns: parseLines(patterns),
      target,
    })
    if (success) onClose()
  }

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={saving ? undefined : onClose}>
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
            <Stack
              direction="row"
              sx={{
                mb: 1,
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="subtitle2">
                {t('rules.appRouting.applications')}
              </Typography>
              <Button
                size="small"
                startIcon={<FolderOpenOutlined />}
                disabled={saving}
                onClick={chooseFiles}
              >
                {t('rules.appRouting.chooseExecutable')}
              </Button>
            </Stack>
            <TextField
              fullWidth
              multiline
              minRows={3}
              maxRows={7}
              value={apps}
              disabled={saving}
              label={t('rules.appRouting.processes')}
              placeholder={'chrome.exe\nC:\\Apps\\AI\\client.exe'}
              onChange={(event) => setApps(event.target.value)}
              helperText={t('rules.appRouting.appsHelp')}
            />
          </Box>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={5}
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
              disabled={saving}
              onChange={(event) => selectTarget(event.target.value)}
              MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
            >
              <MenuItem value="rule">{t('rules.appRouting.ruleMode')}</MenuItem>
              <MenuItem value="direct">{t('rules.appRouting.direct')}</MenuItem>
              {needsSavedOption && target.kind === 'node' && (
                <MenuItem value={selectedKey} disabled>
                  {target.name} — {t('rules.appRouting.unavailable')}
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
                            ? `${node.history.at(-1)?.delay} ms`
                            : t('rules.appRouting.timeout'))}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Alert severity="info">
            {t(
              target.kind === 'rule'
                ? 'rules.appRouting.ruleHelp'
                : target.kind === 'direct'
                  ? 'rules.appRouting.directHelp'
                  : 'rules.appRouting.manualOnly',
            )}
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('rules.appRouting.cancel')}
        </Button>
        <Button variant="contained" onClick={save} disabled={saving || invalid}>
          {t(saving ? 'rules.appRouting.saving' : 'rules.appRouting.save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
