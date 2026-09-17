import { useCallback, useState } from 'react'
import { FolderOpen, Info, Upload } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { parseSpreadsheet, analyzeImport, SPREADSHEET_ACCEPT } from '../lib/import'
import { fetchExistingTitulos } from '../lib/cadastros'
import { geocodeFromCep } from '../lib/geocode'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type { ImportPreview } from '../types'

export function ImportarPage() {
  const { profile } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const processFile = useCallback(async (f: File) => {
    setError(null)
    setSuccess(null)
    setLoading(true)
    setFile(f)
    try {
      const rows = await parseSpreadsheet(f)
      const existingTitulos = await fetchExistingTitulos()
      const result = await analyzeImport(rows, existingTitulos)
      setPreview(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo.')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files[0]
    if (f) processFile(f)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) processFile(f)
  }

  async function handleConfirm() {
    if (!preview || !file || !profile) return
    setConfirming(true)
    setError(null)

    const validRows = preview.linhas.filter((l) => l.status === 'valido')
    const errorLines = preview.linhas
      .filter((l) => l.status !== 'valido')
      .map((l) => ({
        linha: l.linha,
        mensagem: l.mensagem ?? l.status,
        dados: { titulo: l.titulo, nome: l.nome_completo },
      }))

    const { data: importRow, error: importError } = await supabase
      .from('importacoes')
      .insert({
        operator_id: profile.id,
        nome_arquivo: file.name,
        total: preview.total,
        validos: 0,
        duplicados: preview.duplicados,
        erros: preview.erros,
        confirmada: false,
        detalhes: { linhas: errorLines },
      })
      .select('id')
      .single()

    if (importError) {
      setError(importError.message)
      setConfirming(false)
      return
    }

    let inserted = 0
    for (const row of validRows) {
      const coords = row.cep ? await geocodeFromCep(row.cep) : null
      const { error: insertError } = await supabase.from('cadastros').insert({
        operator_id: profile.id,
        nome_completo: row.nome_completo,
        cpf: row.cpf || null,
        telefone: row.telefone,
        titulo: row.titulo,
        zona: row.zona,
        secao: row.secao,
        nome_mae: row.nome_mae,
        coordenador: row.coordenador || '',
        lider: row.lider || '',
        data_nascimento: row.data_nascimento || null,
        cep: row.cep || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        diretoria_id: profile.diretoria_id ?? null,
      })
      if (!insertError) inserted += 1
    }

    await supabase
      .from('importacoes')
      .update({ validos: inserted, confirmada: true })
      .eq('id', importRow.id)

    await logAudit('importar', 'importacoes', importRow.id, {
      arquivo: file.name,
      validos: inserted,
      total: preview.total,
    })

    setConfirming(false)
    setSuccess(`${inserted} cadastro(s) importado(s) com sucesso.`)
    setPreview(null)
    setFile(null)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Importar Planilha</h1>
          <p className="page-subtitle">
            Importe a planilha com os cabeçalhos oficiais. Aceita Excel, CSV e ODS.
          </p>
        </div>
      </div>

      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          className={`dropzone ${dragActive ? 'active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <div className="dropzone-icon">
            <Upload size={26} color="#2f6fed" />
          </div>
          <strong style={{ fontSize: '1rem', fontWeight: 700 }}>Arraste e solte sua planilha aqui</strong>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.84rem', margin: '0.3rem 0 1rem' }}>
            Ou clique para selecionar um arquivo no seu computador
          </p>
          <span className="dropzone-select"><FolderOpen size={15} /> Selecionar arquivo</span>
          <p style={{ color: '#8a95a7', fontSize: '0.72rem', margin: '1rem 0 0' }}>
            Formatos aceitos: .xlsx, .xls, .xlsm, .xlsb, .csv, .ods, .tsv, .txt
          </p>
          <input
            id="file-input"
            type="file"
            accept={SPREADSHEET_ACCEPT}
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>

        <div className="headers-box">
          <Info size={18} color="#6c788d" />
          <div>
            <strong>Cabeçalhos obrigatórios (1ª linha):</strong>
            <span>NOME COMPLETO | TELEFONE | TITULO | ZONA | SESSAO | NOME COMPLETO DA MÃE</span>
            <span style={{ color: '#6c788d', fontWeight: 500, marginTop: '.35rem' }}>
              Opcional: COORDENADOR | DATA DE NASCIMENTO
            </span>
          </div>
        </div>

        {file && (
          <p style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
            Arquivo: <strong>{file.name}</strong>
          </p>
        )}

        {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}
        {success && <div className="alert alert-success" style={{ marginTop: '1rem' }}>{success}</div>}
      </Card>

      {loading && (
        <Card>
          <EmptyState title="Analisando planilha..." description="Aguarde enquanto validamos os dados." />
        </Card>
      )}

      {preview && !loading && (
        <Card title="Análise da importação">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div><span className="badge badge-neutral">Total: {preview.total}</span></div>
            <div><span className="badge badge-success">Válidos: {preview.validos}</span></div>
            <div><span className="badge badge-warning">Duplicados: {preview.duplicados}</span></div>
            <div><span className="badge badge-danger">Erros: {preview.erros}</span></div>
          </div>

          {preview.linhas.some((l) => l.status !== 'valido') && (
            <div className="table-wrapper" style={{ marginBottom: '1.5rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Status</th>
                    <th>Nome</th>
                    <th>Título</th>
                    <th>Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.linhas
                    .filter((l) => l.status !== 'valido')
                    .map((l) => (
                      <tr key={l.linha}>
                        <td>{l.linha}</td>
                        <td>
                          <span className={`badge ${l.status === 'duplicado' ? 'badge-warning' : 'badge-danger'}`}>
                            {l.status}
                          </span>
                        </td>
                        <td>{l.nome_completo}</td>
                        <td>{l.titulo}</td>
                        <td>{l.mensagem}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.validos > 0 && (
            <Button onClick={handleConfirm} loading={confirming}>
              Confirmar Importação
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
