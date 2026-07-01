import type { ReactNode } from 'react'

import { WorkflowIcon } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** Props for {@link EmptyState}. `action` is optional so the block also works as a plain
 *  read-only placeholder (e.g. "no audits yet") without forcing a call-to-action button. */
export type EmptyStateProps = {
  title?: string
  description?: string
  message?: string
  hint?: string
  action?: ReactNode
}

/** Generic empty-state card: icon + title + description + dashed placeholder area with an
 *  optional message, hint, and action. Adapted from the shadcnstudio empty-state-02 block
 *  (the original demo's CI/CD "Initialize Pipeline" dialog was demo-only scaffolding and has
 *  been replaced with a generic optional `action` slot). */
function EmptyState({
  title = 'Automation',
  description = 'Initialize the automation process by CI/CD',
  message = 'No automation tasks available',
  hint = 'Please check back later or configure your automation settings.',
  action
}: EmptyStateProps) {
  return (
    <Card className='w-full max-w-lg'>
      <CardHeader className='gap-0'>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='rounded-md border border-dashed p-6 text-center'>
          <WorkflowIcon className='text-muted-foreground mx-auto size-12' />
          <p className='mt-2 text-sm font-medium'>{message}</p>
          <p className='text-muted-foreground mt-1 text-sm'>{hint}</p>
          {action ? <div className='mt-4 flex justify-center'>{action}</div> : null}
        </div>
      </CardContent>
    </Card>
  )
}

export default EmptyState
