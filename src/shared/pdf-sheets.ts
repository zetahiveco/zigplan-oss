export const PDF_PAGE_SHEET_SEP = '::page::'

export function isPdfDocument(fileType: string, fileName: string): boolean {
  const t = fileType.trim().toLowerCase()
  if (t === 'application/pdf') return true
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined
  return ext === 'pdf'
}

export function pdfPageSelectorName(fileName: string, page: number): string {
  const stem = fileName.replace(/\.pdf$/i, '')
  return `${stem}_page_${page}.pdf`
}

export function pdfPageSheetId(documentId: string, page: number, pageCount: number): string {
  if (pageCount <= 1 || page <= 1) return documentId
  return `${documentId}${PDF_PAGE_SHEET_SEP}${page}`
}

export function parsePdfPageSheetId(id: string): { documentId: string; pageNumber: number } {
  const idx = id.lastIndexOf(PDF_PAGE_SHEET_SEP)
  if (idx === -1) return { documentId: id, pageNumber: 1 }
  const page = Number(id.slice(idx + PDF_PAGE_SHEET_SEP.length))
  if (!Number.isInteger(page) || page < 1) return { documentId: id, pageNumber: 1 }
  return { documentId: id.slice(0, idx), pageNumber: page }
}

/** One scale per file. Falls back to a leftover page scale from older saves. */
export function documentScale(
  scale: unknown,
  pageScales?: Record<string, unknown>
): unknown {
  if (scale != null) return scale
  if (!pageScales) return undefined
  for (const value of Object.values(pageScales)) {
    if (value != null) return value
  }
  return undefined
}
