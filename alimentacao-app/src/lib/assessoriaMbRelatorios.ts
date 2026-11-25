import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from './supabase'

/**
 * Módulo Relatórios da Assessoria MB (relatório geral e relatórios médicos).
 * Valores sempre em centavos. O iframe fala com isto via postMessage
 * (tipo "mb-rel"), ver AssessoriaMbPage.
 */

const BUCKET = 'mb-comprovantes'
const TABELA = 'mb_relatorios'

export type RelStatus = 'Rascunho' | 'Em análise' | 'Visualizado' | 'Aprovado' | 'Devolvido'

export type RelArquivo = {
  id: string
  name: string
  size: number
  type?: string
  path?: string
  group?: string
  method?: string
  warnings?: string[]
  count?: number
  total?: number
  status: string
  manual?: boolean
}

export type RelLinha = {
  id: string
  name: string
  doc: string
  ref: string
  bank: string
  account: string
  value: number | null
  category?: string
  profession?: string
  location?: string
  address?: string
  notes?: string
  referenceValue?: number | null
  source?: string
  method?: string
  fileId?: string
  sheet?: string
  page?: number
  checked?: boolean
}

export type RelEvento = { action: string; by: string; at: string; note?: string }

export type Relatorio = {
  id: string
  kind: 'general' | 'medical'
  mode: 'import' | 'manual'
  title: string
  start: string
  end: string
  percent: number
  company: string
  author: string
  status: RelStatus
  files: RelArquivo[]
  rows: RelLinha[]
  events: RelEvento[]
  snapshot: Record<string, string>
  created?: string
  updated?: string
}

export type RelResumo = {
  id: string
  kind: 'general' | 'medical'
  title: string
  start: string
  end: string
  company: string
  author: string
  status: RelStatus
  created: string
  count: number
  total: number
}

export type RelNovoArquivo = { id: string; name: string; type?: string; dataBase64: string }

const MEDICAS = ['Plantonistas', 'Especialistas']

function incluidas(r: Pick<Relatorio, 'kind' | 'rows'>) {
  return r.rows.filter((x) => r.kind !== 'medical' || MEDICAS.includes(String(x.category)))
}
function soma(rows: RelLinha[]) {
  return rows.reduce((s, x) => s + (Number(x.value) || 0), 0)
}
export function totaisRelatorio(r: Pick<Relatorio, 'kind' | 'rows' | 'percent'>) {
  const rows = incluidas(r)
  const subtotal = soma(rows)
  const pct = Number(r.percent) || 0
  const acrescimo =
    r.kind === 'medical'
      ? MEDICAS.reduce(
          (n, k) => n + Math.round((soma(rows.filter((x) => x.category === k)) * pct) / 100),
          0,
        )
      : Math.trunc((subtotal * pct) / 100)
  return { registros: rows.length, subtotal, acrescimo, total: subtotal + acrescimo }
}

function dataISO(v: unknown) {
  return v ? String(v).slice(0, 10) : ''
}

function deLinha(row: Record<string, unknown>): Relatorio {
  return {
    id: String(row.id),
    kind: row.kind === 'medical' ? 'medical' : 'general',
    mode: row.mode === 'manual' ? 'manual' : 'import',
    title: String(row.title ?? ''),
    start: dataISO(row.competencia_inicio),
    end: dataISO(row.competencia_fim),
    percent: Number(row.percent ?? 0),
    company: String(row.company ?? ''),
    author: String(row.author ?? ''),
    status: (row.status as RelStatus) || 'Rascunho',
    files: Array.isArray(row.files) ? (row.files as RelArquivo[]) : [],
    rows: Array.isArray(row.rows) ? (row.rows as RelLinha[]) : [],
    events: Array.isArray(row.events) ? (row.events as RelEvento[]) : [],
    snapshot:
      row.snapshot && typeof row.snapshot === 'object' ? (row.snapshot as Record<string, string>) : {},
    created: row.created_at ? String(row.created_at) : undefined,
    updated: row.updated_at ? String(row.updated_at) : undefined,
  }
}

function erroBanco(e: { message?: string; code?: string } | null, padrao: string) {
  if (!e) return new Error(padrao)
  if (e.code === '42P01' || /mb_relatorios/.test(e.message || '') && /does not exist|schema cache/i.test(e.message || ''))
    return new Error(
      'A tabela de relatórios ainda não existe no banco. Rode a migração 20261128_assessoria_mb_relatorios.sql no Supabase.',
    )
  return new Error(e.message || padrao)
}

