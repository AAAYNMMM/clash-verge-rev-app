import {
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { selectNodeForGroup } from 'tauri-plugin-mihomo-api'

import { useVerge } from '@/hooks/use-verge'
import { useAppRefreshers, useProxiesData } from '@/providers/app-data-context'
import { showNotice } from '@/services/notice-service'
import type { ProxyGroupView } from '@/types/proxy-view'
import { appRoutingActive } from '@/utils/proxy-mode'

const RULE_PREFIX = '__CV_APP_RULE_'

const originalName = (name: string) => {
  if (!name.startsWith(RULE_PREFIX)) return null
  const hex = name.slice(RULE_PREFIX.length)
  if (!hex || hex.length % 2 || !/^[0-9a-f]+$/.test(hex)) return null
  try {
    return new TextDecoder().decode(
      Uint8Array.from(hex.match(/.{2}/g) ?? [], (part) => parseInt(part, 16)),
    )
  } catch {
    return null
  }
}

const memberLabel = (name: string) => originalName(name) ?? name

export const AppRuleSelectors = () => {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const { proxyView } = useProxiesData()
  const { refreshProxy } = useAppRefreshers()
  const [pending, setPending] = useState<string | null>(null)
  const writingRef = useRef(false)
  const routing = verge?.app_routing
  const enabled = appRoutingActive(verge)
  const ruleEnabled = routing?.groups.some(
    (group) =>
      group.enabled && group.apps.length > 0 && group.target.kind === 'rule',
  )
  if (!ruleEnabled) return null

  const privateGroups = (proxyView?.groups ?? [])
    .filter((group) => originalName(group.name) !== null)
    .filter((group) => group.type.toLowerCase() === 'selector')

  const select = async (
    group: ProxyGroupView,
    original: string,
    member: string,
  ) => {
    if (!enabled || writingRef.current || !routing || group.now === member)
      return
    writingRef.current = true
    setPending(group.name)
    try {
      await patchVerge({
        app_routing: {
          ...routing,
          rule_selections: {
            ...routing.rule_selections,
            [original]: member,
          },
        },
      })
      await selectNodeForGroup(group.name, member)
      await refreshProxy()
    } catch (error) {
      showNotice.error(error)
    } finally {
      writingRef.current = false
      setPending(null)
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {t('rules.appRouting.independentRuleGroups')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('rules.appRouting.independentRuleHelp')}
        </Typography>
        {!privateGroups.length && (
          <Typography variant="body2" color="text.secondary">
            {t('rules.appRouting.ruleGroupsUnavailable')}
          </Typography>
        )}
        {privateGroups.map((group) => {
          const original = originalName(group.name)
          if (!original) return null
          const options = group.members.filter(
            (member) => member.kind !== 'unresolved',
          )
          const selected = options.some((member) => member.name === group.now)
            ? group.now
            : ''
          return (
            <Stack
              key={group.name}
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ alignItems: { sm: 'center' } }}
            >
              <Typography
                variant="body2"
                sx={{ flex: 1, minWidth: 120, overflowWrap: 'anywhere' }}
              >
                {original}
              </Typography>
              <FormControl size="small" sx={{ flex: 2, minWidth: 180 }}>
                <Select
                  value={selected}
                  displayEmpty
                  aria-label={original}
                  disabled={!enabled || pending !== null}
                  onChange={(event) =>
                    void select(group, original, event.target.value)
                  }
                  renderValue={(value) =>
                    value
                      ? memberLabel(value)
                      : t('rules.appRouting.ruleNodeNotSelected')
                  }
                >
                  {options.map((member) => (
                    <MenuItem
                      key={
                        member.kind === 'node' ? member.recordId : member.name
                      }
                      value={member.name}
                    >
                      {memberLabel(member.name)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          )
        })}
      </Stack>
    </Paper>
  )
}
