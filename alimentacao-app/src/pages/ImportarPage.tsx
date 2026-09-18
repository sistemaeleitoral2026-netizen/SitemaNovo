import { useCallback, useMemo, useState } from 'react'
import { FolderOpen, Info, Upload } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { parseSpreadsheet, analyzeImport, SPREADSHEET_ACCEPT } from '../lib/import'
import { fetchExistingImportKeys } from '../lib/cadastros'
import { geocodeFromZona } from '../lib/geocode'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import type {
  Coordenador,
  ImportExistingKeys,
  ImportPreview,
  ImportPreviewRow,
  ImportTeamContext,
  Lider,
} from '../types'

export function ImportarPage() {
  const { profile } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([])
  const [existingKeys, setExistingKeys] = useState<ImportExistingKeys | null>(null)
  const [team, setTeam] = useState<ImportTeamContext | null>(null)
  const [importedRows, setImportedRows] = useState<ImportPreviewRow[]>([])
  const [importProgress, setImportProgress] = useState<{ atual: number; total: number } | null>(null)

  const coordenadores = useMemo(() => team?.coordenadores ?? [], [team])
  const lideres = useMemo(() => team?.lideres ?? [], [team])

  const processFile = useCallback(async (f: File) => {
    setError(null)
    setSuccess(null)
    setLoading(true)
    setFile(f)
    try {
      const rows = await parseSpreadsheet(f)
      if (!profile) throw new Error('Sessão não encontrada. Entre novamente no sistema.')

      const diretoriaId = profile.role === 'diretoria' ? profile.id : profile.diretoria_id
      let coordenadoresQuery = supabase.from('coordenadores').select('*').eq('ativo', true)
      let lideresQuery = supabase.from('lideres').select('*').eq('ativo', true)
      if (diretoriaId) {
        coordenadoresQuery = coordenadoresQuery.eq('diretoria_id', diretoriaId)
        lideresQuery = lideresQuery.eq('diretoria_id', diretoriaId)
      }

      const [existingKeys, coordenadoresResult, lideresResult] = await Promise.all([
        fetchExistingImportKeys(),
        coordenadoresQuery,
        lideresQuery,
      ])
      if (coordenadoresResult.error) throw coordenadoresResult.error
      if (lideresResult.error) throw lideresResult.error

      const team: ImportTeamContext = {
        coordenadores: (coordenadoresResult.data ?? []) as Coordenador[],
        lideres: (lideresResult.data ?? []) as Lider[],
        coordenador_id: profile.coordenador_id,
        lider_id: profile.lider_id,
      }
      const result = await analyzeImport(rows, existingKeys, team)
      setParsedRows(rows)
      setExistingKeys(existingKeys)
      setTeam(team)
      setImportedRows([])
      setPreview(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo.')
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [profile])

  async function updateTeamMember(
    rowIndex: number,
    field: 'coordenador' | 'lider',
    value: string,
  ) {
    if (!existingKeys || !team) return
    const nextRows = parsedRows.map((row, index) => (
      index === rowIndex ? { ...row, [field]: value } : row
    ))

    if (field === 'lider') {
      const selectedLeader = team.lideres.find((leader) => leader.nome === value)
      const selectedCoordinator = selectedLeader?.coordenador_id
        ? team.coordenadores.find((coordinator) => coordinator.id === selectedLeader.coordenador_id)
        : null
      if (selectedCoordinator) nextRows[rowIndex].coordenador = selectedCoordinator.nome
    }

    setParsedRows(nextRows)
    setPreview(await analyzeImport(nextRows, existingKeys, team))
  }

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
    const insertedRows: ImportPreviewRow[] = []
    const insertionErrors: typeof errorLines = []
    setImportProgress({ atual: 0, total: validRows.length })
    for (const [index, row] of validRows.entries()) {
      setImportProgress({ atual: index + 1, total: validRows.length })
      const coords = row.zona ? await geocodeFromZona(row.zona) : null
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
      if (!insertError) {
        inserted += 1
        insertedRows.push(row)
      } else {
        insertionErrors.push({
          linha: row.linha,
          mensagem: insertError.message,
          dados: { titulo: row.titulo, nome: row.nome_completo },
        })
      }
    }

    await supabase
      .from('importacoes')
      .update({
        validos: inserted,
        erros: preview.erros + insertionErrors.length,
        confirmada: true,
        detalhes: { linhas: [...errorLines, ...insertionErrors] },
      })
      .eq('id', importRow.id)

    await logAudit('importar', 'importacoes', importRow.id, {
      arquivo: file.name,
      validos: inserted,
      total: preview.total,
    })

    setConfirming(false)
    setImportProgress(null)
    setImportedRows(insertedRows)
    if (insertionErrors.length) {
      setError(`${inserted} cadastro(s) importado(s). ${insertionErrors.length} falharam e não foram incluídos.`)
    } else {
      setSuccess(`${inserted} cadastro(s) importado(s) com sucesso.`)
    }
    setPreview(null)
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
            <span>NOME COMPLETO | TELEFONE | TÍTULO | ZONA | SESSÃO | NOME DA MÃE COMPLETO</span>
            <span style={{ color: '#6c788d', fontWeight: 500, marginTop: '.35rem' }}>
              Opcional: LIDERANÇA | COORDENADOR | CPF | DATA DE NASCIMENTO. Os nomes da equipe são conferidos com os cadastros existentes.
            </span>
          </div>
        </div>

        {file && (
          <div style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
            <p style={{ margin: 0 }}>Arquivo: <strong>{file.name}</strong></p>
            <p style={{ margin: '.35rem 0 0' }}>
              Nerite responsável: <strong>{profile?.nome ?? 'não identificada'}</strong>
            </p>
          </div>
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
          {preview.linhas.length > 0 && (
            <p style={{ margin: '0 0 1rem', color: 'var(--color-text-muted)', fontSize: '.875rem' }}>
              Equipe aplicada às fichas: coordenador <strong>{preview.linhas[0].coordenador || 'não identificado'}</strong>
              {' '}e liderança <strong>{preview.linhas[0].lider || 'não identificada'}</strong>.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div><span className="badge badge-neutral">Total: {preview.total}</span></div>
            <div><span className="badge badge-success">Válidos: {preview.validos}</span></div>
            <div><span className="badge badge-warning">Duplicados: {preview.duplicados}</span></div>
            <div><span className="badge badge-danger">Erros: {preview.erros}</span></div>
          </div>

          <p style={{ margin: '0 0 1rem', fontWeight: 700 }}>
            {preview.validos} de {preview.total} ficha(s) serão importadas.
          </p>

          {preview.linhas.length > 0 && (
            <div className="table-wrapper" style={{ marginBottom: '1.5rem' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Status</th>
                    <th>Nome</th>
                    <th>Título</th>
                    <th>Coordenador</th>
                    <th>Liderança</th>
                    <th>Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.linhas.map((l, rowIndex) => (
                      <tr key={l.linha}>
                        <td>{l.linha}</td>
                        <td>
                          <span className={`badge ${l.status === 'duplicado' ? 'badge-warning' : 'badge-danger'}`}>
                            {l.status}
                          </span>
                        </td>
                        <td>{l.nome_completo}</td>
                        <td>{l.titulo}</td>
                        <td>
                          <select
                            value={l.coordenador}
                            onChange={(event) => updateTeamMember(rowIndex, 'coordenador', event.target.value)}
                            style={{ minWidth: 160 }}
                            aria-label={`Coordenador da linha ${l.linha}`}
                          >
                            <option value="">Selecione</option>
                            {coordenadores.map((coordinator) => (
                              <option key={coordinator.id} value={coordinator.nome}>{coordinator.nome}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={l.lider}
                            onChange={(event) => updateTeamMember(rowIndex, 'lider', event.target.value)}
                            style={{ minWidth: 170 }}
                            aria-label={`Liderança da linha ${l.linha}`}
                          >
                            <option value="">Selecione</option>
                            {lideres
                              .filter((leader) => {
                                const coordinator = coordenadores.find((item) => item.nome === l.coordenador)
                                return !coordinator || !leader.coordenador_id || leader.coordenador_id === coordinator.id
                              })
                              .map((leader) => (
                                <option key={leader.id} value={leader.nome}>{leader.nome}</option>
                              ))}
                          </select>
                        </td>
                        <td>{l.mensagem ?? 'Pronta para importar'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.validos > 0 && (
            <Button onClick={handleConfirm} loading={confirming}>
              {importProgress
                ? `Importando ${importProgress.atual} de ${importProgress.total}`
                : `Importar ${preview.validos} ficha(s)`}
            </Button>
          )}
        </Card>
      )}

      {importedRows.length > 0 && (
        <Card title={`Fichas importadas (${importedRows.length})`}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Título</th>
                  <th>Zona/Seção</th>
                  <th>Coordenador</th>
                  <th>Liderança</th>
                </tr>
              </thead>
              <tbody>
                {importedRows.map((row) => (
                  <tr key={`${row.linha}-${row.titulo}`}>
                    <td>{row.nome_completo}</td>
                    <td>{row.titulo}</td>
                    <td>{row.zona}/{row.secao}</td>
                    <td>{row.coordenador}</td>
                    <td>{row.lider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
