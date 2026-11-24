import { ExternalLink } from './adminIcons'
import { adminCategoriaLabel, adminSystem, formatAdminDate } from '../../lib/adminEventos'
import type { AdminEvento } from '../../lib/adminTypes'

export function AdminEventItem({ evento, onDetails }: { evento: AdminEvento; onDetails?: (evento: AdminEvento) => void }) {
  const system = adminSystem(evento.sistema)
  return (
    <article className="admin-event-item">
      <span className="admin-event-dot" style={{ '--event-color': system.cor } as React.CSSProperties} />
      <div className="admin-event-body">
        <div className="admin-event-title-row">
          <strong>{evento.titulo}</strong>
          <time>{formatAdminDate(evento.ocorridoEm)}</time>
        </div>
        <p>{evento.resumo || evento.entidade || 'Atividade registrada no sistema.'}</p>
        <div className="admin-event-meta">
          <span className="admin-system-pill" style={{ '--system-color': system.cor } as React.CSSProperties}>{system.nome}</span>
          <span>{adminCategoriaLabel(evento.categoria)}</span>
          <span>por <strong>{evento.actorNome}</strong></span>
        </div>
      </div>
      <div className="admin-event-actions">
        {onDetails && <button type="button" onClick={() => onDetails(evento)}>Detalhes</button>}
        {evento.origemUrl && <a href={evento.origemUrl} title="Abrir origem" aria-label={`Abrir ${system.nome}`}><ExternalLink size={17} /></a>}
      </div>
    </article>
  )
}
