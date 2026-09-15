import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { EmptyState } from '../ui/EmptyState'

interface DataPoint {
  date: string
  total: number
}

interface EvolutionChartProps {
  data: DataPoint[]
}

export function EvolutionChart({ data }: EvolutionChartProps) {
  if (!data.length) {
    return <EmptyState title="Sem dados" description="Nenhum cadastro no período selecionado." />
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Line type="monotone" dataKey="total" stroke="var(--color-kpi-green)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
