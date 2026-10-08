import AppsOutlinedIcon from '@mui/icons-material/AppsOutlined'
import { alpha, Box, ButtonBase, ListItem, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link, useMatch } from 'react-router'

import type { SortableItemRenderProps } from '@/components/base/sortable-item'

interface Props {
  label: string
  appLabel: string
  icon: ReactNode[]
  isCollapsed: boolean
  colorful: boolean
  sortable?: SortableItemRenderProps
}

export const LayoutRulesItem = ({
  label,
  appLabel,
  icon,
  isCollapsed,
  colorful,
  sortable,
}: Props) => {
  const rulesSelected = !!useMatch({ path: '/rules', end: true })
  const appSelected = !!useMatch({ path: '/app-rules', end: true })
  const links = [
    {
      to: '/rules',
      label,
      icon: icon[colorful ? 1 : 0],
      selected: rulesSelected,
    },
    {
      to: '/app-rules',
      label: appLabel,
      icon: <AppsOutlinedIcon />,
      selected: appSelected,
    },
  ]

  return (
    <ListItem
      ref={sortable?.ref}
      style={sortable?.style}
      sx={{ maxWidth: 250, mx: 'auto', padding: '4px 0px' }}
    >
      <Box
        ref={sortable?.handleRef}
        role="group"
        aria-label={label}
        sx={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          width: 'calc(100% - 20px)',
          mx: 1.25,
          my: isCollapsed ? 0.75 : 0,
          height: isCollapsed ? 52 : 48,
          direction: 'ltr',
        }}
      >
        {links.map((link, index) => (
          <ButtonBase
            key={link.to}
            component={Link}
            to={link.to}
            title={link.label}
            aria-label={link.label}
            aria-current={link.selected ? 'page' : undefined}
            sx={[
              {
                height: '100%',
                minWidth: 0,
                px: isCollapsed ? 0 : 1.75,
                justifyContent: isCollapsed
                  ? 'center'
                  : index === 0
                    ? 'flex-start'
                    : 'flex-end',
                borderRadius: 2,
                color: 'text.primary',
                '& svg': {
                  width: isCollapsed ? 20 : 24,
                  height: isCollapsed ? 20 : 24,
                },
                '&:hover': { bgcolor: 'action.hover' },
                '&.Mui-focusVisible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: -2,
                },
              },
              ({ palette: { mode, primary } }) => {
                const bgcolor = alpha(
                  primary.main,
                  mode === 'light' ? 0.15 : 0.35,
                )
                return {
                  '&[aria-current="page"]': { bgcolor },
                  '&[aria-current="page"]:hover': { bgcolor },
                }
              },
            ]}
          >
            {link.icon}
          </ButtonBase>
        ))}
        {!isCollapsed && (
          <Typography
            component="span"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              color: 'text.primary',
              fontWeight: 700,
            }}
          >
            {label}
          </Typography>
        )}
      </Box>
    </ListItem>
  )
}
