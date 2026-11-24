import { ExternalLink, Eye } from './adminIcons'
import {
  adminEventoSituacao, adminEventoValor, adminSystem, formatAdminDate,
} from '../../lib/adminEventos'
import type { AdminEvento } from '../../lib/adminTypes'

export function AdminActivityTable({ eventos, onDetails }: { eventos: AdminEvento[]; onDetails?: (evento: AdminEvento) => void }) {
  return (
    <div className="admin-sheet-wrap">
      <table className="admin-sheet-table">
        <thead><tr><th>Data e hora</th><th>Sistema</th><th>Usuário</th><th>Situação</th><th>Ação / registro</th><th className="money">Valor / saldo</th><th>Acesso</th></tr></thead>
        <tbody>{eventos.map((evento) => {
          const system = adminSystem(evento.sistema)
          const valor = adminEventoValor(evento)
          return <tr key={evento.sourceKey}>
            <td><time>{formatAdminDate(evento.ocorridoEm)}</time></td>
            <td><span className="admin-system-pill" style={{ '--system-color': system.cor } as React.CSSProperties}>{system.nome}</span></td>
            <td><strong className="admin-sheet-user">{evento.actorNome}</strong></td>
            <td><span className={`admin-action-badge is-${evento.categoria}`}>{adminEventoSituacao(evento)}</span></td>
            <td><strong>{evento.titulo}</strong><small>{evento.resumo || evento.entidade || 'Atividade registrada'}</small></td>
            <td className={`money${valor ? ' has-value' : ''}`}>{valor || '—'}</td>
            <td><div className="admin-sheet-actions">{onDetails && <button type="button" onClick={() => onDetails(evento)} title="Ver detalhes" aria-label="Ver detalhes"><Eye size={16} /></button>}{evento.origemUrl && <a href={evento.origemUrl} title="Abrir no sistema" aria-label="Abrir no sistema"><ExternalLink size={16} /></a>}</div></td>
          </tr>
        })}</tbody>
      </table>
    </div>
  )
}
