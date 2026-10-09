import { AltRouteRounded } from '@mui/icons-material'
import { Box, Button } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import { appRoutingActive, appRoutingAvailable } from '@/utils/proxy-mode'

interface AppRoutingToggleProps {
  onEnabled?: () => void
  onDisabled?: () => void
  onActiveSelect?: () => void
  selected?: boolean
  grouped?: boolean
}

export const AppRoutingToggle = ({
  onEnabled,
  onDisabled,
  onActiveSelect,
  selected,
  grouped = false,
}: AppRoutingToggleProps) => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const [pending, setPending] = useState(false)
  const active = appRoutingActive(verge)
  const available = appRoutingAvailable(verge)
  const current = selected ?? active

  const toggle = useLockFn(async () => {
    if (!available || pending) return
    // APP and the three Mihomo exit modes are independent. Selecting the APP
    // page must not turn off an overlay that is already enabled.
    if (active && onActiveSelect && !current) {
      onActiveSelect()
      return
    }
    setPending(true)
    try {
      await patchVerge({ enable_app_routing: !active })
      if (active) onDisabled?.()
      else onEnabled?.()
    } catch (error) {
      showNotice.error(error)
    } finally {
      setPending(false)
    }
  })

  return (
    <Button
      size="small"
      startIcon={grouped ? undefined : <AltRouteRounded fontSize="small" />}
      variant={current ? 'contained' : 'outlined'}
      aria-label={t('rules.appRouting.toggle')}
      aria-pressed={current}
      disabled={!available || pending}
      title={t(
        available
          ? 'rules.appRouting.overlayHelp'
          : 'rules.appRouting.tunDisabled',
      )}
      onClick={toggle}
      sx={{ textTransform: 'none', ...(grouped && { minWidth: 76, gap: 0.5 }) }}
    >
      APP
      {grouped && active && !current && (
        <Box
          component="span"
          aria-label={t('rules.appRouting.toggle')}
          sx={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            bgcolor: 'success.main',
          }}
        />
      )}
    </Button>
  )
}
