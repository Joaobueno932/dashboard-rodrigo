import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, FileSpreadsheet } from "lucide-react";
import type { Indicator } from "./types";
import { aggregate, number } from "./data";
// Brand palette (CSI | Sistema FIEMS), ordered for contrast between neighbours.
const colors = [
  "#0c4da2",
  "#f37f2d",
  "#0080c6",
  "#39a835",
  "#10263d",
  "#62a6c3",
  "#b8591a",
  "#2a7d27",
];
// Each Casa keeps the same colour in every chart; other series use the palette.
const houseColors: Record<string, string> = {
  FIEMS: "#0c4da2",
  Consolidado: "#0c4da2",
  SENAI: "#f37f2d",
  SESI: "#0080c6",
  IEL: "#39a835",
  "SESI/IEL": "#62a6c3",
  "SESI/SENAI": "#10263d",
  "Sem Centro": "#98a6b6",
};
const seriesColor = (name: string, index: number) =>
  houseColors[name] ?? colors[index % colors.length];
const tick = { fontSize: 12, fill: "#5b6b7e", fontFamily: "inherit" };
export default function IndicatorChart({
  indicator,
  house,
  year,
}: {
  indicator: Indicator;
  house: string;
  year: string;
}) {
  const data = useMemo(
    () => aggregate(indicator, house, year),
    [indicator, house, year],
  );
  const Chart = indicator.monthly ? LineChart : BarChart;
  return (
    <section className="chart-card" aria-labelledby={`title-${indicator.code}`}>
      <div className="chart-heading">
        <div>
          <span className="code">{indicator.code}</span>
          <h2 id={`title-${indicator.code}`}>{indicator.title}</h2>
        </div>
        <span className="frequency">
          {indicator.monthly ? "Mensal" : "Anual"}
        </span>
      </div>
      <p className="unit">{indicator.unit}</p>
      {data.noHouse ? (
        <div className="empty">
          <Info />
          <strong>Sem detalhamento por Casa</strong>
          <p>
            A fonte apresenta este indicador apenas no consolidado. Selecione
            “Todas” para visualizá-lo.
          </p>
        </div>
      ) : !data.hasData ? (
        <div className="empty">
          <FileSpreadsheet />
          <strong>Sem dados para este recorte</strong>
          <p>Não há valores disponíveis para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="chart-area">
          <ResponsiveContainer width="100%" height="100%">
            <Chart
              data={data.rows}
              margin={{ top: 16, right: 16, bottom: 12, left: 12 }}
              accessibilityLayer
            >
              <CartesianGrid
                strokeDasharray="3 5"
                vertical={false}
                stroke="#e3e9f0"
              />
              <XAxis
                dataKey="period"
                tick={tick}
                tickLine={false}
                axisLine={false}
                minTickGap={22}
              />
              <YAxis
                width={66}
                tick={tick}
                tickFormatter={(v) =>
                  new Intl.NumberFormat("pt-BR", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(Number(v))
                }
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${typeof value === "number" ? number(value) : "Sem informação"} ${indicator.unit}`,
                  name,
                ]}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #dce5e0",
                  fontSize: 14,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 13, paddingTop: 14 }}
                iconType="square"
                iconSize={8}
              />
              {data.series.map((name, index) =>
                indicator.monthly ? (
                  <Line
                    key={name}
                    name={name}
                    dataKey={`s${index}`}
                    stroke={seriesColor(name, index)}
                    strokeWidth={2.75}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ) : (
                  <Bar
                    key={name}
                    name={name}
                    dataKey={`s${index}`}
                    fill={seriesColor(name, index)}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={62}
                    isAnimationActive={false}
                  />
                ),
              )}
            </Chart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="chart-note">
        <Info size={14} />
        <span>
          {indicator.kind === "ratio"
            ? "Índice anual da fonte; não somado entre anos ou Casas."
            : indicator.kind === "stock" || indicator.kind === "wide"
              ? "Retrato anual. Pessoas não são somadas entre anos."
              : indicator.monthly
                ? "Soma dos registros por mês e série."
                : "Soma dos registros por ano e série."}
          {data.missing > 0
            ? ` ${data.missing} valores ausentes: somas podem estar parciais.`
            : ""}
          {indicator.duplicates > 0
            ? " A fonte contém repetições preservadas."
            : ""}
          {data.ambiguous
            ? " Proporções repetidas no mesmo período não foram agregadas."
            : ""}
        </span>
      </div>
      {data.hasData && (
        <details className="data-table">
          <summary>Consultar valores do gráfico</summary>
          <div className="table-scroll">
            <table>
              <caption>
                {indicator.title} · {indicator.unit}
              </caption>
              <thead>
                <tr>
                  <th>Período</th>
                  {data.series.map((n) => (
                    <th key={n}>{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.period}>
                    <th>{r.period}</th>
                    {data.series.map((_, i) => (
                      <td key={i}>
                        {typeof r[`s${i}`] === "number"
                          ? number(r[`s${i}`] as number)
                          : "Sem informação"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
