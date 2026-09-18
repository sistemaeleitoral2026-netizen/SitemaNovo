import { Link } from 'react-router-dom'
import { metaProgress } from '../../lib/meta'

interface MetaGoalPopupProps {
  open: boolean
  atual: number
  meta: number
  onClose: () => void
}

export function MetaGoalPopup({ open, atual, meta, onClose }: MetaGoalPopupProps) {
  if (!open) return null

  const { restante, pct, batida } = metaProgress(atual, meta)
  const barW = `${Math.max(pct, 0.6)}%`

  return (
    <div className="nv-meta-overlay" onClick={onClose} role="presentation">
      <div
        className="nv-meta-modal"
        role="dialog"
        aria-modal
        aria-labelledby="meta-popup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nv-meta-kicker">Meta do sistema</div>
        <h2 id="meta-popup-title">
          {batida
            ? 'Meta de fichas alcançada'
            : `Faltam ${restante.toLocaleString('pt-BR')} fichas para a meta`}
        </h2>
        <p>
          Hoje o sistema tem{' '}
          <strong>{atual.toLocaleString('pt-BR')}</strong> de{' '}
          <strong>{meta.toLocaleString('pt-BR')}</strong> fichas ({pct.toFixed(1).replace('.', ',')}%).
          Esse aviso aparece uma vez por dia.
        </p>
        <div className="nv-meta-bar"><i style={{ width: barW }} /></div>
        <div className="nv-meta-actions">
          <button type="button" className="nv-meta-primary" onClick={onClose}>Entendi</button>
          <Link to="/configuracoes" className="nv-meta-secondary" onClick={onClose}>Ajustar meta</Link>
        </div>
      </div>
    </div>
  )
}
