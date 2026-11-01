const NERITES_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const NERITES_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const NERITES_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const GABINETE_URL = process.env.GABINETE_SUPABASE_URL
const GABINETE_SERVICE = process.env.GABINETE_SERVICE_ROLE_KEY

const LIMITE = 20

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function errMsg(data, fallback) {
  if (!data) return fallback
  if (typeof data === 'string') return data
  return data.message || data.msg || data.error_description || data.error || fallback
}

function termo(q) {
  return String(q || '').trim().replace(/[%*,().\\]/g, '').slice(0, 60)
}

async function httpJson(url, headers, { method = 'GET', body } = {}) {
  const h = { ...headers }
  if (body !== undefined) {
    h['Content-Type'] = 'application/json'
    h.Prefer = 'return=representation,resolution=merge-duplicates'
  }
  const res = await fetch(url, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: res.ok, status: res.status, data }
}

async function nerites(path, token) {
  return httpJson(`${NERITES_URL}/rest/v1/${path}`, {
    Authorization: `Bearer ${token}`,
    apikey: NERITES_ANON,
  })
}

async function gabinete(path, { method = 'GET', body } = {}) {
  return httpJson(`${GABINETE_URL}/rest/v1/${path}`, {
    Authorization: `Bearer ${GABINETE_SERVICE}`,
    apikey: GABINETE_SERVICE,
  }, { method, body })
}

