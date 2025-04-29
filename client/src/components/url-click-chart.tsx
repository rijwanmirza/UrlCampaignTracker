import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UrlClickChartProps {
  data: {
    name: string;
    value: number | string;
  }[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export default function UrlClickChart({
  data,
  xAxisLabel = "Time",
  yAxisLabel = "Clicks",
}: UrlClickChartProps) {
  // Format the data to make sure the 'value' is a number for the chart
  const formattedData = data.map((item) => ({
    ...item,
    value: typeof item.value === "string" ? parseInt(item.value, 10) || 0 : item.value,
  }));

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formattedData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 60,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 12 }}
            label={{
              value: xAxisLabel,
              position: "insideBottom",
              offset: -10,
              fontSize: 12,
            }}
          />
          <YAxis
            label={{
              value: yAxisLabel,
              angle: -90,
              position: "insideLeft",
              offset: 5,
              fontSize: 12,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "hsla(var(--card))",
              border: "1px solid hsla(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`${value} clicks`, "Clicks"]}
            labelFormatter={(label: string) => `Time: ${label}`}
          />
          <Bar
            dataKey="value"
            fill="hsl(var(--primary))"
            radius={[4, 4, 0, 0]}
            name="Clicks"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}