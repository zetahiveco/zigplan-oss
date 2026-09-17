import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UpdateNotifier } from '@/components/UpdateNotifier'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ProjectShell } from '@/pages/ProjectShell'
import { TakeoffPage } from '@/pages/TakeoffPage'
import { FilesPage } from '@/pages/FilesPage'
import { CostDatabasePage } from '@/pages/CostDatabasePage'
import { EstimationPage } from '@/pages/EstimationPage'

function App(): React.JSX.Element {
  return (
    <TooltipProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectShell />}>
            <Route index element={<Navigate to="takeoff" replace />} />
            <Route path="takeoff" element={<TakeoffPage />} />
            <Route path="estimation" element={<EstimationPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="cost-database" element={<CostDatabasePage />} />
          </Route>
        </Routes>
      </HashRouter>
      <UpdateNotifier />
      <Toaster />
    </TooltipProvider>
  )
}

export default App
