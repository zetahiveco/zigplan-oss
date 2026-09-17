import type { CostItemRecord, EstimateLineRecord, TakeoffGroupRecord } from './types'

export type EstimateExportRow = {
  takeoffGroup: string
  takeoffItem: string
  takeoffQty: number
  costCode: string
  costItem: string
  unit: string
  unitPrice: number
  qtyPerTakeoff: number
  extendedQty: number
  amount: number
  vendor: string
}

export function buildEstimateExportRows(
  takeoffGroups: TakeoffGroupRecord[],
  costItems: CostItemRecord[],
  lines: EstimateLineRecord[]
): EstimateExportRow[] {
  const costById = new Map(costItems.map((item) => [item.id, item]))
  const rows: EstimateExportRow[] = []
  for (const group of takeoffGroups) {
    for (const item of group.items) {
      const itemLines = lines.filter((line) => line.takeoffItemId === item.id)
      if (itemLines.length === 0) {
        rows.push({
          takeoffGroup: group.name,
          takeoffItem: item.name,
          takeoffQty: item.quantity,
          costCode: '',
          costItem: '',
          unit: '',
          unitPrice: 0,
          qtyPerTakeoff: 0,
          extendedQty: 0,
          amount: 0,
          vendor: ''
        })
        continue
      }
      for (const line of itemLines) {
        const cost = costById.get(line.costItemId)
        const extendedQty = item.quantity * line.quantityPerTakeoff
        const unitPrice = cost?.price ?? 0
        rows.push({
          takeoffGroup: group.name,
          takeoffItem: item.name,
          takeoffQty: item.quantity,
          costCode: cost?.code ?? '',
          costItem: cost?.name ?? '(missing cost item)',
          unit: cost?.unit ?? '',
          unitPrice,
          qtyPerTakeoff: line.quantityPerTakeoff,
          extendedQty,
          amount: extendedQty * unitPrice,
          vendor: cost?.vendorName ?? ''
        })
      }
    }
  }
  return rows
}

function csvEscape(value: string | number): string {
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function estimateRowsToCsv(rows: EstimateExportRow[]): string {
  const header = [
    'Takeoff Group',
    'Takeoff Item',
    'Takeoff Qty',
    'Cost Code',
    'Cost Item',
    'Unit',
    'Unit Price',
    'Cost Qty / Takeoff Qty',
    'Extended Qty',
    'Amount',
    'Vendor'
  ]
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        row.takeoffGroup,
        row.takeoffItem,
        row.takeoffQty,
        row.costCode,
        row.costItem,
        row.unit,
        row.unitPrice,
        row.qtyPerTakeoff,
        row.extendedQty,
        row.amount,
        row.vendor
      ]
        .map(csvEscape)
        .join(',')
    )
  ]
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  lines.push(['', '', '', '', '', '', '', '', 'Total', total, ''].map(csvEscape).join(','))
  return `${lines.join('\n')}\n`
}

export function buildEstimateCsv(
  takeoffGroups: TakeoffGroupRecord[],
  costItems: CostItemRecord[],
  lines: EstimateLineRecord[]
): string {
  return estimateRowsToCsv(buildEstimateExportRows(takeoffGroups, costItems, lines))
}
