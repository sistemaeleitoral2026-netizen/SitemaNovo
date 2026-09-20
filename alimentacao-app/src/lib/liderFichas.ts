/** Chave estável para agrupar fichas por liderança sem misturar homônimos. */
export function liderNameKey(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

export function liderFichaKey(
  lider: string | null | undefined,
  coordenador: string | null | undefined,
  diretoriaId: string | null | undefined,
) {
  return JSON.stringify([liderNameKey(lider), liderNameKey(coordenador), diretoriaId ?? ''])
}

export function cadastrosLinkForLider(opts: {
  nome: string
  coordenador?: string | null
  diretoriaId?: string | null
}) {
  const params = new URLSearchParams()
  params.set('lider', opts.nome)
  const coord = (opts.coordenador ?? '').trim()
  if (coord && coord !== '—') params.set('coordenador', coord)
  if (opts.diretoriaId) params.set('diretoria', opts.diretoriaId)
  return `/cadastros?${params.toString()}`
}
