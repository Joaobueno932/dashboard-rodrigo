export interface RecordValue {
  year: number;
  month: number | null;
  house: string | null;
  location: string | null;
  category: string | null;
  value: number | null;
  cell: string;
}
export interface Indicator {
  code: string;
  title: string;
  unit: string;
  sourceUnit: string;
  sheet: string;
  kind: "sum" | "stock" | "ratio" | "wide";
  monthly: boolean;
  houseFilter: boolean;
  records: RecordValue[];
  missing: number;
  duplicates: number;
}
export interface Summary {
  indicators: number;
  records: number;
  missing: number;
  years: number[];
  houses: string[];
}
export interface Dataset {
  version: string;
  metadata: {
    filename: string;
    importedAt: number;
    size: number;
    sha256: string;
  };
  indicators: Indicator[];
  warnings: string[];
  summary: Summary;
}
export interface Validation {
  ticket: string;
  summary: Summary;
  warnings: string[];
}
export interface HistoryEntry {
  id: string;
  filename: string;
  created: number;
  status: string;
  message: string;
  records: number;
}
