import { X } from 'lucide-react'
import { Button } from './Button'
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

  return (
    <>
      <div className="meta-popup-overlay" onClick={onClose} aria-hidden />
      <div className="meta-popup" role="dialog" aria-modal aria-labelledby="meta-popup-title">
        <button type="button" className="meta-popup-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>

        <p className="meta-popup-kicker">Acompanhamento diário</p>
        <h2 id="meta-popup-title">
          {batida ? 'Meta de fichas atingida' : 'Progresso da meta de fichas'}
        </h2>
        <p className="meta-popup-lead">
          {batida
            ? `O sistema já registrou ${atual.toLocaleString('pt-BR')} fichas — acima da meta de ${meta.toLocaleString('pt-BR')}.`
            : `Hoje o sistema está com ${atual.toLocaleString('pt-BR')} fichas. Ainda faltam ${restante.toLocaleString('pt-BR')} para chegar a ${meta.toLocaleString('pt-BR')}.`}
        </p>

        <div className={`meta-popup-hero${batida ? ' done' : ''}`}>
          <span className="meta-popup-hero-label">{batida ? 'Total confirmado' : 'Faltam'}</span>
          <strong className="tabular-nums">
            {batida ? atual.toLocaleString('pt-BR') : restante.toLocaleString('pt-BR')}
          </strong>
          <span className="meta-popup-hero-sub">
            {batida ? `Meta: ${meta.toLocaleString('pt-BR')}` : `Meta: ${meta.toLocaleString('pt-BR')} fichas`}
          </span>
        </div>

        <div className="meta-popup-bar-wrap">
          <div className="meta-popup-bar-top">
            <span>{atual.toLocaleString('pt-BR')} / {meta.toLocaleString('pt-BR')}</span>
            <span>{pct}%</span>
          </div>
          <div className="meta-popup-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${Math.max(pct, batida ? 100 : 2)}%` }} />
          </div>
        </div>

        <div className="meta-popup-stats">
          <div>
            <span>Atual</span>
            <strong className="tabular-nums">{atual.toLocaleString('pt-BR')}</strong>
          </div>
          <div>
            <span>Meta</span>
            <strong className="tabular-nums">{meta.toLocaleString('pt-BR')}</strong>
          </div>
          <div>
            <span>{batida ? 'Acima' : 'Restante'}</span>
            <strong className="tabular-nums">
              {batida
                ? `+${(atual - meta).toLocaleString('pt-BR')}`
                : restante.toLocaleString('pt-BR')}
            </strong>
          </div>
        </div>

        <Button className="meta-popup-cta" onClick={onClose}>
          Continuar
        </Button>
      </div>
    </>
  )
}
