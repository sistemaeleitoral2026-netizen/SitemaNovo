export type UserRole = 'admin' | 'diretoria' | 'operador' | 'mobilizador' | 'administrativo'

export type DemandaStatus = 'aberta' | 'feita'
export type DemandaOrigem = 'cadastro' | 'avulso'
export type DemandaUrgencia = 'baixa' | 'normal' | 'alta' | 'urgente'

export interface Demanda {
  id: string
  created_by: string
  cadastro_id: string | null
  origem: DemandaOrigem
  nome: string
  documento: string | null
  telefone: string | null
  telefone_extra: string | null
  descricao: string
  foto_path: string | null
  foto_paths?: string[] | null
  urgencia?: DemandaUrgencia
  status: DemandaStatus
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
  resolved_note: string | null
}

export interface Profile {
  id: string
  nome: string
  email: string
  role: UserRole
  ativo: boolean
  diretoria_id?: string | null
  coordenador_id?: string | null
  lider_id?: string | null
  created_at: string
}

export interface Coordenador {
  id: string
  diretoria_id: string
  nome: string
  ativo: boolean
  carros_adesivados?: number
  adesivos_casa?: number
  postagens?: number
  postagem_links?: string[] | null
  ativacao_notas?: string | null
  ativacao_em?: string | null
  contato_whatsapp?: boolean | null
  created_at: string
}

export interface Lider {
  id: string
  diretoria_id: string
  coordenador_id: string | null
  nome: string
  telefone?: string | null
  ativo: boolean
  carros_adesivados?: number
  adesivos_casa?: number
  postagens?: number
  postagem_links?: string[] | null
  ativacao_notas?: string | null
  ativacao_em?: string | null
  contato_whatsapp?: boolean | null
  created_at: string
}

export interface Cadastro {
  id: string
  operator_id: string | null
  diretoria_id?: string | null
  nome_completo: string
  cpf: string | null
  telefone: string
  titulo: string
  zona: string
  secao: string
  nome_mae: string
  coordenador: string
  lider: string
  data_nascimento: string | null
  cep: string | null
  endereco?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  lat: number | null
  lng: number | null
  carros_adesivados?: number
  adesivos_casa?: number
  postagens?: number
  postagem_links?: string[] | null
  ativacao_notas?: string | null
  ativacao_em?: string | null
  contato_whatsapp?: boolean | null
  created_at: string
  updated_at: string
}

export interface Importacao {
  id: string
  operator_id: string | null
  nome_arquivo: string
  total: number
  validos: number
  duplicados: number
  erros: number
  confirmada: boolean
  detalhes: ImportacaoDetalhes
  created_at: string
}

export interface ImportacaoDetalhes {
  linhas?: ImportLineError[]
}

export interface ImportLineError {
  linha: number
  mensagem: string
  dados?: Record<string, string>
}

export interface ImportPreviewRow {
  linha: number
  nome_completo: string
  cpf: string
  telefone: string
  titulo: string
  zona: string
  secao: string
  nome_mae: string
  coordenador: string
  lider: string
  data_nascimento: string
  cep: string
  endereco?: string
  numero?: string
  complemento?: string
  bairro?: string
  status: 'valido' | 'duplicado' | 'erro'
  mensagem?: string
}

export interface ImportPreview {
  total: number
  validos: number
  duplicados: number
  erros: number
  linhas: ImportPreviewRow[]
}

export interface ImportExistingKeys {
  titulos: Set<string>
  cpfs: Set<string>
  pessoas: Set<string>
}

export interface ImportTeamMember {
  id: string
  nome: string
  coordenador_id?: string | null
}

export interface ImportTeamContext {
  coordenadores: ImportTeamMember[]
  lideres: ImportTeamMember[]
  coordenador_id?: string | null
  lider_id?: string | null
}

export interface CadastroFormData {
  nome_completo: string
  cpf: string
  telefone: string
  titulo: string
  zona: string
  secao: string
  nome_mae: string
  coordenador: string
  lider: string
  data_nascimento: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export interface PeriodFilter {
  start: Date | null
  end: Date | null
}

export interface MapMarkerData {
  lat: number
  lng: number
  zona: string
  secao: string
  count: number
  cep?: string
}

export interface OperadorStats {
  id: string
  nome: string
  email: string
  ativo: boolean
  total: number
  periodo: number
  ultima_atividade: string | null
}
