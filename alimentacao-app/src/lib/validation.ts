import { normalizeCpf, normalizeCep, normalizePhone, normalizeZona, normalizeSecao, normalizeName } from './normalize'
import type { CadastroFormData } from '../types'

export function validateCpfAlgorithm(cpf: string): boolean {
  const d = normalizeCpf(cpf)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i)
  let rest = (sum * 10) % 11
  if (rest === 10) rest = 0
  if (rest !== Number(d[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i)
  rest = (sum * 10) % 11
  if (rest === 10) rest = 0
  return rest === Number(d[10])
}

export interface FieldErrors {
  [key: string]: string
}

export function validateCadastroForm(data: CadastroFormData): FieldErrors {
  const errors: FieldErrors = {}

  if (!normalizeName(data.nome_completo)) {
    errors.nome_completo = 'Nome completo é obrigatório.'
  }

  const cpf = normalizeCpf(data.cpf)
  if (cpf) {
    if (!validateCpfAlgorithm(cpf)) {
      errors.cpf = 'CPF inválido.'
    }
  }

  const phone = normalizePhone(data.telefone)
  if (!phone) {
    errors.telefone = 'Telefone é obrigatório.'
  } else if (phone.length < 10 || phone.length > 11) {
    errors.telefone = 'Telefone inválido.'
  }

  if (!data.titulo.trim()) {
    errors.titulo = 'Título de eleitor é obrigatório.'
  }

  if (!normalizeZona(data.zona)) {
    errors.zona = 'Zona eleitoral é obrigatória.'
  }

  if (!normalizeSecao(data.secao)) {
    errors.secao = 'Seção eleitoral é obrigatória.'
  }

  if (!normalizeName(data.nome_mae)) {
    errors.nome_mae = 'Nome completo da mãe é obrigatório.'
  }

  if (!normalizeName(data.coordenador)) {
    errors.coordenador = 'Coordenador é obrigatório.'
  }

  const cep = normalizeCep(data.cep)
  if (cep && cep.length !== 8) {
    errors.cep = 'CEP inválido.'
  }

  return errors
}

/** Validação da planilha oficial (sem CPF e CEP). */
export function validateImportRow(data: CadastroFormData): FieldErrors {
  const errors: FieldErrors = {}

  if (!normalizeName(data.nome_completo)) {
    errors.nome_completo = 'Nome completo é obrigatório.'
  }

  const phone = normalizePhone(data.telefone)
  if (!phone) {
    errors.telefone = 'Telefone é obrigatório.'
  } else if (phone.length < 10 || phone.length > 11) {
    errors.telefone = 'Telefone inválido.'
  }

  if (!data.titulo.trim()) {
    errors.titulo = 'Título de eleitor é obrigatório.'
  }

  if (!normalizeZona(data.zona)) {
    errors.zona = 'Zona eleitoral é obrigatória.'
  }

  if (!normalizeSecao(data.secao)) {
    errors.secao = 'Sessão/seção eleitoral é obrigatória.'
  }

  if (!normalizeName(data.nome_mae)) {
    errors.nome_mae = 'Nome completo da mãe é obrigatório.'
  }

  // Coordenador é opcional na planilha (pode vir vazio); no formulário é obrigatório.
  return errors
}

export function isDuplicateCpfError(message: string): boolean {
  return message.includes('cadastros_cpf_unique') || message.toLowerCase().includes('duplicate')
}
