interface PaginationProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  label?: string
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  label,
}: PaginationProps) {
  const from = totalItems === 0 ? 0 : page * pageSize + 1
  const to = Math.min(totalItems, (page + 1) * pageSize)
  const pages = buildPages(page, totalPages)

  return (
    <div className="pager">
      <span className="pager-label">
        {label ?? `${from}–${to} de ${totalItems}`}
      </span>
      <div className="pager-controls">
        {onPageSizeChange && (
          <label className="pager-size">
            Por página
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Itens por página"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}
        <div className="pager-buttons">
          <button
            type="button"
            className="pager-btn"
            aria-label="Anterior"
            disabled={page <= 0}
            onClick={() => onPageChange(page - 1)}
          >
            ‹
          </button>
          {pages.map((p, i) =>
            p === '…' ? (
              <span key={`e-${i}`} className="pager-ellipsis">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`pager-btn${p === page + 1 ? ' active' : ''}`}
                onClick={() => onPageChange(Number(p) - 1)}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className="pager-btn"
            aria-label="Próxima"
            disabled={page >= totalPages - 1 || totalPages === 0}
            onClick={() => onPageChange(page + 1)}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  )
}

function buildPages(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const current = page + 1
  const set = new Set([1, totalPages, current, current - 1, current + 1].filter((n) => n >= 1 && n <= totalPages))
  const sorted = [...set].sort((a, b) => a - b)
  const result: (number | '…')[] = []
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) result.push('…')
    result.push(n)
  })
  return result
}
