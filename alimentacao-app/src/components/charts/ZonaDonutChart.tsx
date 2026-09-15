import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { EmptyState } from '../ui/EmptyState'

interface DataPoint {
  name: string
  value: number
}

const COLORS = ['#2563eb', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#ca8a04']

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
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
