import { describe, it, expect } from "vitest";
import { aggregate, choices, initialYear, number } from "./data";
import type { Indicator, RecordValue } from "./types";
const row = (overrides: Partial<RecordValue> = {}): RecordValue => ({
  year: 2025,
  month: 1,
  house: "SESI",
  location: "Unidade",
  category: null,
  value: 10,
  cell: "E13",
  ...overrides,
});
const indicator = (
  records: RecordValue[],
  overrides: Partial<Indicator> = {},
): Indicator => ({
  code: "A.1.1.1",
  title: "Água",
  unit: "m³",
  sourceUnit: "m³",
  sheet: "Fonte",
  kind: "sum",
  monthly: true,
  houseFilter: true,
  records,
  missing: 0,
  duplicates: 0,
  ...overrides,
});
describe("Agregações dos gráficos", () => {
  it("ordena meses e mantém lacunas sem fabricar zeros", () => {
    const result = aggregate(
      indicator([row({ month: 3, value: 30 }), row()]),
      "all",
      "2025",
    );
    expect(result.rows.map((r) => r.period)).toEqual(["Jan", "Fev", "Mar"]);
    expect(result.rows[1].s0).toBeNull();
  });
  it("combina Casa e Ano", () => {
    const result = aggregate(
      indicator([row(), row({ house: "SENAI" }), row({ year: 2024 })]),
      "SESI",
      "2025",
    );
    expect(result.rows).toEqual([{ period: "Jan", s0: 10 }]);
  });
  it("agrega unidades no mesmo mês sem eliminar duplicatas", () => {
    expect(aggregate(indicator([row(), row()]), "all", "2025").rows[0].s0).toBe(
      20,
    );
  });
  it("preserva nulos e zeros", () => {
    const result = aggregate(
      indicator([row({ value: null }), row({ house: "SENAI", value: 0 })]),
      "all",
      "2025",
    );
    expect(result.rows[0].s0).toBeNull();
    expect(result.rows[0].s1).toBe(0);
  });
  it("não soma retratos anuais entre anos", () => {
    const result = aggregate(
      indicator(
        [row({ year: 2024, month: null }), row({ month: null, value: 20 })],
        { kind: "stock", monthly: false },
      ),
      "all",
      "all",
    );
    expect(result.rows.map((r) => r.s0)).toEqual([10, 20]);
  });
  it("não inventa per capita por Casa", () => {
    expect(
      aggregate(
        indicator([row({ house: null, month: null })], {
          kind: "ratio",
          monthly: false,
          houseFilter: false,
        }),
        "SESI",
        "2025",
      ).noHouse,
    ).toBe(true);
  });
  it("não soma proporções ambíguas no mesmo período", () => {
    const result = aggregate(
      indicator(
        [row({ month: null, house: null }), row({ month: null, house: null })],
        { kind: "ratio", monthly: false, houseFilter: false },
      ),
      "all",
      "2025",
    );
    expect(result.ambiguous).toBe(true);
    expect(result.rows[0].s0).toBeNull();
  });
  it("preserva combustíveis e escopos", () => {
    const result = aggregate(
      indicator([
        row({ category: "Gasolina" }),
        row({ category: "Diesel", value: 20 }),
      ]),
      "all",
      "2025",
    );
    expect(result.series).toEqual(["Gasolina", "Diesel"]);
  });
  it("reconhece novos anos e Casas", () => {
    const result = choices([
      indicator([row({ year: 2027, house: "Nova Casa" })]),
    ]);
    expect(result).toEqual({ years: [2027], houses: ["Nova Casa"] });
  });
  it("escolhe o último ano comum sem ocultar anos novos do filtro", () => {
    expect(
      initialYear([
        indicator([row(), row({ year: 2026 })]),
        indicator([row()]),
      ]),
    ).toBe("2025");
  });
  it("não arredonda pequenas emissões para zero", () =>
    expect(number(0.00004)).toBe("0,00004"));
});
