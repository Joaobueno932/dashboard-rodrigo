/** Extração limitada e somente leitura do XLSX: apenas valores em cache, com origem da célula.
    Porte fiel de backend/app/parser.py — as regras de recusa e os avisos são os mesmos. */

import { unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { CATALOG, type Indicator } from "./catalog.js";

export const MAX_ROWS = 30000;
export const MAX_COLS = 64;
const MONTHS = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export class WorkbookError extends Error {}

export interface RecordValue {
  year: number;
  month: number | null;
  house: string | null;
  location: string | null;
  category: string | null;
  value: number | null;
  cell: string;
}

export interface ParsedIndicator {
  code: string;
  title: string;
  unit: string;
  sourceUnit: string;
  sheet: string;
  kind: string;
  monthly: boolean;
  houseFilter: boolean;
  records: RecordValue[];
  missing: number;
  duplicates: number;
}

export interface Payload {
  indicators: ParsedIndicator[];
  warnings: string[];
  summary: {
    indicators: number;
    records: number;
    missing: number;
    years: number[];
    houses: string[];
  };
}

type Cell = string | number | boolean | Date | null;

/** Minúsculas, espaços colapsados e sem acentos — como norm() no Python. */
export function norm(value: unknown): string {
  const text = String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return text.normalize("NFD").replace(/\p{Mn}/gu, "");
}

/** Converte para número; ausência vira null; qualquer outra coisa é recusa. */
export function number(value: Cell): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") throw new WorkbookError("Valor booleano em coluna numérica.");
  if (value instanceof Date) throw new WorkbookError("Valor não numérico ou fórmula sem resultado válido.");
  let candidate: string | number = value;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (["", "-", "—", "–"].includes(trimmed)) return null;
    candidate = trimmed.replace(/ /g, "");
    if (candidate.includes(",")) candidate = candidate.replace(/\./g, "").replace(/,/g, ".");
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(candidate)) {
      throw new WorkbookError("Valor não numérico ou fórmula sem resultado válido.");
    }
  }
  const result = Number(candidate);
  if (Number.isNaN(result)) throw new WorkbookError("Valor não numérico ou fórmula sem resultado válido.");
  if (!Number.isFinite(result) || result < 0) {
    throw new WorkbookError("Valor negativo ou não finito em indicador não negativo.");
  }
  return result;
}

/** Barreiras do arquivo antes de abrir a planilha: tamanho, macros, vínculos, XML. */
export function validateArchive(raw: Uint8Array): void {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(raw);
  } catch {
    throw new WorkbookError("Excel inválido ou corrompido.");
  }
  const names = Object.keys(entries);
  const total = names.reduce((sum, name) => sum + entries[name].length, 0);
  if (names.length > 4000 || total > 100 * 1024 * 1024) {
    throw new WorkbookError("Excel excede o limite de conteúdo descompactado (100 MB / 4.000 arquivos).");
  }
  if (!names.includes("[Content_Types].xml") || !names.includes("xl/workbook.xml")) {
    throw new WorkbookError("O arquivo não é uma planilha XLSX válida.");
  }
  if (names.some((name) => name.toLowerCase().includes("vbaproject") || name.startsWith("xl/externalLinks/"))) {
    throw new WorkbookError("Macros e vínculos externos não são aceitos.");
  }
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (const name of names) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const content = decoder.decode(entries[name]);
      if (content.includes("<!DOCTYPE") || content.includes("<!ENTITY")) {
        throw new WorkbookError("Estrutura XML não permitida.");
      }
    }
  }
}

function cellValue(sheet: XLSX.WorkSheet, row: number, col: number): Cell {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
  if (!cell || cell.v === undefined || cell.v === null) return null;
  // Fórmula sem resultado em cache e célula de erro chegam como texto, e são recusadas adiante.
  if (cell.t === "e") return String(cell.w ?? "#ERRO");
  if (cell.t === "d") return cell.v instanceof Date ? cell.v : new Date(String(cell.v));
  if (cell.t === "b") return Boolean(cell.v);
  if (cell.t === "n") return Number(cell.v);
  return String(cell.v);
}

function readBlock(sheet: XLSX.WorkSheet, maxRow: number): Cell[][] {
  const rows: Cell[][] = [];
  for (let r = 0; r < maxRow; r += 1) {
    const row: Cell[] = [];
    for (let c = 0; c < MAX_COLS; c += 1) row.push(cellValue(sheet, r, c));
    rows.push(row);
  }
  return rows;
}

