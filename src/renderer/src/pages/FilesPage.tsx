import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { IconButton } from '@/components/icon-button'
import type { DocumentRecord } from '../../../shared/types'
import { isPdfDocument } from '../../../shared/pdf-sheets'
import { desktopApi, saveDocumentPageCount } from '@/lib/desktop-api'
import { getPdfPageCountFromData } from '@/takeoff/pdf-page-count'

const ACCEPT = 'image/png,image/jpeg,image/svg+xml,application/pdf'

function normalizeClientMime(type: string, name: string): string | null {
  const t = type.trim().toLowerCase()
  if (t === 'image/jpg') return 'image/jpeg'
  if (t === 'image/png' || t === 'image/jpeg' || t === 'image/svg+xml' || t === 'application/pdf') return t
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'svg') return 'image/svg+xml'
  return null
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesPage(): React.JSX.Element {
  const { projectId } = useParams()
  const [rows, setRows] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async (id: string): Promise<void> => {
    setRows(await desktopApi().documents.list(id))
  }

  useEffect(() => {
    if (!projectId) return
    void load(projectId)
      .catch((err) => {
        console.error(err)
        toast.error('Could not load files')
      })
      .finally(() => setLoading(false))
  }, [projectId])

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !projectId) return
    const mime = normalizeClientMime(file.type, file.name)
    if (!mime) {
      toast.error('Only PDF, PNG, JPEG, or SVG files are allowed')
      return
    }
    try {
      setUploading(true)
      const data = await file.arrayBuffer()
      const added = await desktopApi().documents.add({
        projectId,
        fileName: file.name,
        fileType: mime,
        data
      })
      if (isPdfDocument(added.fileType, added.fileName)) {
        try {
          const pageCount = await getPdfPageCountFromData(data)
          await saveDocumentPageCount(added.id, pageCount)
        } catch (err) {
          console.error(err)
        }
      }
      toast.success('File added')
      await load(projectId)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Files</h2>
          <p className="text-sm text-muted-foreground">PDF or image files stored on this computer for takeoff.</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(ev) => void onFileChange(ev)} />
          <Button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <FileUp />
            {uploading ? 'Adding…' : 'Add file'}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading files…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet. Add a PDF or image to draw takeoff on it.</p>
        ) : (
          <div className="overflow-hidden border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.fileName}</TableCell>
                    <TableCell>{row.fileType}</TableCell>
                    <TableCell>{formatBytes(row.fileSize)}</TableCell>
                    <TableCell>
                      <IconButton
                        tooltip="Delete file"
                        size="icon-sm"
                        onClick={() => {
                          if (!projectId) return
                          void desktopApi().documents.remove(row.id).then(() => load(projectId))
                        }}
                      >
                        <Trash2 />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
