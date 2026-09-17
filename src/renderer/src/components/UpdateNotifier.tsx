import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { desktopApi } from '@/lib/desktop-api'
import type { UpdateAvailableInfo, UpdateStatus } from '../../../shared/types'

export function UpdateNotifier(): React.JSX.Element {
  const loadingToastId = useRef<string | number | null>(null)
  const [update, setUpdate] = useState<UpdateAvailableInfo | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const dismissLoading = (): void => {
      if (loadingToastId.current != null) {
        toast.dismiss(loadingToastId.current)
        loadingToastId.current = null
      }
    }

    const unsubscribe = desktopApi().updates.onStatus((status: UpdateStatus) => {
      if (status.phase === 'checking') {
        dismissLoading()
        loadingToastId.current = toast.loading('Checking for updates…')
        return
      }

      dismissLoading()

      if (status.phase === 'skipped') {
        return
      }

      if (status.phase === 'latest') {
        if (status.source === 'manual') {
          toast.success(`You're up to date (v${status.version})`)
        }
        return
      }

      if (status.phase === 'error') {
        if (status.source === 'manual') {
          toast.error(status.message)
        } else {
          toast.message('Could not check for updates', { description: status.message })
        }
        return
      }

      setUpdate(status.update)
      setOpen(true)
    })

    return () => {
      dismissLoading()
      unsubscribe()
    }
  }, [])

  const download = (): void => {
    if (!update) return
    const current = update
    setOpen(false)
    void desktopApi()
      .updates.download(current.downloadUrl)
      .then(() => {
        toast.success(`Downloading ${current.downloadName}`)
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Could not open download')
      })
  }

  const skip = (): void => {
    if (!update) return
    const tag = update.tag
    setOpen(false)
    setUpdate(null)
    void desktopApi()
      .updates.skip(tag)
      .then(() => {
        toast.message('Update skipped for this session')
      })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update available</AlertDialogTitle>
          <AlertDialogDescription>
            {update
              ? `${update.name} (v${update.version}) is available. Download the installer for your platform, or skip until the next time you open Zigplan.`
              : 'A newer version of Zigplan is available.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={skip}>Skip</AlertDialogCancel>
          <AlertDialogAction onClick={download}>Download</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
