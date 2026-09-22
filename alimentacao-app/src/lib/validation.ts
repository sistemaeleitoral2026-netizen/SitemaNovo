import { normalizeCpf, normalizeCep, normalizePhone, normalizeZona, normalizeSecao, normalizeName, normalizeBirthDate, normalizeTitulo } from './normalize'
import type { CadastroFormData } from '../types'

/** DDDs válidos no Brasil (Anatel). */
const BR_DDDS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
])

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

/**
 * Valida telefone BR para uso com WhatsApp/ficha.
 * Aceita celular (11 dígitos, 9 após DDD) ou fixo (10 dígitos).
 * Retorna mensagem de erro ou null se ok / vazio.
 */
export function validateBrazilianPhone(value: unknown): string | null {
  const phone = normalizePhone(value)
  if (!phone) return null

  if (phone.length < 10 || phone.length > 11) {
    return 'Use DDD + número (10 ou 11 dígitos). Ex.: (98) 99123-4567'
  }

  const ddd = phone.slice(0, 2)
  if (!BR_DDDS.has(ddd)) {
    return 'DDD inválido.'
  }

  const local = phone.slice(2)
  if (/^(\d)\1+$/.test(local)) {
    return 'Telefone inválido.'
  }

  // Celular: 9 dígitos locais começando com 9
  if (phone.length === 11) {
    if (!local.startsWith('9')) {
      return 'Celular deve ter 9 após o DDD. Ex.: (98) 9xxxx-xxxx'
    }
    return null
  }

  // Fixo: 8 dígitos, não começa com 0 ou 1
  if (local.startsWith('0') || local.startsWith('1')) {
    return 'Número fixo inválido.'
  }

  return null
}

export interface FieldErrors {
  [key: string]: string
}

/** Nenhum campo é obrigatório; só valida formato quando preenchido. */
export function validateCadastroForm(data: CadastroFormData): FieldErrors {
  const errors: FieldErrors = {}

  const nome = normalizeName(data.nome_completo)
  if (!nome) {
    errors.nome_completo = 'Informe o nome completo.'
  } else if (nome.split(/\s+/).filter(Boolean).length < 2) {
    errors.nome_completo = 'Informe nome e sobrenome.'
  }

  const cpf = normalizeCpf(data.cpf)
  if (cpf && !validateCpfAlgorithm(cpf)) {
    errors.cpf = 'CPF inválido.'
  }

  const phoneError = validateBrazilianPhone(data.telefone)
  if (phoneError) {
    errors.telefone = phoneError
  }

  if ((data.data_nascimento ?? '').trim()) {
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
  // (UI da ficha limita a 089/010; não bloqueia legado/edição/import)
  void normalizeZona(data.zona)
  void normalizeSecao(data.secao)
  void normalizeName(data.nome_mae)

  const tituloDigits = String(data.titulo ?? '').replace(/\D/g, '')
  if (tituloDigits && tituloDigits.length > 12) {
    errors.titulo = 'Título de eleitor: no máximo 12 dígitos.'
  }

  if (!normalizeName(data.coordenador)) {
    errors.coordenador = 'Selecione o coordenador.'
  }
  if (!normalizeName(data.lider)) {
    errors.lider = 'Selecione a liderança.'
  }

  return errors
}

/** Validação da planilha: nenhum campo obrigatório; só formato quando houver valor. */
export function validateImportRow(data: CadastroFormData): FieldErrors {
  const errors: FieldErrors = {}

  const phoneError = validateBrazilianPhone(data.telefone)
  if (phoneError) {
    errors.telefone = phoneError
  }

  if ((data.data_nascimento ?? '').trim()) {
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

  const titulo = normalizeTitulo(data.titulo)
  if (titulo && titulo.length > 12) {
    errors.titulo = 'Título de eleitor: no máximo 12 dígitos.'
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
