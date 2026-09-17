import {
  Area,
  AreaChart,
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
      <AreaChart data={data} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="evolutionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f6fed" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#2f6fed" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e8edf5" />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7b879b' }} dy={8} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7b879b' }} />
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e1e7f0',
            boxShadow: '0 8px 20px rgba(21, 39, 78, .08)',
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="total"
          name="Cadastros"
          stroke="#2f6fed"
          strokeWidth={2.5}
          fill="url(#evolutionFill)"
          dot={{ r: 3, fill: '#2f6fed', stroke: '#fff', strokeWidth: 2 }}
          activeDot={{ r: 5, fill: '#2f6fed', strokeWidth: 2, stroke: '#fff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
