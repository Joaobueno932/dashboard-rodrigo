/** O leitor TypeScript precisa produzir exatamente o mesmo resultado do leitor Python.
    A referência é data/processed/initial.json, saída validada e versionada do parser original. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WorkbookError, number, norm, parseWorkbook } from "../netlify/lib/parser.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(path.join(root, "data/source/indicadores.xlsx"));
const expected = JSON.parse(readFileSync(path.join(root, "data/processed/initial.json"), "utf8"));
const parsed = parseWorkbook(new Uint8Array(source));

test("resumo idêntico ao do parser Python", () => {
  assert.deepEqual(parsed.summary, expected.summary);
});

test("avisos idênticos, na mesma ordem", () => {
  assert.deepEqual(parsed.warnings, expected.warnings);
});

test("cada indicador idêntico, incluindo registros e células de origem", () => {
  assert.equal(parsed.indicators.length, expected.indicators.length);
  for (const [index, indicator] of parsed.indicators.entries()) {
    assert.deepEqual(indicator, expected.indicators[index], `indicador ${indicator.code}`);
  }
});

test("saída completa idêntica", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify({ indicators: parsed.indicators, warnings: parsed.warnings, summary: parsed.summary })),
    expected,
  );
});

test("valores ausentes não viram zero", () => {
  assert.equal(number(null), null);
  assert.equal(number("-"), null);
  assert.equal(number("—"), null);
  assert.equal(number("  "), null);
  assert.equal(number(0), 0);
});

test("valores inválidos são recusados", () => {
  assert.throws(() => number("abc"), WorkbookError);
  assert.throws(() => number(true), WorkbookError);
  assert.throws(() => number(-1), WorkbookError);
  assert.throws(() => number(new Date()), WorkbookError);
  assert.throws(() => number(Infinity), WorkbookError);
});

test("decimal brasileiro e milhar", () => {
  assert.equal(number("1.234,5"), 1234.5);
  assert.equal(number("12,5"), 12.5);
  assert.equal(number(" 42 "), 42);
});

test("normalização remove acentos e colapsa espaços", () => {
  assert.equal(norm("  Consumo   de ÁGUA (m³) "), "consumo de agua (m³)");
  assert.equal(norm(null), "");
  assert.equal(norm(0), "");
});

test("arquivo que não é xlsx é recusado", () => {
  assert.throws(() => parseWorkbook(new Uint8Array([1, 2, 3, 4])), WorkbookError);
});
