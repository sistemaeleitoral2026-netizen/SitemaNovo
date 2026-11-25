/**
 * Classificação de lançamentos médicos da Assessoria MB.
 * A classificação é por lançamento (serviço), nunca só por CPF/médico.
 */

export type CatMedica =
  | 'Plantonistas'
  | 'Especialistas'
  | 'PSF / referência'
  | 'Não classificado'

function clean(s: unknown) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function norm(s: unknown) {
  return clean(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

/** Detecta o modelo do documento pelos cabeçalhos / título / nome do arquivo. */
export function detectarModeloMedico(nomeArquivo: string, textoCabecalho = ''): CatMedica {
  const n = norm(`${nomeArquivo} ${textoCabecalho}`)
  // Cabeçalhos de coluna têm prioridade sobre o nome do arquivo
  if (/\bESPECIALIDADE\b/.test(n) && !/\bPLANTAO\b/.test(n)) return 'Especialistas'
  if (/\bPLANTAO\b/.test(n) && !/\bESPECIALIDADE\b/.test(n)) return 'Plantonistas'
  if (/ESPECIALIST/.test(n)) return 'Especialistas'
  if (/PLANTONIST/.test(n)) return 'Plantonistas'
  if (/\bPSF\b/.test(n) || /UNIDADE BASICA|UBS/.test(n) && /REFERENCIA|CADASTRO|AJUDA DE CUSTO/.test(n))
    return 'PSF / referência'
  if (/\bPSF\b/.test(n)) return 'PSF / referência'
  return 'Não classificado'
}

const RE_PLANTAO =
  /\bPLANTO?E?S?\b|\bPLANTAO\b|\bPLANTOES\b|URGENCIA|EMERGENCIA|12\s*HORAS|24\s*HORAS|DIRETOR\s+CLINIC|DIRECAO\s+CLINIC|ATENCAO\s+DOMICILIAR|CIRURGIAO\s+GERAL|ANESTESISTA/

const RE_ESPECIAL =
  /\bESPECIALIDADE\b|DERMATOLOG|GINECOLOG|PEDIATR|ULTRASSON|CARDIOLOG|ENDOCRIN|NUTROLOG|GASTROENTER|ORTOPED|NEUROPEDIAT|NEUROLOG|OFTALMOLOG|OTORRINO|PSIQUIATR|RADIOLOG|UROLOG|ANGIOLOG|REUMATOLOG|HEMATOLOG|ONCOLOG|NEFROLOG|PNEUMOLOG|\bEXAMES?\b|\bCONSULTAS?\b|\bPROCEDIMENTOS?\b/

/**
 * Classifica um lançamento pelo texto do serviço / colunas.
 * Se o documento já for claramente de um modelo, usa como padrão quando o
 * serviço não contradiz.
 */
export function classificarLancamentoMedico(opts: {
  ref?: string
  profession?: string
  location?: string
  notes?: string
  name?: string
  /** Modelo sugerido pelo documento de origem (cabeçalhos). */
  modeloDocumento?: CatMedica | string
}): CatMedica {
  const modelo = opts.modeloDocumento as CatMedica | undefined
  if (modelo === 'PSF / referência') return 'PSF / referência'

  const servico = norm([opts.ref, opts.profession, opts.location, opts.notes].filter(Boolean).join(' '))
  const temPlantao = RE_PLANTAO.test(servico)
  const temEspecial = RE_ESPECIAL.test(servico)

  if (temPlantao && !temEspecial) return 'Plantonistas'
  if (temEspecial && !temPlantao) return 'Especialistas'
  // Conflito raro: preferir o modelo do documento
  if (temPlantao && temEspecial) {
    if (modelo === 'Plantonistas' || modelo === 'Especialistas') return modelo
    // "plantão" costuma ser mais específico que "exame" genérico
    if (/\bPLANTO/.test(servico)) return 'Plantonistas'
    return 'Especialistas'
  }

  // Sem indício no serviço: herda o modelo do documento se for plantão/especialista
  if (modelo === 'Plantonistas' || modelo === 'Especialistas') return modelo

  // Só nome/CPF/valor → classificação manual
  return 'Não classificado'
}

/** Aplica classificação a uma lista já extraída. */
export function aplicarClassificacaoMedica<
  T extends {
    ref?: string
    profession?: string
    location?: string
    notes?: string
    name?: string
    category?: string
    value?: number | null
    referenceValue?: number | null
  },
>(rows: T[], modeloDocumento: CatMedica): T[] {
  return rows.map((r) => {
    const cat = classificarLancamentoMedico({
      ref: r.ref,
      profession: r.profession,
      location: r.location,
      notes: r.notes,
      name: r.name,
      modeloDocumento: r.category === 'PSF / referência' ? 'PSF / referência' : modeloDocumento,
    })
    if (cat === 'PSF / referência') {
      return {
        ...r,
        category: cat,
        value: null,
        referenceValue: r.referenceValue ?? r.value ?? null,
      }
    }
    return { ...r, category: cat }
  })
}