export async function listarRelatorios(): Promise<RelResumo[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('id,kind,title,competencia_inicio,competencia_fim,company,author,status,created_at,registros,total_centavos')
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw erroBanco(error, 'Falha ao carregar relatórios.')
  return (data || []).map((r) => ({
    id: String(r.id),
    kind: r.kind === 'medical' ? 'medical' : 'general',
    title: String(r.title ?? ''),
    start: dataISO(r.competencia_inicio),
    end: dataISO(r.competencia_fim),
    company: String(r.company ?? ''),
    author: String(r.author ?? ''),
    status: r.status as RelStatus,
    created: String(r.created_at ?? ''),
    count: Number(r.registros ?? 0),
    total: Number(r.total_centavos ?? 0),
  }))
}

export async function obterRelatorio(id: string): Promise<Relatorio> {
  const { data, error } = await supabase.from(TABELA).select('*').eq('id', id).maybeSingle()
  if (error) throw erroBanco(error, 'Falha ao abrir o relatório.')
  if (!data) throw new Error('Relatório não encontrado.')
  return deLinha(data)
}

/** Apaga o relatório e os arquivos do Storage (admin / can_delete_assessoria_mb). */
export async function excluirRelatorio(id: string): Promise<void> {
  const rel = await obterRelatorio(id)
  const paths = [
    ...(rel.files || []).map((f) => f.path).filter(Boolean) as string[],
    ...Object.values(rel.snapshot || {})
      .map((v) => {
        // snapshot guarda base64 às vezes; se for path de storage, remove
        if (typeof v === 'string' && v.startsWith('relatorios/')) return v
        return ''
      })
      .filter(Boolean),
  ]
  if (paths.length) {
    const { error: stErr } = await supabase.storage.from(BUCKET).remove(paths)
    if (stErr) console.warn('[assessoria-mb] storage ao excluir relatório', stErr)
  }
  // limpa pasta do relatório se ainda houver objetos
  try {
    const { data: objs } = await supabase.storage.from(BUCKET).list(`relatorios/${id}`, { limit: 100 })
    if (objs?.length) {
      await supabase.storage.from(BUCKET).remove(objs.map((o) => `relatorios/${id}/${o.name}`))
    }
  } catch (e) {
    console.warn('[assessoria-mb] list storage ao excluir', e)
  }
  const { error } = await supabase.from(TABELA).delete().eq('id', id)
  if (error) throw erroBanco(error, 'Falha ao excluir o relatório.')
}

const MIME_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
}
function extensao(nome: string) {
  return String(nome || '').split('.').pop()?.toLowerCase() || ''
}
function mimeDe(nome: string, tipo?: string) {
  return MIME_EXT[extensao(nome)] || tipo || 'application/octet-stream'
}
function nomeSeguro(nome: string) {
  return (
    String(nome || 'arquivo')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '_')
      .slice(-80) || 'arquivo'
  )
}
function base64ParaBytes(b64: string) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesParaBase64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function subir(path: string, bytes: Uint8Array, mime: string) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([bytes as BlobPart], { type: mime }), { contentType: mime, upsert: true })
  if (error) throw new Error('Falha ao enviar arquivo: ' + error.message)
}

