import {
  DirectionsRounded,
  LanguageRounded,
  MultipleStopRounded,
} from '@mui/icons-material'
import { Box, Paper, Stack, Typography } from '@mui/material'
import { useLockFn } from 'ahooks'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BaseConfig } from 'tauri-plugin-mihomo-api'

import { AppRoutingToggle } from '@/components/app-rules/app-routing-toggle'
import { useClashMode, useRuntimeConfig } from '@/hooks/use-clash'
import { useVerge } from '@/hooks/use-verge'
import {
  useAppRefreshers,
  useClashConfigData,
  useCoreDataStatus,
} from '@/providers/app-data-context'
import { patchClashMode } from '@/services/cmds'
import { mutate } from '@/services/mutate'
import { showNotice } from '@/services/notice-service'
import { setCacheData } from '@/services/query-client'
import type { TranslationKey } from '@/types/generated/i18n-keys'
import {
  coreProxyMode,
  appRoutingActive,
  parseProxyMode as toClashMode,
  PROXY_MODES as CLASH_MODES,
  resolveProxyMode,
  type ProxyMode as ClashMode,
} from '@/utils/proxy-mode'

const MODE_META: Record<
  ClashMode,
  { label: TranslationKey; description: TranslationKey }
> = {
  rule: {
    label: 'home.components.clashMode.labels.rule',
    description: 'home.components.clashMode.descriptions.rule',
  },
  global: {
    label: 'home.components.clashMode.labels.global',
    description: 'home.components.clashMode.descriptions.global',
  },
  direct: {
    label: 'home.components.clashMode.labels.direct',
    description: 'home.components.clashMode.descriptions.direct',
  },
}

const MODE_ICONS: Record<ClashMode, ReactNode> = {
  rule: <MultipleStopRounded fontSize="small" />,
  global: <LanguageRounded fontSize="small" />,
  direct: <DirectionsRounded fontSize="small" />,
}

export const ClashModeCard = () => {
  const { t } = useTranslation()
  const { clashConfig } = useClashConfigData()
  const { verge } = useVerge()
  const appActive = appRoutingActive(verge)
  const modeDisabled = () => !verge
  const { isCoreDataPending } = useCoreDataStatus()
  const { refreshClashConfig } = useAppRefreshers()

  const [optimisticMode, setOptimisticMode] = useState<ClashMode | null>(null)

  const controllerMode = toClashMode(clashConfig?.mode)
  const needFallback = !controllerMode
  const { data: runtimeConfig, isPending: isRuntimeConfigPending } =
    useRuntimeConfig(needFallback)
  const runtimeMode = toClashMode(runtimeConfig?.mode)
  const {
    data: backendMode,
    isPending: isBackendModePending,
    refetch: refetchBackendMode,
  } = useClashMode()
  // Saved config is refreshed on mode changes; runtime config may be stale.
  const fallbackMode = toClashMode(backendMode) ?? runtimeMode

  const resolvedMode =
    resolveProxyMode(backendMode, controllerMode, appActive) ?? fallbackMode
  const currentMode = optimisticMode ?? resolvedMode

  const modeDescription = currentMode
    ? appActive
      ? t('rules.appRouting.defaultModeHelp', {
          mode: t(MODE_META[currentMode].label),
        })
      : t(MODE_META[currentMode].description)
    : isCoreDataPending || isRuntimeConfigPending || isBackendModePending
      ? '\u00A0'
      : t('home.components.clashMode.errors.communication')

  const onChangeMode = useLockFn(async (mode: ClashMode) => {
    if (mode === currentMode || modeDisabled()) return

    setOptimisticMode(mode)
    try {
      await mutate(() => patchClashMode(mode), {
        id: 'patch-clash-mode',
        errorNotice: false,
      })
    } catch (error) {
      setOptimisticMode(null)
      showNotice.error(error)
      return
    }

    // Write through the live cache to avoid flashing the old mode during refetch.
    setCacheData<BaseConfig>(['getClashConfig'], (old) =>
      old ? { ...old, mode: coreProxyMode(mode, appActive) } : old,
    )
    await setCacheData(['getClashMode'], mode)
    await Promise.allSettled([refreshClashConfig(), refetchBackendMode()])
    setOptimisticMode(null)
  })

  const buttonStyles = (mode: ClashMode) => ({
    cursor: modeDisabled() ? 'not-allowed' : 'pointer',
    border: 0,
    font: 'inherit',
    '&:disabled': { opacity: 0.45 },
    flex: 1,
    minWidth: 0,
    px: 1,
    py: 1.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0.5,
    bgcolor: mode === currentMode ? 'primary.main' : 'background.paper',
    color: mode === currentMode ? 'primary.contrastText' : 'text.primary',
    borderRadius: 1.5,
    transition: 'all 0.2s ease-in-out',
    position: 'relative',
    overflow: 'visible',
    '&:not(:disabled):hover': {
      transform: 'translateY(-1px)',
      boxShadow: 1,
    },
    '&:not(:disabled):active': {
      transform: 'translateY(1px)',
    },
    '&::after':
      mode === currentMode
        ? {
            content: '""',
            position: 'absolute',
            bottom: -16,
            left: '50%',
            width: 2,
            height: 16,
            bgcolor: 'primary.main',
            transform: 'translateX(-50%)',
          }
        : {},
  })

  const descriptionStyles = {
    width: '95%',
    textAlign: 'center',
    color: 'text.secondary',
    p: 0.8,
    borderRadius: 1,
    borderColor: 'primary.main',
    borderWidth: 1,
    borderStyle: 'solid',
    backgroundColor: 'background.paper',
    wordBreak: 'break-word',
    hyphens: 'auto',
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <Box sx={{ alignSelf: 'flex-start', mt: 1 }}>
        <AppRoutingToggle />
      </Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          display: 'flex',
          justifyContent: 'center',
          py: 1,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {CLASH_MODES.map((mode) => (
          <Paper
            key={mode}
            component="button"
            type="button"
            disabled={modeDisabled()}
            aria-pressed={mode === currentMode}
            elevation={mode === currentMode ? 2 : 0}
            onClick={() => onChangeMode(mode)}
            sx={buttonStyles(mode)}
          >
            {MODE_ICONS[mode]}
            <Typography
              variant="body2"
              sx={{
                textTransform: 'capitalize',
                fontWeight: mode === currentMode ? 600 : 400,
              }}
            >
              {t(MODE_META[mode].label)}
            </Typography>
          </Paper>
        ))}
      </Stack>

      <Box
        sx={{
          width: '100%',
          my: 1,
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        <Typography variant="caption" component="div" sx={descriptionStyles}>
          {modeDescription}
          {appActive && (
            <Box sx={{ mt: 0.5 }}>{t('rules.appRouting.overlayHelp')}</Box>
          )}
        </Typography>
      </Box>
    </Box>
  )
}
