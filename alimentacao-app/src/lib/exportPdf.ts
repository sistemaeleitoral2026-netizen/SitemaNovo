import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

type Cell = string | number | boolean | null | undefined

function cellText(value: Cell) {
  if (value == null) return ''
  return String(value)
}

/**
 * PDF em A4 com tabela responsiva:
 * - poucas colunas → retrato
 * - muitas colunas → paisagem + fonte menor
 * - texto quebra na célula
 */
export function downloadPdfTable(opts: {
  filename: string
  title: string
  subtitle?: string
  headers: string[]
  rows: Cell[][]
  orientation?: 'portrait' | 'landscape'
}) {
  const colCount = opts.headers.length
  const orientation = opts.orientation ?? (colCount > 8 ? 'landscape' : 'portrait')
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10

  const titleSize = orientation === 'landscape' ? 12 : 13
  const bodySize = colCount > 12 ? 6.5 : colCount > 9 ? 7.5 : 8.5
  const headSize = bodySize + 0.5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(titleSize)
  doc.setTextColor(20, 38, 75)
  doc.text(opts.title, margin, 12)

  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80, 90, 110)
    doc.text(opts.subtitle, margin, 17)
  }

  const startY = opts.subtitle ? 20 : 16
  const body = opts.rows.map((row) => opts.headers.map((_, i) => cellText(row[i])))

  autoTable(doc, {
    startY,
    head: [opts.headers],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: bodySize,
      cellPadding: 1.2,
      overflow: 'linebreak',
      valign: 'top',
      textColor: [30, 35, 45],
      lineColor: [210, 218, 230],
      lineWidth: 0.15,
      minCellHeight: 5,
    },
    headStyles: {
      fillColor: [33, 73, 144],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: headSize,
      halign: 'left',
    },
    alternateRowStyles: {
      fillColor: [246, 248, 252],
    },
    margin: { left: margin, right: margin, top: margin, bottom: 12 },
    tableWidth: 'auto',
    horizontalPageBreak: false,
    didDrawPage: (data) => {
      const page = data.pageNumber
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(120, 130, 145)
      doc.text(
        `Página ${page} · A4 ${orientation === 'landscape' ? 'paisagem' : 'retrato'}`,
        pageW / 2,
        pageH - 5,
        { align: 'center' },
      )
    },
  })

  const base = opts.filename.replace(/\.pdf$/i, '').replace(/\.xlsx$/i, '')
  doc.save(`${base}.pdf`)
}
