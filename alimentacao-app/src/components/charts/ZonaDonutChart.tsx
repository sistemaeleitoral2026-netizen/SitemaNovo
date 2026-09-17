import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { EmptyState } from '../ui/EmptyState'

interface DataPoint {
  name: string
  value: number
}

const COLORS = ['#2f6fed', '#3b82f6', '#60a5fa', '#06a77d', '#f59e42', '#34a6c9']

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
          cy="48%"
          innerRadius={68}
          outerRadius={96}
          paddingAngle={2}
          cornerRadius={4}
          stroke="#fff"
          strokeWidth={2}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e1e7f0',
            boxShadow: '0 8px 20px rgba(21, 39, 78, .08)',
            fontSize: 12,
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#667085' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
