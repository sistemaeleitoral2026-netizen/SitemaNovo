import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { EmptyState } from '../ui/EmptyState'

interface DataPoint {
  id: string
  nome: string
  total: number
}

interface BarChartOperadoresProps {
  data: DataPoint[]
}

export function BarChartOperadores({ data }: BarChartOperadoresProps) {
  const navigate = useNavigate()

  if (!data.length) {
    return <EmptyState title="Sem dados" description="Nenhum cadastro por nerite no período." />
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f6fed" />
            <stop offset="100%" stopColor="#75a1ff" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#e8edf5" />
        <XAxis dataKey="nome" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7b879b' }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#7b879b' }} />
        <Tooltip cursor={{ fill: '#f4f7fc' }} contentStyle={{ borderRadius: 12, border: '1px solid #e1e7f0', boxShadow: '0 10px 30px rgba(21, 39, 78, .12)' }} />
        <Bar
          dataKey="total"
          fill="url(#barFill)"
          radius={[7, 7, 0, 0]}
          cursor="pointer"
          onClick={(barData) => {
            const item = barData.payload as DataPoint
            if (item?.id) navigate(`/nerites/${item.id}`)
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
