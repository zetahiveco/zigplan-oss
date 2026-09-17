import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

if (!GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorker
}

async function pageCountFromLoadingTask(
  loadingTask: ReturnType<typeof getDocument>
): Promise<number> {
  let pdf: PDFDocumentProxy | null = null
  try {
    pdf = await loadingTask.promise
    return Math.max(1, pdf.numPages || 1)
  } finally {
    await pdf?.cleanup().catch(() => undefined)
    await loadingTask.destroy().catch(() => undefined)
  }
}

export async function getPdfPageCountFromData(data: ArrayBuffer | Uint8Array): Promise<number> {
  const src = data instanceof Uint8Array ? data : new Uint8Array(data)
  const bytes = new Uint8Array(src.byteLength)
  bytes.set(src)
  return pageCountFromLoadingTask(getDocument({ data: bytes }))
}

export async function getPdfPageCount(url: string): Promise<number> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not read PDF (${res.status})`)
  return getPdfPageCountFromData(await res.arrayBuffer())
}
