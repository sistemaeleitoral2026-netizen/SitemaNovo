import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  computeAdminFinanceiro, currentMonth, fetchAdminFinanceiroRaw, type AdminFinanceiro, type AdminFinRaw,
} from '../../lib/adminFinanceiro'

export type AdminContext = {
  month: string
  setMonth: (month: string) => void
  hidden: boolean
  setHidden: (hidden: boolean) => void
  fin: AdminFinanceiro | null
  finLoading: boolean
  finError: string | null
  carregadoEm: string | null
  reloadFin: () => void
}

const HIDE_KEY = 'admin.ocultarValores'

/** Estado compartilhado pelo shell do admin: mês escolhido, "ocultar valores" e os dados financeiros. */
export function useAdminState(): AdminContext {
  const [month, setMonth] = useState(currentMonth)
  const [hidden, setHiddenState] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false }
  })
  const [raw, setRaw] = useState<AdminFinRaw | null>(null)
  const [finLoading, setFinLoading] = useState(true)
  const [finError, setFinError] = useState<string | null>(null)

  const reloadFin = useCallback(() => {
    setFinLoading(true)
    setFinError(null)
    fetchAdminFinanceiroRaw()
      .then(setRaw)
      .catch((e) => setFinError(e instanceof Error ? e.message : 'Falha ao carregar os valores.'))
      .finally(() => setFinLoading(false))
  }, [])

  useEffect(() => { reloadFin() }, [reloadFin])
  useEffect(() => {
    window.addEventListener('admin:refresh', reloadFin)
    return () => window.removeEventListener('admin:refresh', reloadFin)
  }, [reloadFin])

  const setHidden = useCallback((value: boolean) => {
    setHiddenState(value)
    try { localStorage.setItem(HIDE_KEY, value ? '1' : '0') } catch { /* sem storage */ }
  }, [])

  const fin = useMemo(() => (raw ? computeAdminFinanceiro(raw, month) : null), [raw, month])

  return { month, setMonth, hidden, setHidden, fin, finLoading, finError, carregadoEm: raw?.carregadoEm ?? null, reloadFin }
}

export function useAdmin() {
  return useOutletContext<AdminContext>()
}
