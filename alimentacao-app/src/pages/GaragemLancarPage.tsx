import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { History } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/ui/Spinner'
import { supabase } from '../lib/supabase'
import { formatPhone } from '../lib/normalize'
import {
  createGaragemCarro,
  fetchGaragemCarro,
  formatPlacaInput,
  updateGaragemCarro,
} from '../lib/garagem'
import type { Coordenador, Lider } from '../types'

const CORES = ['Branco', 'Preto', 'Prata', 'Cinza', 'Vermelho', 'Azul', 'Verde', 'Amarelo']

const emptyForm = {
  coordenadorId: '',
  liderId: '',
  pessoaNome: '',
  telefone: '',
  placa: '',
  cor: '',
  modelo: '',
}

export function GaragemLancarPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id')

  const isAdmin = profile?.role === 'admin'
  const diretoriaScope = profile?.role === 'diretoria' ? profile.id : null

  const [coordenadores, setCoordenadores] = useState<Coordenador[]>([])
  const [lideres, setLideres] = useState<Lider[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        let coordsQuery = supabase.from('coordenadores').select('*').eq('ativo', true).order('nome')
        let lidsQuery = supabase.from('lideres').select('*').eq('ativo', true).order('nome')
        if (diretoriaScope) {
          coordsQuery = coordsQuery.eq('diretoria_id', diretoriaScope)
          lidsQuery = lidsQuery.eq('diretoria_id', diretoriaScope)
        }

        const [coordsRes, lidsRes, existing] = await Promise.all([
          coordsQuery,
          lidsQuery,
          editId ? fetchGaragemCarro(editId) : Promise.resolve(null),
        ])

        if (coordsRes.error) throw new Error(coordsRes.error.message)
        if (lidsRes.error) throw new Error(lidsRes.error.message)

        const coords = (coordsRes.data ?? []) as Coordenador[]
        const lids = (lidsRes.data ?? []) as Lider[]

        if (existing) {
          if (existing.coordenador_id && !coords.some((c) => c.id === existing.coordenador_id)) {
            const { data } = await supabase
              .from('coordenadores')
              .select('*')
              .eq('id', existing.coordenador_id)
              .maybeSingle()
            if (data) coords.push(data as Coordenador)
          }
          if (existing.lider_id && !lids.some((l) => l.id === existing.lider_id)) {
            const { data } = await supabase
              .from('lideres')
              .select('*')
              .eq('id', existing.lider_id)
              .maybeSingle()
            if (data) lids.push(data as Lider)
          }
        }

        if (cancelled) return
        setCoordenadores(coords)
        setLideres(lids)

        if (existing) {
          setForm({
            coordenadorId: existing.coordenador_id,
            liderId: existing.lider_id ?? '',
            pessoaNome: existing.pessoa_nome,
            telefone: formatPhone(existing.telefone),
            placa: existing.placa,
            cor: existing.cor,
            modelo: existing.modelo,
          })
        } else {
          setForm(emptyForm)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Não foi possível carregar a Garagem.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [diretoriaScope, editId])

  const lideresFiltrados = useMemo(() => {
    if (!form.coordenadorId) return []
    return lideres.filter((l) => l.coordenador_id === form.coordenadorId)
  }, [lideres, form.coordenadorId])

  const coordenador = coordenadores.find((c) => c.id === form.coordenadorId) ?? null
  const lider = lideresFiltrados.find((l) => l.id === form.liderId) ?? null

  function setField<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
    setOk(null)
  }

  function handleCoordenador(value: string) {
    setForm((prev) => {
      const current = lideres.find((l) => l.id === prev.liderId)
      const keepLider = current && current.coordenador_id === value
      return {
        ...prev,
        coordenadorId: value,
        liderId: keepLider ? prev.liderId : '',
      }
    })
    setError(null)
    setOk(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.id) return
    if (!form.coordenadorId || !coordenador) {
      setError('Selecione a coordenação.')
      return
    }
    if (!form.liderId || !lider) {
      setError('Selecione a liderança.')
      return
    }

    setSaving(true)
    setError(null)
    setOk(null)

    const payload = {
      created_by: profile.id,
      diretoria_id: coordenador.diretoria_id || (isAdmin ? null : diretoriaScope),
      coordenador_id: coordenador.id,
      coordenador_nome: coordenador.nome,
      lider_id: lider.id,
      lider_nome: lider.nome,
      pessoa_nome: form.pessoaNome,
      telefone: form.telefone,
      placa: form.placa,
      cor: form.cor,
      modelo: form.modelo,
    }

    try {
      if (editId) {
        await updateGaragemCarro(editId, payload)
        setOk('Registro atualizado.')
        window.setTimeout(() => navigate('/garagem/historico'), 600)
      } else {
        await createGaragemCarro(payload)
        setOk('Carro lançado.')
        setForm({
          coordenadorId: form.coordenadorId,
          liderId: '',
          pessoaNome: '',
          telefone: '',
          placa: '',
          cor: '',
          modelo: '',
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="gg-page">
        <div className="gg-loading">
          <Spinner size={36} />
        </div>
      </div>
    )
  }

  return (
    <div className="gg-page">
      <header className="gg-header">
        <div>
          <p className="gg-kicker">Garagem</p>
          <h1>{editId ? 'Editar carro' : 'Lançar carro'}</h1>
          <p className="gg-sub">
            Coordenação e liderança são obrigatórias. Nome, placa, cor e modelo podem ficar em branco.
          </p>
        </div>
        <Link to="/garagem/historico" className="gg-link">
          <History size={15} />
          Histórico
        </Link>
      </header>

      <form className="gg-layout" onSubmit={handleSubmit}>
        <section className="gg-panel">
          <div className="gg-panel-head">
            <span className="gg-step">01</span>
            <div>
              <h2>Indicação</h2>
              <p>Coordenação e liderança que indicam o carro.</p>
            </div>
          </div>

          <label className="gg-label">
            Coordenação
            <em>obrigatório</em>
          </label>
          <select
            className="gg-select"
            value={form.coordenadorId}
            onChange={(e) => handleCoordenador(e.target.value)}
            required
          >
            <option value="">Selecione a coordenação</option>
            {coordenadores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>

          {coordenador && (
            <div className="gg-coord-card">
              <span>Coordenador</span>
              <strong>{coordenador.nome}</strong>
            </div>
          )}

          <label className="gg-label">
            Liderança
            <em>obrigatório</em>
          </label>
          <select
            className="gg-select"
            value={form.liderId}
            onChange={(e) => setField('liderId', e.target.value)}
            disabled={!form.coordenadorId}
            required
          >
            <option value="">
              {form.coordenadorId ? 'Selecione a liderança' : 'Selecione a coordenação primeiro'}
            </option>
            {lideresFiltrados.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </section>

        <section className="gg-panel">
          <div className="gg-panel-head">
            <span className="gg-step">02</span>
            <div>
              <h2>Veículo</h2>
              <p>Dados do carro e de quem conduz. Nenhum campo obrigatório.</p>
            </div>
          </div>

          <div className="gg-plate" aria-hidden>
            <span className="gg-plate-br">BR</span>
            <strong>{form.placa || 'ABC-1D23'}</strong>
            <em>{form.modelo || 'modelo'}</em>
          </div>

          <div className="gg-grid">
            <label className="gg-field">
              Nome da pessoa
              <input
                className="gg-input"
                value={form.pessoaNome}
                onChange={(e) => setField('pessoaNome', e.target.value)}
                placeholder="Quem conduz ou ficou com o carro"
                autoComplete="off"
              />
            </label>
            <label className="gg-field">
              WhatsApp do motorista
              <input
                className="gg-input"
                value={form.telefone}
                onChange={(e) => setField('telefone', formatPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
                autoComplete="off"
              />
            </label>
            <label className="gg-field">
              Placa
              <input
                className="gg-input gg-input-placa"
                value={form.placa}
                onChange={(e) => setField('placa', formatPlacaInput(e.target.value))}
                placeholder="ABC-1D23"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="gg-field">
              Cor
              <input
                className="gg-input"
                value={form.cor}
                onChange={(e) => setField('cor', e.target.value)}
                placeholder="Branco, prata…"
                autoComplete="off"
                list="gg-cores"
              />
              <datalist id="gg-cores">
                {CORES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <div className="gg-swatches">
                {CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`gg-swatch${form.cor.toLowerCase() === c.toLowerCase() ? ' is-on' : ''}`}
                    onClick={() => setField('cor', c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </label>
            <label className="gg-field">
              Modelo
              <input
                className="gg-input"
                value={form.modelo}
                onChange={(e) => setField('modelo', e.target.value)}
                placeholder="Uno, Gol, Onix…"
                autoComplete="off"
              />
            </label>
          </div>
        </section>

        <div className="gg-actions">
          {error && <p className="alert alert-error">{error}</p>}
          {ok && <p className="alert alert-success">{ok}</p>}
          <div className="gg-actions-row">
            {editId ? (
              <Link to="/garagem/historico" className="gg-btn ghost">
                Cancelar
              </Link>
            ) : (
              <button
                type="button"
                className="gg-btn ghost"
                onClick={() => setForm({ ...emptyForm, coordenadorId: form.coordenadorId })}
              >
                Limpar campos
              </button>
            )}
            <button type="submit" className="gg-btn primary" disabled={saving || !form.coordenadorId || !form.liderId}>
              {saving ? 'Salvando…' : editId ? 'Salvar alteração' : 'Lançar carro'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
