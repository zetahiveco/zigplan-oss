import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder, FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ProjectRecord } from '../../../shared/types'
import { desktopApi } from '@/lib/desktop-api'
import { formatDate } from '@/lib/format-date'
import logoFull from '@/assets/brand/logo-full.svg'

export function ProjectsPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<ProjectRecord | null>(null)
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<ProjectRecord | null>(null)
  const lastClick = useRef<{ id: string; at: number } | null>(null)

  const load = async (): Promise<void> => {
    const rows = await desktopApi().projects.list()
    setProjects([...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  }

  useEffect(() => {
    void load()
      .catch((err) => {
        console.error(err)
        toast.error(err instanceof Error ? err.message : 'Could not load projects')
      })
      .finally(() => setLoading(false))
  }, [])

  const createProject = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Project name is required')
      return
    }
    try {
      const project = await desktopApi().projects.create(trimmed)
      setCreateOpen(false)
      setName('')
      await load()
      navigate(`/projects/${project.id}/takeoff`)
    } catch (err) {
      console.error(err)
      toast.error('Could not create project')
    }
  }

  const saveEdit = async (): Promise<void> => {
    if (!editing) return
    const trimmed = editName.trim()
    if (!trimmed) {
      toast.error('Project name is required')
      return
    }
    if (trimmed === editing.name) {
      setEditing(null)
      return
    }
    try {
      await desktopApi().projects.update(editing.id, trimmed)
      setEditing(null)
      await load()
      toast.success('Project renamed')
    } catch (err) {
      console.error(err)
      toast.error('Could not rename project')
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return
    try {
      await desktopApi().projects.remove(deleting.id)
      setDeleting(null)
      await load()
      toast.success('Project deleted')
    } catch (err) {
      console.error(err)
      toast.error('Could not delete project')
    }
  }

  const openProject = (project: ProjectRecord): void => {
    const now = Date.now()
    const prev = lastClick.current
    const isDouble = prev && prev.id === project.id && now - prev.at < 400
    lastClick.current = { id: project.id, at: now }
    if (!isDouble) return
    navigate(`/projects/${project.id}/takeoff`)
  }

  return (
    <div className="flex min-h-svh flex-col bg-[#f6f6f6]">
      <header className="sticky-header flex items-center justify-between px-8 py-4">
        <img src={logoFull} alt="Zigplan" className="h-8" />
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus />
          Add New
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Projects</h1>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 border border-dashed bg-card p-16 text-center">
            <FolderKanban className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No projects yet. Add one to start takeoff.</p>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus />
              Add New
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer gap-3 p-4 transition hover:border-primary/40 hover:shadow-sm"
                onClick={() => openProject(project)}
              >
                <div className="flex aspect-video items-center justify-center bg-muted">
                  <Folder className="size-16 text-muted-foreground" strokeWidth={1.25} />
                </div>
                <div className="flex items-start gap-1">
                  {editing?.id === project.id ? (
                    <Input
                      className="h-7 flex-1"
                      value={editName}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') void saveEdit()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                      onBlur={() => void saveEdit()}
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{project.name}</p>
                      <p className="text-xs text-muted-foreground" title={new Date(project.updatedAt).toLocaleString()}>
                        {formatDate(project.updatedAt)}
                      </p>
                    </div>
                  )}
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditing(project)
                      setEditName(project.name)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleting(project)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void createProject()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createProject()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `“${deleting.name}” and its takeoff, files, and cost data will be removed.` : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
