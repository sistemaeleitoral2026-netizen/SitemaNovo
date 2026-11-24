import type { SiteId } from './sites'

export type AdminSystemId = SiteId | 'admin'
export type AdminEventoCategoria = 'criacao' | 'edicao' | 'conclusao' | 'exclusao' | 'acesso' | 'atividade'

export interface AdminEvento {
  id: string
  sistema: AdminSystemId
  categoria: AdminEventoCategoria
  acao: string
  entidade: string | null
  entidadeId: string | null
  titulo: string
  resumo: string | null
  actorId: string | null
  actorNome: string
  ocorridoEm: string
  metadata: Record<string, unknown>
  origemUrl: string | null
  sourceKey: string
}

export interface AdminEventoFiltro {
  sistema?: AdminSystemId | ''
  categoria?: AdminEventoCategoria | ''
  usuario?: string
  busca?: string
  inicio?: string
  fim?: string
  page?: number
  pageSize?: number
}

export interface AdminDashboardResumo {
  movimentacoesHoje: number
  usuariosAtivos: number
  sistemasAtivos: number
  totalPeriodo: number
}

export interface AdminSistemaResumo {
  sistema: AdminSystemId
  total24h: number
  total7d: number
  ultimaAtividade: string | null
}

export interface AdminEventosResultado {
  eventos: AdminEvento[]
  total: number
  centralizado: boolean
}

export interface AdminPresenca {
  userId: string
  nome: string
  email: string | null
  role: string | null
  currentPath: string | null
  firstSeenAt: string
  lastSeenAt: string
  online: boolean
}