/** Grava (cria ou atualiza) o relatório e envia os arquivos novos. */
export async function salvarRelatorio(
  rel: Relatorio,
  novos: RelNovoArquivo[],
  user: { userId: string; nome: string },
): Promise<Relatorio> {
  if (rel.status !== 'Rascunho' && rel.status !== 'Devolvido')
    throw new Error('Este relatório já foi enviado e não pode ser editado. Crie uma cópia.')
  const id = rel.id || crypto.randomUUID()

  let anteriores: RelArquivo[] = []
  if (rel.id) {
    const { data, error } = await supabase.from(TABELA).select('files').eq('id', id).maybeSingle()
    if (error) throw erroBanco(error, 'Falha ao salvar o relatório.')
    anteriores = Array.isArray(data?.files) ? (data!.files as RelArquivo[]) : []
  }

  const novosPorId = new Map(novos.map((n) => [n.id, n]))
  const files: RelArquivo[] = []
  for (const f of rel.files || []) {
    const limpo: RelArquivo = { ...f }
    delete (limpo as Record<string, unknown>).data
    const novo = novosPorId.get(f.id)
    if (novo) {
      const mime = mimeDe(f.name, f.type)
      const path = `relatorios/${id}/${f.id}-${nomeSeguro(f.name)}`
      await subir(path, base64ParaBytes(novo.dataBase64), mime)
      limpo.path = path
      limpo.type = mime
    }
    files.push(limpo)
  }

  const t = totaisRelatorio(rel)
  const linha = {
    id,
    kind: rel.kind,
    mode: rel.mode,
    title: String(rel.title || 'Relatório').trim(),
    competencia_inicio: rel.start || null,
    competencia_fim: rel.end || null,
    percent: Number(rel.percent) || 0,
    company: rel.company || '',
    rows: rel.rows || [],
    files,
    total_centavos: t.total,
    registros: t.registros,
    author: rel.author || user.nome,
  }

  if (rel.id) {
    const { error } = await supabase.from(TABELA).update(linha).eq('id', id)
    if (error) throw erroBanco(error, 'Falha ao salvar o relatório.')
  } else {
    const evento: RelEvento = { action: 'Relatório criado', by: user.nome, at: new Date().toISOString() }
    const { error } = await supabase
      .from(TABELA)
      .insert({ ...linha, status: 'Rascunho', events: [...(rel.events || []), evento], created_by: user.userId || null })
    if (error) throw erroBanco(error, 'Falha ao salvar o relatório.')
  }

  // Arquivos removidos do relatório: apaga do storage (se a permissão deixar).
  const mantidos = new Set(files.map((f) => f.path).filter(Boolean))
  const remover = anteriores.map((f) => f.path).filter((p): p is string => !!p && !mantidos.has(p))
  if (remover.length) void supabase.storage.from(BUCKET).remove(remover)

  return obterRelatorio(id)
}

/** Envio para análise, visto, aprovação ou devolução (regra fica no banco). */
export async function acaoRelatorio(
  id: string,
  acao: string,
  nota: string,
  user: { nome: string },
): Promise<Relatorio> {
  const { error } = await supabase.rpc('mb_relatorio_acao', {
    p_id: id,
    p_acao: acao,
    p_nota: nota || '',
    p_actor: user.nome,
  })
  if (error) throw erroBanco(error, 'Falha ao atualizar a situação.')
  let rel = await obterRelatorio(id)
  if (acao === 'submit') {
    // Guarda a cópia em PDF do que foi enviado.
    try {
      const snap: Record<string, string> = {}
      for (const sec of secoes(rel)) {
        const pdf = gerarPdf(rel, sec)
        const path = `relatorios/${id}/copia-enviada-${nomeSeguro(sec)}.pdf`
        await subir(path, new Uint8Array(pdf.output('arraybuffer')), 'application/pdf')
        snap[sec] = path
      }
      await supabase.rpc('mb_relatorio_snapshot', { p_id: id, p_snapshot: snap })
      rel = await obterRelatorio(id)
    } catch (e) {
      console.warn('[assessoria-mb] cópia do relatório', e)
    }
  }
  return rel
}

/* ---------------- Leitura de planilhas (Excel / CSV) ---------------- */

const GRUPOS: [RegExp, string][] = [
  [/ve[ií]culo|m[aá]quina|trator|caminh/i, 'Veículos e máquinas'],
  [/careca/i, 'Careca'],
  [/cimar/i, 'Cimar Transportes'],
  [/compra/i, 'Setor de compras'],
  [/[aá]gua|abastec/i, 'Abastecimento de água'],
]

const CAMPOS: [keyof RelLinha, RegExp][] = [
  ['doc', /cpf|cnpj|documento/],
  ['bank', /banco|agencia|ag\./],
  ['account', /conta/],
  ['value', /valor|total|liquido|restante|a pagar|pago/],
  ['profession', /profiss|cargo|funcao/],
  ['address', /endere/],
  ['location', /local|ubs|unidade|setor/],
  ['ref', /refer|descri|servic|plant|especialidade|historico|objeto|competencia/],
  ['name', /nome|titular|favorecido|benefici|prestador|fornecedor|profissional|medico/],
  ['notes', /observ|obs\b/],
]

