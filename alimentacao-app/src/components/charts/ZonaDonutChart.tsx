import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { EmptyState } from '../ui/EmptyState'

interface DataPoint {
  name: string
  value: number
}

const COLORS = ['#2f6fed', '#06a77d', '#7656d8', '#f59e42', '#34a6c9', '#d6a727']

interface ZonaDonutChartProps {
  data: DataPoint[]
}

export function ZonaDonutChart({ data }: ZonaDonutChartProps) {
  if (!data.length) {
    return <EmptyState title="Sem dados" description="Nenhuma distribuição por zona disponível." />
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={64}
          outerRadius={94}
          paddingAngle={3}
          cornerRadius={5}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e1e7f0', boxShadow: '0 10px 30px rgba(21, 39, 78, .12)' }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#667085' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
