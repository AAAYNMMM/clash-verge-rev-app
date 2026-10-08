import { RefreshRounded } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getRunningApps } from '@/services/cmds'
import { useQuery } from '@/services/query-client'
import { applicationKey } from '@/utils/app-routing'

interface Props {
  existing: string[]
  onAdd: (values: string[]) => void
  onClose: () => void
}

export const RunningAppPicker = ({ existing, onAdd, onClose }: Props) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState(() => new Map<string, string>())
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['getRunningApps'],
    queryFn: getRunningApps,
    retry: false,
    revalidateOnMount: true,
  })
  const keyOf = (value: string) =>
    applicationKey(value, OS_PLATFORM === 'win32')
  const alreadyAdded = new Set(existing.map(keyOf))
  const query = search.trim().toLowerCase()
  const visible = (data ?? []).filter((app) =>
    (app.name + '\n' + (app.path ?? '')).toLowerCase().includes(query),
  )
  const chosen = [...selection.values()].filter(
    (value) => !alreadyAdded.has(keyOf(value)),
  )

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t('rules.appRouting.runningApps')}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('rules.appRouting.runningAppsHelp')}
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label={t('rules.appRouting.searchApps')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              startIcon={<RefreshRounded />}
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {t('rules.appRouting.refreshApps')}
            </Button>
          </Stack>
          {error && (
            <Alert severity="error">
              {t('rules.appRouting.processListError')}
            </Alert>
          )}
          {isPending ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <List
              dense
              disablePadding
              sx={{ maxHeight: 360, overflowY: 'auto', minHeight: 120 }}
            >
              {visible.map((app) => {
                const value = app.path ?? app.name
                const key = keyOf(value)
                const existing = alreadyAdded.has(key)
                const checked = existing || selection.has(key)
                return (
                  <ListItemButton
                    key={key}
                    disabled={existing}
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={app.name + ' ' + (app.path ?? '')}
                    onClick={() =>
                      setSelection((current) => {
                        const next = new Map(current)
                        if (next.has(key)) next.delete(key)
                        else next.set(key, value)
                        return next
                      })
                    }
                    sx={{ alignItems: 'flex-start' }}
                  >
                    <Checkbox
                      checked={checked}
                      disableRipple
                      tabIndex={-1}
                      sx={{ pointerEvents: 'none' }}
                    />
                    <ListItemText
                      primary={
                        app.name +
                        ' · ' +
                        t('rules.appRouting.processCount', {
                          count: app.process_count,
                        })
                      }
                      secondary={
                        existing
                          ? t('rules.appRouting.alreadyAdded')
                          : (app.path ??
                            t('rules.appRouting.processNameFallback'))
                      }
                      slotProps={{
                        secondary: { sx: { overflowWrap: 'anywhere' } },
                      }}
                    />
                  </ListItemButton>
                )
              })}
              {visible.length === 0 && !error && (
                <Typography
                  sx={{ p: 3, textAlign: 'center' }}
                  color="text.secondary"
                >
                  {t('rules.appRouting.noRunningApps')}
                </Typography>
              )}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('rules.appRouting.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!chosen.length}
          onClick={() => {
            onAdd(chosen)
            onClose()
          }}
        >
          {t('rules.appRouting.addSelectedApps', { count: chosen.length })}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