function findTable(
  rows: Cell[][],
  spec: Indicator,
): { header: number; dims: Record<string, number>; columns: number[] } | null {
  for (let index = 0; index < rows.length; index += 1) {
    const headers = rows[index].map((v) => norm(v));
    if (!headers.includes("ano")) continue;
    const columns = headers.map((h, i) => (spec.value.test(h) ? i : -1)).filter((i) => i >= 0);
    if (!columns.length) continue;
    const dims: Record<string, number> = {};
    for (const name of ["ano", "mes", "casa", "unidade"]) {
      const at = headers.indexOf(name);
      if (at >= 0) dims[name] = at;
    }
    if (spec.kind !== "ratio" && !spec.code.startsWith("G.") && !("casa" in dims)) continue;
    if (["A.1.1.1", "A.2.1.1", "A.2.2.1"].includes(spec.code) && !("mes" in dims)) continue;
    if (spec.category) {
      const cats = headers.map((h, i) => (spec.category!.test(h) ? i : -1)).filter((i) => i >= 0);
      if (cats.length !== 1) continue;
      dims.category = cats[0];
    }
    if (spec.kind !== "wide" && columns.length !== 1) {
      throw new WorkbookError(`${spec.code}: cabeçalhos de valores ambíguos.`);
    }
    return { header: index, dims, columns };
  }
  return null;
}

