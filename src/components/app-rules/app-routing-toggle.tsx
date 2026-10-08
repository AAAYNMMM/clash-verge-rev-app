import { AppsRounded } from '@mui/icons-material'
import { Button } from '@mui/material'
import { useLockFn } from 'ahooks'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useVerge } from '@/hooks/use-verge'
import { showNotice } from '@/services/notice-service'
import { appRoutingActive, appRoutingAvailable } from '@/utils/proxy-mode'

export const AppRoutingToggle = ({ onEnabled }: { onEnabled?: () => void }) => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const [pending, setPending] = useState(false)
  const active = appRoutingActive(verge)
  const available = appRoutingAvailable(verge)
  const toggle = useLockFn(async () => {
    if (!available || pending) return
    setPending(true)
    try {
      await patchVerge({ enable_app_routing: !active })
      if (!active) onEnabled?.()
    } catch (error) {
      showNotice.error(error)
    } finally {
      setPending(false)
    }
  })
  return (
    <Button
      size="small"
      startIcon={<AppsRounded fontSize="small" />}
      variant={active ? 'contained' : 'outlined'}
      aria-label={t('rules.appRouting.toggle')}
      aria-pressed={active}
      disabled={!available || pending}
      title={t(
        available
          ? 'rules.appRouting.overlayHelp'
          : 'rules.appRouting.tunDisabled',
      )}
      onClick={toggle}
    >
      APP
    </Button>
  )
}
