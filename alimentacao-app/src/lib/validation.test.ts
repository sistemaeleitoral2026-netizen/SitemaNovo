import { describe, expect, it } from 'vitest'
import { validateBrazilianPhone, validateCadastroForm, validateCpfAlgorithm, validateImportRow } from './validation'
import { sanitizeSearchTerm } from './search'

describe('validateCpfAlgorithm', () => {
  it('aceita CPF válido e rejeita repetido', () => {
    expect(validateCpfAlgorithm('529.982.247-25')).toBe(true)
    expect(validateCpfAlgorithm('11111111111')).toBe(false)
  })
})

describe('validateBrazilianPhone', () => {
  it('valida celular com DDD e rejeita DDD inválido', () => {
    expect(validateBrazilianPhone('98991234567')).toBeNull()
    expect(validateBrazilianPhone('00991234567')).toBe('DDD inválido.')
  })
})

const emptyForm = {
  nome_completo: '',
  cpf: '',
  telefone: '',
  titulo: '',
  zona: '',
  secao: '',
  nome_mae: '',
  coordenador: '',
  lider: '',
  data_nascimento: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
}

describe('validateImportRow', () => {
  it('aceita título com 12 dígitos na planilha', () => {
    expect(validateImportRow({ ...emptyForm, titulo: '123456789012' }).titulo).toBeUndefined()
  })
})

describe('validateCadastroForm', () => {
  it('recusa título com mais de 12 dígitos', () => {
    expect(validateCadastroForm({
      ...emptyForm,
      nome_completo: 'Maria Silva',
      coordenador: 'Coordenador',
      lider: 'Lideranca',
      titulo: '1234567890123',
    }).titulo).toBe('Título de eleitor: no máximo 12 dígitos.')
  })
})

describe('sanitizeSearchTerm', () => {
  it('remove metacaracteres do PostgREST', () => {
    expect(sanitizeSearchTerm('  ana%_paula,(x)  ')).toBe('ana paula x')
  })
})
