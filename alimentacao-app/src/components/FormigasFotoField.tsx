import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, ImagePlus, X } from 'lucide-react'
import { FORMIGAS_MAX_FOTOS, getFormigasFotoUrls } from '../lib/ativacao'

type KeptFoto = { path: string; url: string }
type NewFoto = { file: File; preview: string }

export function FormigasFotoField({
  label,
  keptPaths,
  onKeptPathsChange,
  newFiles,
  onNewFilesChange,
  disabled,
  requiredHint,
}: {
  label: string
  keptPaths: string[]
  onKeptPathsChange: (paths: string[]) => void
  newFiles: File[]
  onNewFilesChange: (files: File[]) => void
  disabled?: boolean
  requiredHint?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [kept, setKept] = useState<KeptFoto[]>([])
  const [news, setNews] = useState<NewFoto[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getFormigasFotoUrls(keptPaths).then((urls) => {
      if (cancelled) return
      setKept(keptPaths.map((path, i) => ({ path, url: urls[i] ?? '' })).filter((f) => f.url))
    })
    return () => { cancelled = true }
  }, [keptPaths])

  useEffect(() => {
    const next = newFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setNews(next)
    return () => {
      next.forEach((n) => URL.revokeObjectURL(n.preview))
    }
  }, [newFiles])

  useEffect(() => {
    if (!lightbox) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [lightbox])

  const total = keptPaths.length + newFiles.length
  const slots = Math.max(0, FORMIGAS_MAX_FOTOS - total)

  function addFiles(list: FileList | null) {
    if (!list || disabled || slots <= 0) return
    const accepted = Array.from(list)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, slots)
    if (!accepted.length) return
    onNewFilesChange([...newFiles, ...accepted])
    if (inputRef.current) inputRef.current.value = ''
  }

  function removeKept(path: string) {
    onKeptPathsChange(keptPaths.filter((p) => p !== path))
  }

  function removeNew(idx: number) {
    onNewFilesChange(newFiles.filter((_, i) => i !== idx))
  }

  return (
    <div className="fl-foto-field">
      <div className="fl-foto-head">
        <span className="fl-label-sm">
          <Camera size={14} /> {label}
        </span>
        <em className="fl-foto-count">{total}/{FORMIGAS_MAX_FOTOS}</em>
      </div>
      {requiredHint ? <p className="fl-hint fl-foto-hint">{requiredHint}</p> : null}

      <div className="fl-foto-grid">
        {kept.map((f) => (
          <div key={f.path} className="fl-foto-tile">
            <button type="button" className="fl-foto-open" onClick={() => setLightbox(f.url)} aria-label="Ampliar foto">
              <img src={f.url} alt="" loading="lazy" decoding="async" />
            </button>
            {!disabled && (
              <button type="button" className="fl-foto-remove" onClick={() => removeKept(f.path)} aria-label="Remover foto">
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {news.map((f, idx) => (
          <div key={`${f.file.name}-${idx}`} className="fl-foto-tile is-new">
            <button type="button" className="fl-foto-open" onClick={() => setLightbox(f.preview)} aria-label="Ampliar preview">
              <img src={f.preview} alt="" loading="lazy" decoding="async" />
            </button>
            {!disabled && (
              <button type="button" className="fl-foto-remove" onClick={() => removeNew(idx)} aria-label="Remover foto">
                <X size={12} />
              </button>
            )}
            <span className="fl-foto-badge">Novo</span>
          </div>
        ))}

        {slots > 0 && !disabled && (
          <label htmlFor={inputId} className="fl-foto-add">
            <ImagePlus size={20} strokeWidth={2} />
            <span>Foto</span>
            <input
              id={inputId}
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              disabled={disabled}
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
        )}
      </div>

      {lightbox
        && createPortal(
          <div className="fl-foto-lightbox" role="presentation" onClick={() => setLightbox(null)}>
            <div className="fl-foto-lightbox-card" onClick={(e) => e.stopPropagation()}>
              <header className="fl-foto-lightbox-head">
                <strong>{label}</strong>
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

/** Botão compacto no Painel: ícone de foto + lightbox com cabeçalho. */
export function FormigasFotoThumbButton({
  paths,
  title,
  subtitle,
}: {
  paths: string[]
  title: string
  subtitle?: string
}) {
  const [open, setOpen] = useState(false)
  const [urls, setUrls] = useState<string[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
      if (e.key === 'ArrowRight' && urls.length > 1) setIdx((i) => (i + 1) % urls.length)
      if (e.key === 'ArrowLeft' && urls.length > 1) setIdx((i) => (i - 1 + urls.length) % urls.length)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, urls.length])

  if (!paths.length) return null

  async function openGallery() {
    setOpen(true)
    setIdx(0)
    if (urls.length === paths.length) return
    setLoading(true)
    const next = await getFormigasFotoUrls(paths)
    setUrls(next)
    setLoading(false)
  }

  const current = urls[idx]

  return (
    <>
      <button
        type="button"
        className="ativacao-foto-chip"
        onClick={() => void openGallery()}
        title={`${paths.length} foto${paths.length === 1 ? '' : 's'} — ${title}`}
        aria-label={`Ver fotos: ${title}`}
      >
        <Camera size={13} strokeWidth={2.25} />
        <span>{paths.length}</span>
      </button>

      {open
        && createPortal(
          <div className="fl-foto-lightbox" role="presentation" onClick={() => setOpen(false)}>
            <div className="fl-foto-lightbox-card" onClick={(e) => e.stopPropagation()}>
              <header className="fl-foto-lightbox-head">
                <div className="fl-foto-lightbox-titles">
                  <strong>{title}</strong>
                  {subtitle ? <span>{subtitle}</span> : null}
                </div>
                <button type="button" className="fl-foto-lightbox-x" onClick={() => setOpen(false)} aria-label="Fechar">
                  <X size={18} />
                </button>
              </header>
              <div className="fl-foto-lightbox-body">
                {loading && <p className="fl-foto-lightbox-loading">Carregando…</p>}
                {!loading && current && <img src={current} alt={title} decoding="async" />}
                {!loading && !current && <p className="fl-foto-lightbox-loading">Não foi possível abrir a foto.</p>}
              </div>
              {urls.length > 1 && (
                <footer className="fl-foto-lightbox-foot">
                  <button type="button" onClick={() => setIdx((i) => (i - 1 + urls.length) % urls.length)}>
                    Anterior
                  </button>
                  <em>
                    {idx + 1}/{urls.length}
                  </em>
                  <button type="button" onClick={() => setIdx((i) => (i + 1) % urls.length)}>
                    Próxima
                  </button>
                </footer>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
