import type { Indicator } from "./types";
export const months = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
export const number = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 6 : 2,
  }).format(value);
export const date = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString("pt-BR");
export function choices(indicators: Indicator[]) {
  const records = indicators.flatMap((i) => i.records);
  return {
    years: [...new Set(records.map((r) => r.year))].sort((a, b) => a - b),
    houses: [
      ...new Set(records.map((r) => r.house).filter((x): x is string => !!x)),
    ].sort(),
  };
}
export function initialYear(indicators: Indicator[]): string {
  const sets = indicators.map((i) => new Set(i.records.map((r) => r.year)));
  const common = [...(sets[0] ?? [])]
    .filter((y) => sets.every((s) => s.has(y)))
    .sort((a, b) => b - a);
  return String(common[0] ?? choices(indicators).years.at(-1) ?? "all");
}
export function aggregate(indicator: Indicator, house: string, year: string) {
  const noHouse = house !== "all" && !indicator.houseFilter;
  const records = indicator.records.filter(
    (r) =>
      (year === "all" || r.year === Number(year)) &&
      (house === "all" || r.house === house),
  );
  const series = [
    ...new Set(
      records.map(
        (r) =>
          r.category ??
          (indicator.houseFilter ? r.house : "Consolidado") ??
          "Consolidado",
      ),
    ),
  ];
  const groups = new Map<
    string,
    {
      label: string;
      values: Map<string, { sum: number; count: number; missing: number }>;
    }
  >();
  for (const row of records) {
    const key = `${row.year}-${String(row.month ?? 0).padStart(2, "0")}`;
    const label = row.month
      ? `${months[row.month - 1]}${year === "all" ? `/${row.year}` : ""}`
      : String(row.year);
    const group = groups.get(key) ?? { label, values: new Map() };
    const name =
      row.category ??
      (indicator.houseFilter ? row.house : "Consolidado") ??
      "Consolidado";
    const entry = group.values.get(name) ?? { sum: 0, count: 0, missing: 0 };
    if (row.value !== null) {
      entry.sum += row.value;
      entry.count++;
    } else entry.missing++;
    group.values.set(name, entry);
    groups.set(key, group);
  }
  // Explicit null gaps between observed months; never invent zero values.
  if (indicator.monthly) {
    const years = [...new Set(records.map((r) => r.year))];
    for (const y of years) {
      const observed = records
        .filter((r) => r.year === y)
        .map((r) => r.month ?? 0);
      const end = Math.max(...observed);
      for (let month = 1; month <= end; month++) {
        const key = `${y}-${String(month).padStart(2, "0")}`;
        if (!groups.has(key))
          groups.set(key, {
            label: `${months[month - 1]}${year === "all" ? `/${y}` : ""}`,
            values: new Map(),
          });
      }
    }
  }
  let ambiguous = false;
  const rows = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, g]) => {
      const result: Record<string, string | number | null> = {
        period: g.label,
      };
      series.forEach((name, index) => {
        const v = g.values.get(name);
        if (indicator.kind === "ratio" && v && v.count > 1) ambiguous = true;
        result[`s${index}`] =
          v && v.count
            ? indicator.kind === "ratio" && v.count > 1
              ? null
              : v.sum
            : null;
      });
      return result;
    });
  return {
    rows,
    series,
    noHouse,
    missing: records.filter((r) => r.value === null).length,
    ambiguous,
    hasData: rows.some((r) =>
      series.some((_, i) => typeof r[`s${i}`] === "number"),
    ),
  };
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, options);
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ detail: "Não foi possível concluir a operação." }));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Dados inválidos. Confira o formulário.",
    );
  }
  return response.json() as Promise<T>;
}