function norm(v: unknown) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function centavos(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null
  let s = String(v).replace(/r\$|\s/gi, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function mapearCabecalho(linha: unknown[]) {
  const mapa: Partial<Record<keyof RelLinha, number>> = {}
  linha.forEach((cel, i) => {
    const t = norm(cel)
    if (!t) return
    if (/^nome/.test(t) && mapa.name === undefined) {
      mapa.name = i
      return
    }
    for (const [campo, re] of CAMPOS) {
      if (mapa[campo] !== undefined) continue
      if (campo === 'account' && /banco|agencia/.test(t) && !/conta/.test(t.replace(/banco|agencia/g, ''))) continue
      if (re.test(t)) {
        mapa[campo] = i
        break
      }
    }
  })
  return mapa
}

/** Excel/CSV (síncrono). Para PDF use `extrairArquivo`. */
export function extrairPlanilha(nome: string, dataBase64: string, kind: 'general' | 'medical') {
  const ext = extensao(nome)
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    return {
      group: kind === 'medical' ? 'PSF / referência' : 'Outros',
      method: 'Anexo',
      warnings: [
        'Leitura automática disponível para Excel, CSV e PDF. Este arquivo fica como anexo; preencha os lançamentos manualmente.',
      ],
      rows: [] as Omit<RelLinha, 'id'>[],
      manual: true,
    }
  }
  const bytes = base64ParaBytes(dataBase64)
  let wb: XLSX.WorkBook
  if (ext === 'csv') {
    // CSV como texto puro: o leitor padrão entende "1.500,00" como 1,5.
    let texto: string
    try {
      texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      texto = new TextDecoder('windows-1252').decode(bytes)
    }
    wb = XLSX.read(texto.replace(/^﻿/, ''), { type: 'string', raw: true })
  } else {
    wb = XLSX.read(bytes, { type: 'array', cellDates: false })
  }
  const rows: Omit<RelLinha, 'id'>[] = []
  const warnings: string[] = []
  let grupoGeral = 'Outros'
  for (const [re, g] of GRUPOS) if (re.test(nome)) grupoGeral = g

  for (const aba of wb.SheetNames) {
    const ws = wb.Sheets[aba]
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
    let cab = -1
    let mapa: Partial<Record<keyof RelLinha, number>> = {}
    for (let i = 0; i < Math.min(matriz.length, 40); i++) {
      const m = mapearCabecalho(matriz[i] || [])
      if (m.name !== undefined && (m.value !== undefined || m.doc !== undefined)) {
        cab = i
        mapa = m
        break
      }
    }
    if (cab < 0) continue
    let grupo = grupoGeral
    for (const [re, g] of GRUPOS) if (re.test(aba)) grupo = g
    const categoriaAba = /plant/i.test(aba + ' ' + nome)
      ? 'Plantonistas'
      : /especial/i.test(aba + ' ' + nome)
        ? 'Especialistas'
        : 'PSF / referência'
    for (let i = cab + 1; i < matriz.length; i++) {
      const l = matriz[i] || []
      const pega = (k: keyof RelLinha) => (mapa[k] === undefined ? '' : l[mapa[k]!])
      const name = String(pega('name') ?? '').trim()
      const valor = centavos(pega('value'))
      if (!name && valor === null) continue
      if (/^(sub)?total|^mais\s|^soma/i.test(norm(name))) continue
      const linha: Omit<RelLinha, 'id'> = {
        name,
        doc: String(pega('doc') ?? '').trim(),
        ref: String(pega('ref') ?? '').trim(),
        bank: String(pega('bank') ?? '').trim(),
        account: String(pega('account') ?? '').trim(),
        value: valor,
        profession: String(pega('profession') ?? '').trim(),
        location: String(pega('location') ?? '').trim(),
        address: String(pega('address') ?? '').trim(),
        notes: String(pega('notes') ?? '').trim(),
        sheet: aba,
      }
      if (kind === 'medical') {
        linha.category = categoriaAba
        if (categoriaAba === 'PSF / referência') {
          linha.referenceValue = valor
          linha.value = null
        }
      }
      rows.push(linha)
    }
    if (kind === 'general') grupoGeral = grupo
  }
  if (!rows.length)
    warnings.push('Não encontrei uma tabela com nome e valor/CPF na planilha. Confira o arquivo ou preencha manualmente.')
  const semCampos = rows.filter((r) => !r.doc || !r.bank || !r.account).length
  if (semCampos) warnings.push(`${semCampos} linha(s) sem CPF/CNPJ ou dados bancários.`)
  const categorias = [...new Set(rows.map((r) => r.category).filter(Boolean))]
  return {
    group: kind === 'medical' ? categorias.join(', ') || 'PSF / referência' : grupoGeral,
    method: 'Planilha',
    warnings,
    rows,
    manual: false,
  }
}

/* ---------------- PDF e Word ---------------- */

function secoes(r: Relatorio) {
  return r.kind === 'medical' ? MEDICAS.filter((k) => r.rows.some((x) => x.category === k)) : ['Geral']
}

const brl = (c: number | null | undefined) =>
  ((Number(c) || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (d: string) => (d ? d.split('-').reverse().join('/') : '—')

function colunas(sec: string): [string, (x: RelLinha) => string][] {
  const v = (x: RelLinha) => (x.value === null || x.value === undefined ? '—' : brl(x.value))
  if (sec === 'Plantonistas')
    return [
      ['Nome', (x) => x.name],
      ['CPF', (x) => x.doc],
      ['Serviço / plantão', (x) => x.ref],
      ['Profissão', (x) => x.profession || ''],
      ['Local', (x) => x.location || ''],
      ['Banco / agência', (x) => x.bank],
      ['Conta', (x) => x.account],
      ['Valor', v],
    ]
  if (sec === 'Especialistas')
    return [
      ['Nome', (x) => x.name],
      ['CPF', (x) => x.doc],
      ['Especialidade', (x) => x.ref],
      ['Banco / agência', (x) => x.bank],
      ['Conta', (x) => x.account],
      ['Valor', v],
    ]
  return [
    ['Nome titular', (x) => x.name],
    ['CPF/CNPJ', (x) => x.doc],
    ['Referência', (x) => x.ref],
    ['Banco / agência', (x) => x.bank],
    ['Conta', (x) => x.account],
    ['Restante por fora', v],
  ]
}

function dadosSecao(r: Relatorio, sec: string) {
  const rows = sec === 'Geral' ? r.rows : r.rows.filter((x) => x.category === sec)
  const subtotal = soma(rows)
  const pct = Number(r.percent) || 0
  const acrescimo = r.kind === 'medical' ? Math.round((subtotal * pct) / 100) : Math.trunc((subtotal * pct) / 100)
  const titulo = r.kind === 'medical' ? `${r.title} — ${sec}` : r.title
  return { rows, subtotal, acrescimo, total: subtotal + acrescimo, titulo }
}

function rodapeSituacao(r: Relatorio) {
  const ultimo = r.events[r.events.length - 1]
  return `Situação: ${r.status}${
    r.status === 'Aprovado' && ultimo ? ` · ${ultimo.by} · ${new Date(ultimo.at).toLocaleString('pt-BR')}` : ''
  }`
}

function gerarPdf(r: Relatorio, sec: string) {
  const d = dadosSecao(r, sec)
  const cols = colunas(sec)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const w = doc.internal.pageSize.getWidth()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(d.titulo.toUpperCase(), w / 2, 14, { align: 'center' })
  doc.setFillColor(82, 123, 173)
  doc.rect(12, 18, w - 24, 7, 'F')
  doc.setFontSize(10)
  doc.text(`Competência: ${dataBR(r.start)} a ${dataBR(r.end)}${r.company ? ' · ' + r.company : ''}`, w / 2, 23, {
    align: 'center',
  })
  autoTable(doc, {
    startY: 28,
    margin: { left: 12, right: 12 },
    head: [cols.map(([t]) => t)],
    body: d.rows.map((x) => cols.map(([, f]) => f(x) || '')),
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [101, 113, 129], lineWidth: 0.1, valign: 'top' },
    headStyles: { fillColor: [198, 216, 234], textColor: 20, fontStyle: 'bold' },
    bodyStyles: { fillColor: [225, 234, 243] },
    columnStyles: { [cols.length - 1]: { halign: 'right' } },
  })
  const fim = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40
  let y = fim + 8
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage()
    y = 20
  }
  doc.setFontSize(10)
  const linhaSoma = (rotulo: string, valor: string, destaque = false) => {
    if (destaque) {
      doc.setFillColor(240, 222, 222)
      doc.rect(w - 112, y - 5, 100, 7, 'F')
    }
    doc.setFont('helvetica', 'normal')
    doc.text(rotulo, w - 108, y)
    doc.setFont('helvetica', 'bold')
    doc.text(valor, w - 14, y, { align: 'right' })
    y += 8
  }
  linhaSoma('SUBTOTAL', brl(d.subtotal))
  linhaSoma(`MAIS ${Number(r.percent) || 0}%`, brl(d.acrescimo))
  linhaSoma('TOTAL GERAL', brl(d.total), true)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(rodapeSituacao(r), 12, y + 2)
  return doc
}

const escHtml = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function gerarWord(r: Relatorio, sec: string) {
  const d = dadosSecao(r, sec)
  const cols = colunas(sec)
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escHtml(d.titulo)}</title><style>@page Section1{size:841.9pt 595.3pt;mso-page-orientation:landscape;margin:36pt}div.Section1{page:Section1}body{font-family:Arial;font-size:9pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #657181;padding:4px;vertical-align:top}th{background:#c6d8ea}td{background:#e1eaf3}.r{text-align:right}h1{text-align:center;font-size:14pt}.p{text-align:center;background:#527bad;font-weight:bold;padding:5px}</style></head><body><div class="Section1"><h1>${escHtml(d.titulo.toUpperCase())}</h1><div class="p">Competência: ${dataBR(r.start)} a ${dataBR(r.end)}${r.company ? ' · ' + escHtml(r.company) : ''}</div><br><table><tr>${cols.map(([t], i) => `<th${i === cols.length - 1 ? ' class="r"' : ''}>${escHtml(t)}</th>`).join('')}</tr>${d.rows.map((x) => `<tr>${cols.map(([, f], i) => `<td${i === cols.length - 1 ? ' class="r"' : ''}>${escHtml(f(x))}</td>`).join('')}</tr>`).join('')}</table><br><table style="width:45%;margin-left:55%"><tr><td>SUBTOTAL</td><td class="r"><b>${brl(d.subtotal)}</b></td></tr><tr><td>MAIS ${Number(r.percent) || 0}%</td><td class="r"><b>${brl(d.acrescimo)}</b></td></tr><tr><td style="background:#f0dede">TOTAL GERAL</td><td class="r" style="background:#f0dede"><b>${brl(d.total)}</b></td></tr></table><p style="font-size:8pt">${escHtml(rodapeSituacao(r))}</p></div></body></html>`
  return new TextEncoder().encode('﻿' + html)
}

export function exportarRelatorio(r: Relatorio, sec: string, formato: 'pdf' | 'doc') {
  if (formato === 'doc') return { data: bytesParaBase64(gerarWord(r, sec)), mime: 'application/msword', ext: 'doc' }
  return { data: bytesParaBase64(gerarPdf(r, sec).output('arraybuffer')), mime: 'application/pdf', ext: 'pdf' }
}

/** Atende os pedidos do iframe ("mb-rel"). */
export async function tratarPedidoRelatorio(
  op: string,
  dados: Record<string, unknown>,
  user: { userId: string; nome: string },
): Promise<unknown> {
  switch (op) {
    case 'list':
      return listarRelatorios()
    case 'get':
      return obterRelatorio(String(dados.id))
    case 'save':
      return salvarRelatorio(dados.report as Relatorio, (dados.novos as RelNovoArquivo[]) || [], user)
    case 'action':
      return acaoRelatorio(String(dados.id), String(dados.action), String(dados.note || ''), user)
    case 'extract':
      return extrairArquivo(
        String(dados.name),
        String(dados.dataBase64),
        dados.kind === 'medical' ? 'medical' : 'general',
      )
    case 'export':
      return exportarRelatorio(dados.report as Relatorio, String(dados.section), dados.format === 'doc' ? 'doc' : 'pdf')
    case 'delete':
      await excluirRelatorio(String(dados.id))
      return { ok: true }
    default:
      throw new Error('Operação de relatório desconhecida.')
  }
}

/** Excel/CSV/PDF — PDF com texto ou OCR se for scan. */
export async function extrairArquivo(nome: string, dataBase64: string, kind: 'general' | 'medical') {
  const ext = extensao(nome)
  if (ext === 'pdf') {
    const { extrairPdf } = await import('./assessoriaMbRelatoriosPdf')
    return extrairPdf(nome, dataBase64, kind)
  }
  return extrairPlanilha(nome, dataBase64, kind)
}
