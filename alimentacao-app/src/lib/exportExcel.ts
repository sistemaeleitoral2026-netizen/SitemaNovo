import * as XLSX from 'xlsx'

/** Baixa planilha Excel (.xlsx) com cabeçalhos e colunas já separados. */
export function downloadExcelSheet(opts: {
  filename: string
  sheetName?: string
  headers: string[]
  rows: Array<Array<string | number | boolean | null | undefined>>
}) {
  const sheetName = (opts.sheetName || 'Dados').slice(0, 31)
  const aoa: Array<Array<string | number | boolean>> = [
    opts.headers,
    ...opts.rows.map((row) =>
      row.map((cell) => {
        if (cell == null) return ''
        return cell
      }),
    ),
  ]

  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  // Largura aproximada por coluna (ajuda a abrir já legível no Excel).
  worksheet['!cols'] = opts.headers.map((header, colIdx) => {
    let max = header.length
    for (const row of opts.rows) {
      const len = String(row[colIdx] ?? '').length
      if (len > max) max = len
    }
    return { wch: Math.min(48, Math.max(12, max + 2)) }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  const base = opts.filename.replace(/\.csv$/i, '').replace(/\.xlsx$/i, '')
  XLSX.writeFile(workbook, `${base}.xlsx`, { bookType: 'xlsx' })
}