async function getAuthUser(token) {
  const res = await fetch(`${NERITES_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: NERITES_ANON },
  })
  if (!res.ok) return null
  const user = await res.json()
  return user?.id ? user : null
}

async function loadProfile(userId, token) {
  let res = await nerites(`profiles?id=eq.${userId}&select=id,role,ativo`, token)
  if ((!res.ok || !Array.isArray(res.data) || !res.data[0]) && NERITES_SERVICE) {
    res = await httpJson(`${NERITES_URL}/rest/v1/profiles?id=eq.${userId}&select=id,role,ativo`, {
      Authorization: `Bearer ${NERITES_SERVICE}`,
      apikey: NERITES_SERVICE,
    })
  }
  const profile = Array.isArray(res.data) ? res.data[0] : null
  if (!profile || profile.ativo === false) return null
  return profile
}

function mapProposicao(row) {
  const trams = row.proposicoes_tramitacoes || row.tramitacoes || []
  const docs = row.proposicoes_documentos || row.documentos || []
  const autores = row.proposicoes_autores || row.autores || []
  return {
    id: row.id,
    identificacao: row.identificacao,
    tipo: row.tipo,
    assunto: row.assunto || '',
    url: row.url || '',
    ultimo_andamento: row.ultimo_andamento || null,
    data_ultimo_andamento: row.data_ultimo_andamento || null,
    autores: autores.map((a) => ({ nome: a.nome, partido: a.partido || null })),
    documentos: docs.map((d) => ({ titulo: d.titulo, url: d.url || d.download_url || '' })),
    tramitacoes: trams
      .slice()
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      .map((t) => ({ data: t.data || t.data_andamento || '', andamento: t.andamento || '' })),
  }
}

function exigirGabinete(res) {
  if (GABINETE_URL && GABINETE_SERVICE) return true
  json(res, 503, {
    error: 'GABINETE_SUPABASE_URL e GABINETE_SERVICE_ROLE_KEY faltam no servidor. O navegador não usa essa chave.',
  })
  return false
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' })
  }
  if (!NERITES_URL || !NERITES_ANON) {
    return json(res, 500, { error: 'Login do Nerites não configurado no servidor.' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json(res, 401, { error: 'Não autenticado.' })

  const user = await getAuthUser(token)
  if (!user) return json(res, 401, { error: 'Sessão inválida. Saia e entre novamente.' })
  const profile = await loadProfile(user.id, token)
  if (!profile) return json(res, 403, { error: 'Usuário inativo ou sem perfil.' })

  const body = req.method === 'POST'
    ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}))
    : {}
  const recurso = String((req.query && req.query.recurso) || body.recurso || '')
  const q = termo((req.query && req.query.q) || body.q || '')

  try {
    if (recurso === 'liderancas' || recurso === 'cidadaos') {
      if (q.length < 2) return json(res, 400, { error: 'Digite pelo menos 2 letras.' })
      const filtro = recurso === 'liderancas'
        ? `lideres?select=id,nome,telefone,bairro&ativo=eq.true&nome=ilike.*${encodeURIComponent(q)}*&order=nome.asc&limit=${LIMITE}`
        : `cadastros?select=id,nome_completo,telefone,bairro,lider&nome_completo=ilike.*${encodeURIComponent(q)}*&order=nome_completo.asc&limit=${LIMITE}`
      const found = await nerites(filtro, token)
      if (!found.ok) {
        return json(res, found.status || 500, { error: errMsg(found.data, 'Falha ao consultar o Nerites.') })
      }
      const rows = Array.isArray(found.data) ? found.data : []
      const pessoas = rows.map((row) => ({
        nerites_id: row.id,
        tipo: recurso === 'liderancas' ? 'lideranca' : 'cidadao',
        nome: row.nome || row.nome_completo || '',
        telefone: row.telefone || null,
        bairro: row.bairro || null,
        lider: row.lider || null,
      }))
      return json(res, 200, { pessoas })
    }

    if (recurso === 'vincular') {
      if (!exigirGabinete(res)) return
      const tipo = body.tipo === 'lideranca' ? 'lideranca' : body.tipo === 'cidadao' ? 'cidadao' : ''
      const neritesId = String(body.nerites_id || '').trim()
      const nome = String(body.nome || '').trim().slice(0, 160)
      if (!tipo || !neritesId || !nome) {
        return json(res, 400, { error: 'Informe tipo, nerites_id e nome. Uma pessoa por vez.' })
      }
      const saved = await gabinete('mandato_pessoas?on_conflict=tipo,nerites_id', {
        method: 'POST',
        body: {
          tipo,
          nerites_id: neritesId,
          nome,
          telefone: body.telefone ? String(body.telefone).slice(0, 30) : null,
          bairro: body.bairro ? String(body.bairro).slice(0, 80) : null,
          atualizado_em: new Date().toISOString(),
        },
      })
      if (!saved.ok) {
        const missing = /mandato_pessoas|schema cache|PGRST205/i.test(errMsg(saved.data, ''))
        return json(res, saved.status || 500, {
          error: missing
            ? 'Rode o SQL do Gabinete (supabase/gabinete/mandato_vinculo.sql) no projeto GABINETE.'
            : errMsg(saved.data, 'Falha ao gravar no Gabinete.'),
        })
      }
      return json(res, 200, { ok: true })
    }

    if (recurso === 'demandas' && req.method === 'GET') {
      if (!exigirGabinete(res)) return
      const list = await gabinete('demandas?select=id,nerites_cadastro_id,cidadao_nome,titulo,bairro,status,criado_em&order=criado_em.desc&limit=30')
      if (!list.ok) {
        return json(res, list.status || 500, { error: errMsg(list.data, 'Falha ao ler demandas.') })
      }
      return json(res, 200, { demandas: list.data || [] })
    }

    if (recurso === 'demanda' && req.method === 'POST') {
      if (!exigirGabinete(res)) return
      const nome = String(body.cidadao_nome || '').trim().slice(0, 160)
      const titulo = String(body.titulo || '').trim().slice(0, 180)
      const neritesId = String(body.nerites_cadastro_id || '').trim()
      if (!nome || !titulo) return json(res, 400, { error: 'Informe o cidadão e o título da demanda.' })
      if (neritesId) {
        await gabinete('mandato_pessoas?on_conflict=tipo,nerites_id', {
          method: 'POST',
          body: {
            tipo: 'cidadao',
            nerites_id: neritesId,
            nome,
            telefone: body.telefone ? String(body.telefone).slice(0, 30) : null,
            bairro: body.bairro ? String(body.bairro).slice(0, 80) : null,
            atualizado_em: new Date().toISOString(),
          },
        })
      }
      const saved = await gabinete('demandas', {
        method: 'POST',
        body: {
          nerites_cadastro_id: neritesId || null,
          cidadao_nome: nome,
          titulo,
          bairro: body.bairro ? String(body.bairro).slice(0, 80) : null,
          status: 'nova',
          criado_por: user.id,
        },
      })
      if (!saved.ok) {
        return json(res, saved.status || 500, { error: errMsg(saved.data, 'Falha ao gravar a demanda.') })
      }
      return json(res, 200, { demanda: Array.isArray(saved.data) ? saved.data[0] : saved.data })
    }

    if (recurso === 'proposicoes' && req.method === 'GET') {
      if (!GABINETE_URL || !GABINETE_SERVICE) {
        return json(res, 200, { fonte: 'arquivo', proposicoes: [] })
      }
      const list = await gabinete(
        'proposicoes?select=id,identificacao,tipo,assunto,url,ultimo_andamento,data_ultimo_andamento,proposicoes_autores(nome,partido),proposicoes_documentos(titulo,url),proposicoes_tramitacoes(ordem,data_andamento,andamento)&order=ano.desc,identificacao.desc&limit=200',
      )
      if (!list.ok) {
        const missing = /proposicoes|schema cache|PGRST205/i.test(errMsg(list.data, ''))
        if (missing) return json(res, 200, { fonte: 'arquivo', proposicoes: [] })
        return json(res, list.status || 500, { error: errMsg(list.data, 'Falha ao ler proposições.') })
      }
      const rows = Array.isArray(list.data) ? list.data : []
      return json(res, 200, {
        fonte: rows.length ? 'gabinete' : 'arquivo',
        proposicoes: rows.map(mapProposicao),
      })
    }

    return json(res, 404, { error: 'Recurso não encontrado.' })
  } catch (err) {
    return json(res, 500, { error: err instanceof Error ? err.message : 'Falha na ponte.' })
  }
}
