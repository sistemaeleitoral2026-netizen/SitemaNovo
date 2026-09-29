import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Bike,
  Car,
  ExternalLink,
  Home,
  Link2,
  MapPin,
  Pencil,
  X,
} from 'lucide-react'
import { WhatsAppLink } from './ui/WhatsAppLink'
import { formatPhone } from '../lib/format'
import { useAuth } from '../contexts/AuthContext'
import { FormigasSectionLock } from './FormigasSectionLock'
import {
  casaStatusLabel,
  getFormigasFotoUrls,
  hydrateFormigasSectionDates,
  mapsUrlForPessoa,
  type AtivacaoPessoa,
} from '../lib/ativacao'

function waLabel(status: AtivacaoPessoa['contato_whatsapp_status']) {
  if (status === 'sim') return 'Já acionada'
  if (status === 'sem') return 'Sem WhatsApp'
  return 'Não acionada'
}

function FotoGrid({
  paths,
  label,
}: {
  paths: string[]
  label: string
}) {
  const [urls, setUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!paths.length) {
      setUrls([])
      return
    }
    setLoading(true)
    void getFormigasFotoUrls(paths).then((next) => {
      if (!cancelled) {
        setUrls(next)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [paths.join('|')])

  if (!paths.length) return null

  return (
    <div className="ffv-photos">
      <span className="ffv-section-label">{label}</span>
      {loading && <p className="ffv-muted">Carregando fotos…</p>}
      {!loading && (
        <div className="ffv-photo-grid">
          {urls.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              className="ffv-photo"
              onClick={() => setLightbox(url)}
              aria-label={`Ampliar foto ${i + 1}`}
            >
              <img src={url} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
          {!urls.length && <p className="ffv-muted">Não foi possível carregar as fotos.</p>}
        </div>
      )}
      {lightbox && createPortal(
        <div className="fl-foto-lightbox" role="presentation" onClick={() => setLightbox(null)}>
          <div className="fl-foto-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <header className="fl-foto-lightbox-head">
              <div className="fl-foto-lightbox-titles">
                <strong>{label}</strong>
              </div>
              <button type="button" className="fl-foto-lightbox-x" onClick={() => setLightbox(null)} aria-label="Fechar">
                <X size={18} />
              </button>
            </header>
            <div className="fl-foto-lightbox-body">
              <img src={lightbox} alt={label} decoding="async" />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

export function FormigasFichaPreviewModal({
  pessoa,
  onClose,
}: {
  pessoa: AtivacaoPessoa
  onClose: () => void
}) {
  const { profile } = useAuth()
  const [ficha, setFicha] = useState(pessoa)

  useEffect(() => {
    setFicha(pessoa)
    void hydrateFormigasSectionDates(pessoa).then(setFicha)
  }, [pessoa.id, pessoa.tipo])
  const mapUrl = mapsUrlForPessoa(ficha)
  const enderecoLinha = [
    ficha.endereco,
    ficha.numero && `nº ${ficha.numero}`,
    ficha.bairro,
    ficha.cep,
  ].filter(Boolean).join(', ')
  const hasVeiculo = ficha.carros_adesivados > 0 || ficha.motos_adesivadas > 0
  const hasCasa =
    ficha.adesivos_casa_status === 'sim'
    || ficha.adesivos_casa_status === 'talvez'
    || ficha.adesivos_casa > 0
  const lockProps = {
    userId: profile?.id,
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="ffv-backdrop" role="presentation" onClick={onClose}>
      <div
        className="ffv-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${pessoa.nome}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="ffv-head">
          <div>
            <h3>{pessoa.nome}</h3>
            <p>
              {[
                pessoa.tipoLabel,
                pessoa.titulo && `Título ${pessoa.titulo}`,
                pessoa.zona && `Zona ${pessoa.zona}`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" className="ffv-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="ffv-body">
          <section className="ffv-card">
            <span className="ffv-section-label">Dados do cadastro</span>
            <div className="ffv-grid">
              <div>
                <em>Telefone</em>
                <strong>{pessoa.telefone ? formatPhone(pessoa.telefone) : '—'}</strong>
              </div>
              <div>
                <em>Bairro</em>
                <strong>{pessoa.bairro || '—'}</strong>
              </div>
              <div>
                <em>Coordenador</em>
                <strong>{pessoa.coordenador || '—'}</strong>
              </div>
              <div>
                <em>Liderança</em>
                <strong>{pessoa.lider || '—'}</strong>
              </div>
            </div>
          </section>

          <section className="ffv-card">
            <span className="ffv-section-label">WhatsApp</span>
            <div className="ffv-row">
              <strong>{waLabel(ficha.contato_whatsapp_status)}</strong>
            </div>
            <FormigasSectionLock
              ownerId={ficha.formigas_wa_by}
              ownerNome={ficha.formigas_wa_by_nome}
              at={ficha.formigas_wa_em}
              {...lockProps}
            />
          </section>

          <section className="ffv-card">
            <span className="ffv-section-label">Veículos adesivados</span>
            {hasVeiculo ? (
              <>
                <div className="ffv-chips">
                  {ficha.carros_adesivados > 0 && (
                    <span className="ffv-chip">
                      <Car size={13} />
                      {ficha.carros_adesivados}
                      {' '}
                      carro
                      {ficha.carros_adesivados === 1 ? '' : 's'}
                    </span>
                  )}
                  {ficha.motos_adesivadas > 0 && (
                    <span className="ffv-chip">
                      <Bike size={13} />
                      {ficha.motos_adesivadas}
                      {' '}
                      moto
                      {ficha.motos_adesivadas === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <FormigasSectionLock
                  ownerId={ficha.formigas_carros_by}
                  ownerNome={ficha.formigas_carros_by_nome}
                  at={ficha.formigas_carros_em}
                  {...lockProps}
                />
                <FotoGrid paths={ficha.foto_veiculo_paths} label="Fotos do veículo" />
              </>
            ) : (
              <p className="ffv-muted">Nenhum veículo registrado.</p>
            )}
          </section>

          <section className="ffv-card">
            <span className="ffv-section-label">Adesivo residencial</span>
            {hasCasa ? (
              <>
                <div className="ffv-row">
                  <span className={`ffv-pill${ficha.adesivos_casa_status === 'talvez' ? ' warn' : ' ok'}`}>
                    <Home size={12} />
                    {casaStatusLabel(ficha.adesivos_casa_status)}
                  </span>
                </div>
                <FormigasSectionLock
                  ownerId={ficha.formigas_casa_by}
                  ownerNome={ficha.formigas_casa_by_nome}
                  at={ficha.formigas_casa_em}
                  {...lockProps}
                />
                {enderecoLinha && (
                  <p className="ffv-addr">
                    <MapPin size={13} />
                    {enderecoLinha}
                  </p>
                )}
                {mapUrl && (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ffv-map-link"
                  >
                    <ExternalLink size={13} />
                    Abrir localização no mapa
                  </a>
                )}
                <FotoGrid paths={ficha.foto_casa_paths} label="Fotos da casa" />
              </>
            ) : (
              <p className="ffv-muted">Sem adesivo residencial.</p>
            )}
          </section>

          <section className="ffv-card">
            <span className="ffv-section-label">Links de postagem</span>
            {ficha.postagem_links.length ? (
              <ul className="ffv-links">
                {ficha.postagem_links.map((link) => (
                  <li key={link}>
                    <Link2 size={12} />
                    <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ffv-muted">Nenhum link registrado.</p>
            )}
            <FormigasSectionLock
              ownerId={ficha.formigas_links_by}
              ownerNome={ficha.formigas_links_by_nome}
              at={ficha.formigas_links_em}
              {...lockProps}
            />
          </section>

          <section className="ffv-card">
            <span className="ffv-section-label">Observações</span>
            <p className="ffv-notes">
              {ficha.ativacao_notas?.trim() || 'Nenhuma observação registrada.'}
            </p>
          </section>
        </div>

        <footer className="ffv-foot">
          {pessoa.telefone ? (
            <WhatsAppLink
              phone={pessoa.telefone}
              showLabel
              label="Abrir WhatsApp"
              className="ffv-btn ghost"
            />
          ) : <span />}
          <div className="ffv-foot-right">
            <button type="button" className="ffv-btn ghost" onClick={onClose}>
              Fechar
            </button>
            <Link
              to={`/ativacao/lancar?tipo=${pessoa.tipo}&id=${pessoa.id}`}
              className="ffv-btn primary"
              onClick={onClose}
            >
              <Pencil size={14} />
              Editar no Lançar
            </Link>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
