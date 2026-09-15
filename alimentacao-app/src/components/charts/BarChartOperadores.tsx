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
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="nome" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar
          dataKey="total"
          fill="var(--color-primary)"
          radius={[4, 4, 0, 0]}
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
