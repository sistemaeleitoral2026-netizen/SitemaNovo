import { normalizeCpf, normalizeCep, normalizePhone, normalizeZona, normalizeSecao, normalizeName, normalizeBirthDate } from './normalize'
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

/** Nenhum campo é obrigatório; só valida formato quando preenchido. */
export function validateCadastroForm(data: CadastroFormData): FieldErrors {
  const errors: FieldErrors = {}

  const cpf = normalizeCpf(data.cpf)
  if (cpf && !validateCpfAlgorithm(cpf)) {
    errors.cpf = 'CPF inválido.'
  }

  const phone = normalizePhone(data.telefone)
  if (phone && (phone.length < 10 || phone.length > 11)) {
    errors.telefone = 'Telefone inválido.'
  }

  if (data.data_nascimento.trim()) {
    const birth = normalizeBirthDate(data.data_nascimento)
    if (!birth) {
      errors.data_nascimento = 'Data de nascimento inválida.'
    } else {
      const date = new Date(`${birth}T12:00:00`)
      if (Number.isNaN(date.getTime()) || date > new Date()) {
        errors.data_nascimento = 'Data de nascimento inválida.'
      }
    }
  }

  const cep = normalizeCep(data.cep)
  if (cep && cep.length !== 8) {
    errors.cep = 'CEP inválido.'
  }

  // zona/seção: se preenchidos, só normalizam — sem erro de obrigatoriedade
  void normalizeZona(data.zona)
  void normalizeSecao(data.secao)
  void normalizeName(data.nome_completo)
  void normalizeName(data.nome_mae)
  void normalizeName(data.coordenador)
  void normalizeName(data.lider)

  return errors
}

/** Validação da planilha: nenhum campo obrigatório; só formato quando houver valor. */
export function validateImportRow(data: CadastroFormData): FieldErrors {
  const errors: FieldErrors = {}

  const phone = normalizePhone(data.telefone)
  if (phone && (phone.length < 10 || phone.length > 11)) {
    errors.telefone = 'Telefone inválido.'
  }

  if (data.data_nascimento.trim()) {
    const birth = normalizeBirthDate(data.data_nascimento)
    if (!birth) {
      errors.data_nascimento = 'Data de nascimento inválida.'
    }
  }

  const cpf = normalizeCpf(data.cpf)
  if (cpf && !validateCpfAlgorithm(cpf)) {
    errors.cpf = 'CPF inválido.'
  }

  const cep = normalizeCep(data.cep)
  if (cep && cep.length !== 8) {
    errors.cep = 'CEP inválido.'
  }

  return errors
}

export function isDuplicateCpfError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('cadastros_cpf_unique') || m.includes('cadastros_cpf_unique_filled')
}

export function isDuplicateTituloError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('cadastros_titulo_unique') || m.includes('cadastros_titulo_unique_filled')
}