export function parseWorkbook(raw: Uint8Array): Payload {
  validateArchive(raw);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(raw, { type: "array", cellDates: true, cellFormula: false, cellHTML: false });
  } catch {
    throw new WorkbookError("Não foi possível ler o Excel.");
  }
  if (workbook.SheetNames.length > 150) throw new WorkbookError("Limite de 150 abas excedido.");

  const catalogCodes = new Set(CATALOG.map((s) => s.code));
  const sheets: { name: string; sheet: XLSX.WorkSheet; preview: Cell[][]; codes: Set<string>; maxRow: number }[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet["!ref"]) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const maxRow = range.e.r + 1;
    const preview = readBlock(sheet, Math.min(100, maxRow));
    const codes = new Set<string>();
    for (const row of preview) {
      for (const value of row) {
        if (typeof value === "string" && /^[ASG]\.\d+\.\d+\.\d+$/.test(value.trim())) codes.add(value.trim());
      }
    }
    if ([...codes].some((code) => catalogCodes.has(code))) sheets.push({ name, sheet, preview, codes, maxRow });
  }

  const indicators: ParsedIndicator[] = [];
  const warnings: string[] = [];
  for (const spec of CATALOG) {
    const candidates = sheets
      .filter((entry) => entry.codes.has(spec.code))
      .map((entry) => ({ entry, table: findTable(entry.preview, spec) }))
      .filter((c): c is { entry: (typeof sheets)[number]; table: NonNullable<ReturnType<typeof findTable>> } =>
        Boolean(c.table),
      );
    if (candidates.length !== 1) {
      throw new WorkbookError(
        `${spec.code}: indicador ausente, estrutura incompatível ou tabelas ambíguas (${candidates.length} correspondências).`,
      );
    }
    const { entry, table } = candidates[0];
    const { header, dims, columns } = table;
    if (entry.maxRow > MAX_ROWS) throw new WorkbookError(`${spec.code}: limite de ${MAX_ROWS} linhas excedido.`);
    const meta = entry.preview.find((row) => row.some((v) => String(v).trim() === spec.code))!;
    const codeCol = meta.findIndex((v) => String(v).trim() === spec.code);
    const unit = String(meta[codeCol + 3] || "");
    if (!unit) throw new WorkbookError(`${spec.code}: unidade de medida não identificada.`);
    // A unidade da tabela é mais específica que a dos metadados no caso do GEE (tCO2e).
    const headerValue = String(entry.preview[header][columns[0]]);
    const match = headerValue.match(/\(([^()]+)\)\s*$/);
    const displayUnit = match ? match[1] : unit;

    const records: RecordValue[] = [];
    const duplicates = new Map<string, number>();
    let missing = 0;
    const hasMonth = "mes" in dims;
    const relevant = new Set([...Object.values(dims), ...columns]);
    const lastRow = Math.min(entry.maxRow || MAX_ROWS, MAX_ROWS) + 1;
    for (let rowNo = header + 2; rowNo <= lastRow; rowNo += 1) {
      const row: Cell[] = [];
      for (let c = 0; c < MAX_COLS; c += 1) row.push(cellValue(entry.sheet, rowNo - 1, c));
      if (![...relevant].some((i) => row[i] !== null)) continue;
      if (rowNo > MAX_ROWS) throw new WorkbookError(`${spec.code}: limite de ${MAX_ROWS} linhas excedido.`);
      try {
        const yr = number(row[dims.ano]);
        if (yr === null || yr !== Math.trunc(yr) || yr < 1900 || yr > 2200) {
          throw new WorkbookError("Ano ausente ou inválido.");
        }
        const year = Math.trunc(yr);
        let month: number | null = null;
        if (hasMonth) {
          const text = norm(row[dims.mes]);
          if (!MONTHS.includes(text)) throw new WorkbookError("Mês ausente ou inválido.");
          month = MONTHS.indexOf(text) + 1;
        }
        const house = "casa" in dims && row[dims.casa] !== null ? String(row[dims.casa]).trim() : null;
        if ("casa" in dims && !house) throw new WorkbookError("Casa ausente.");
        const location =
          "unidade" in dims && row[dims.unidade] !== null ? String(row[dims.unidade]).trim() : null;
        for (const col of columns) {
          const value = number(row[col]);
          let category: string | null = null;
          if (spec.kind === "wide") {
            category = String(entry.preview[header][col])
              .replace(/^Número de colaboradores\s*/i, "")
              .replace(/^(do gênero|de gênero)\s+/i, "");
          } else if ("category" in dims) {
            if (row[dims.category] === null) throw new WorkbookError("Categoria ausente.");
            category = String(row[dims.category]).trim();
            if (spec.code === "A.5.1.1") category = `Escopo ${category}`;
          }
          if (value === null) missing += 1;
          const key = JSON.stringify([year, month, house, location, category, value]);
          duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
          records.push({
            year,
            month,
            house,
            location,
            category,
            value,
            cell: `${XLSX.utils.encode_col(col)}${rowNo}`,
          });
        }
      } catch (error) {
        if (error instanceof WorkbookError) {
          throw new WorkbookError(`${spec.code}, linha ${rowNo}: ${error.message}`);
        }
        throw error;
      }
    }
    let repeated = 0;
    for (const count of duplicates.values()) if (count > 1) repeated += count - 1;
    if (missing) warnings.push(`${spec.code}: ${missing} valores ausentes; não convertidos em zero.`);
    if (repeated) warnings.push(`${spec.code}: ${repeated} registros iguais preservados; revisar na fonte.`);
    if (!records.length) warnings.push(`${spec.code}: estrutura válida, sem registros.`);
    if (hasMonth) {
      const periods = new Map<string, Set<number>>();
      for (const record of records) {
        const key = JSON.stringify([record.year, record.house]);
        if (!periods.has(key)) periods.set(key, new Set());
        periods.get(key)!.add(record.month as number);
      }
      let incomplete = 0;
      for (const months of periods.values()) if (months.size < 12) incomplete += 1;
      if (incomplete) warnings.push(`${spec.code}: ${incomplete} combinações Casa/ano com menos de 12 meses.`);
    }
    if (spec.kind === "ratio") {
      warnings.push(`${spec.code}: valor anual consolidado, sem recorte por Casa; proporções não são somadas.`);
    }
    indicators.push({
      code: spec.code,
      title: spec.title,
      unit: displayUnit,
      sourceUnit: unit,
      sheet: entry.name,
      kind: spec.kind,
      monthly: hasMonth,
      houseFilter: "casa" in dims,
      records,
      missing,
      duplicates: repeated,
    });
  }

  const all = indicators.flatMap((i) => i.records);
  return {
    indicators,
    warnings,
    summary: {
      indicators: indicators.length,
      records: all.length,
      missing: all.filter((r) => r.value === null).length,
      years: [...new Set(all.map((r) => r.year))].sort((a, b) => a - b),
      houses: [...new Set(all.map((r) => r.house).filter((h): h is string => Boolean(h)))].sort(),
    },
  };
}
