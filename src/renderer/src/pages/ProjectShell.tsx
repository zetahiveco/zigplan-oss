import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Calculator, ChevronLeft, Database, FolderOpen, PenTool } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProjectRecord } from '../../../shared/types'
import { desktopApi } from '@/lib/desktop-api'
import logo from '@/assets/brand/logo.svg'

const SECTIONS = [
  { to: 'takeoff', label: 'Takeoff', icon: PenTool },
  { to: 'estimation', label: 'Estimation', icon: Calculator },
  { to: 'files', label: 'Files', icon: FolderOpen },
  { to: 'cost-database', label: 'Cost Database', icon: Database }
] as const

export function ProjectShell(): React.JSX.Element {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [project, setProject] = useState<ProjectRecord | null>(null)

  useEffect(() => {
    if (!projectId) return
    void desktopApi().projects
      .list()
      .then((rows) => {
        const next = rows.find((row) => row.id === projectId) ?? null
        setProject(next)
        if (!next) {
          toast.error('Project not found')
          navigate('/')
        }
      })
      .catch((err) => {
        console.error(err)
        toast.error('Could not load project')
      })
  }, [projectId, navigate])

  const current = SECTIONS.find((section) => location.pathname.endsWith(`/${section.to}`)) ?? SECTIONS[0]
  const CurrentIcon = current.icon

  return (
    <div className="flex h-svh min-h-0 flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ChevronLeft />
            Projects
          </Button>
          <img src={logo} alt="" className="size-6" />
          <h1 className="truncate text-sm font-semibold">{project?.name ?? 'Project'}</h1>
        </div>
        <Select
          value={current.to}
          onValueChange={(value) => {
            if (value) navigate(`/projects/${projectId}/${value}`)
          }}
        >
          <SelectTrigger className="min-w-44">
            <CurrentIcon />
            <SelectValue>{current.label}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            {SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <SelectItem key={section.to} value={section.to}>
                  <Icon />
                  {section.label}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
