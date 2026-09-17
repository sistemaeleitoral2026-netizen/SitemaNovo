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
      <LineChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="evolutionLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2f6fed" />
            <stop offset="100%" stopColor="#06a77d" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e8edf5" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7b879b' }} dy={8} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7b879b' }} />
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e1e7f0', boxShadow: '0 10px 30px rgba(21, 39, 78, .12)' }} />
        <Line type="monotone" dataKey="total" name="Cadastros" stroke="url(#evolutionLine)" strokeWidth={3} dot={false} activeDot={{ r: 5, fill: '#2f6fed', strokeWidth: 3, stroke: '#fff' }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
