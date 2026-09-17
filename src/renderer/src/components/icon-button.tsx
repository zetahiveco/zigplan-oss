import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type IconButtonProps = ComponentProps<typeof Button> & {
  tooltip: string
  tooltipSide?: ComponentProps<typeof TooltipContent>['side']
  children: ReactNode
}

export function IconButton({
  tooltip,
  tooltipSide = 'top',
  children,
  size = 'icon-xs',
  variant = 'ghost',
  type = 'button',
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={300}
        render={<Button type={type} size={size} variant={variant} {...props} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
