/** Transações no Postgres (Neon) mantêm fonte, dados normalizados e ponteiro ativo consistentes.
    Porte de backend/app/store.py: mesmas regras de validação, confirmação e expiração. */

import { randomBytes, createHash } from "node:crypto";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import ws from "ws";
import { WorkbookError, parseWorkbook, type Payload } from "./parser.js";

// O driver precisa de WebSocket para transações; o Node do build nem sempre traz o global.
neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;

export class Conflict extends Error {}

export const PENDING_TTL = 1800;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function connectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL não configurada.");
  return url;
}

function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: connectionString() });
  return pool;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/** Transação interativa: usada onde a leitura e a escrita precisam ser atômicas. */
async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS esg_versions (
  id text PRIMARY KEY, filename text NOT NULL, created double precision NOT NULL,
  size integer NOT NULL, sha256 text NOT NULL, raw bytea NOT NULL, payload json NOT NULL);
CREATE TABLE IF NOT EXISTS esg_state (
  id integer PRIMARY KEY CHECK (id = 1), active text, previous text);
INSERT INTO esg_state(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS esg_imports (
  id text PRIMARY KEY, owner text NOT NULL, filename text NOT NULL, created double precision NOT NULL,
  status text NOT NULL, message text NOT NULL DEFAULT '', records integer NOT NULL DEFAULT 0,
  base text, raw bytea, payload json);
CREATE TABLE IF NOT EXISTS esg_sessions (
  token text PRIMARY KEY, csrf text NOT NULL, expires double precision NOT NULL);
CREATE TABLE IF NOT EXISTS esg_login_attempts (
  id bigserial PRIMARY KEY, address text NOT NULL, created double precision NOT NULL);
CREATE INDEX IF NOT EXISTS esg_imports_status ON esg_imports (status);
CREATE INDEX IF NOT EXISTS esg_imports_created ON esg_imports (created DESC);
`;

export async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await getPool().connect();
      try {
        await client.query(SCHEMA);
      } finally {
        client.release();
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

const now = () => Date.now() / 1000;
const id = () => randomBytes(16).toString("hex");
const sha256 = (raw: Uint8Array) => createHash("sha256").update(raw).digest("hex");

export interface Snapshot extends Payload {
  version: string;
  metadata: { filename: string; importedAt: number; size: number; sha256: string };
}

/** Primeira carga: a planilha original vira a base ativa, uma única vez. */
export async function initialize(raw: Uint8Array, filename: string): Promise<void> {
  const [state] = await query<{ active: string | null }>("SELECT active FROM esg_state WHERE id = 1");
  if (state?.active) return;
  const payload = parseWorkbook(raw);
  await transaction(async (client) => {
    const current = await client.query("SELECT active FROM esg_state WHERE id = 1 FOR UPDATE");
    if (current.rows[0]?.active) return;
    const version = id();
    const created = now();
    await client.query(
      "INSERT INTO esg_versions (id, filename, created, size, sha256, raw, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [version, filename, created, raw.length, sha256(raw), Buffer.from(raw), JSON.stringify(payload)],
    );
    await client.query("UPDATE esg_state SET active = $1 WHERE id = 1", [version]);
    await client.query(
      "INSERT INTO esg_imports (id, owner, filename, created, status, records) VALUES ($1,$2,$3,$4,$5,$6)",
      [version, "initial", filename, created, "Sucesso", payload.summary.records],
    );
  });
}

export async function snapshot(): Promise<Snapshot> {
  const rows = await query<{
    id: string;
    filename: string;
    created: number;
    size: number;
    sha256: string;
    payload: Payload;
  }>(
    "SELECT v.id, v.filename, v.created, v.size, v.sha256, v.payload FROM esg_versions v JOIN esg_state s ON v.id = s.active WHERE s.id = 1",
  );
  if (!rows.length) throw new Error("Base inicial indisponível.");
  const row = rows[0];
  return {
    ...row.payload,
    version: row.id,
    metadata: { filename: row.filename, importedAt: row.created, size: row.size, sha256: row.sha256 },
  };
}

export async function hasActive(): Promise<boolean> {
  const [state] = await query<{ active: string | null }>("SELECT active FROM esg_state WHERE id = 1");
  return Boolean(state?.active);
}

export interface HistoryEntry {
  id: string;
  filename: string;
  created: number;
  status: string;
  message: string;
  records: number;
}

export async function history(): Promise<HistoryEntry[]> {
  return query<HistoryEntry>(
    "SELECT id, filename, created, status, message, records FROM esg_imports ORDER BY created DESC LIMIT 100",
  );
}

export async function reject(filename: string, message: string): Promise<void> {
  await query(
    "INSERT INTO esg_imports (id, owner, filename, created, status, message) VALUES ($1,$2,$3,$4,$5,$6)",
    [id(), "", filename, now(), "Rejeitada", message],
  );
}

export interface Validation {
  ticket: string;
  summary: Payload["summary"];
  warnings: string[];
}

/** Valida sem trocar a base ativa: o resultado fica pendente de confirmação. */
export async function validate(raw: Uint8Array, filename: string, owner: string): Promise<Validation> {
  const ticket = id();
  const started = now();
  await transaction(async (client) => {
    await client.query(
      "UPDATE esg_imports SET status = 'Expirada', raw = NULL, payload = NULL WHERE status IN ('Validando','Aguardando confirmação') AND created < $1",
      [started - PENDING_TTL],
    );
    const busy = await client.query(
      "SELECT 1 FROM esg_imports WHERE status IN ('Validando','Aguardando confirmação') LIMIT 1",
    );
    if (busy.rowCount) {
      throw new Conflict(
        "Existe uma importação em andamento. Confirme, cancele ou aguarde sua expiração (30 minutos).",
      );
    }
    const state = await client.query("SELECT active FROM esg_state WHERE id = 1 FOR UPDATE");
    await client.query(
      "INSERT INTO esg_imports (id, owner, filename, created, status, base) VALUES ($1,$2,$3,$4,$5,$6)",
      [ticket, owner, filename, started, "Validando", state.rows[0]?.active ?? null],
    );
  });
  try {
    const payload = parseWorkbook(raw);
    const previous = (await snapshot()).summary;
    for (const [key, label] of [
      ["years", "anos"],
      ["houses", "Casas"],
    ] as const) {
      const before = new Set<string | number>(previous[key]);
      const added = (payload.summary[key] as (string | number)[]).filter((v) => !before.has(v)).sort();
      if (added.length) payload.warnings.push(`Novos ${label}: ${added.join(", ")}.`);
    }
    const updated = await query(
      "UPDATE esg_imports SET status = 'Aguardando confirmação', raw = $1, payload = $2, records = $3 WHERE id = $4 AND status = 'Validando' RETURNING id",
      [Buffer.from(raw), JSON.stringify(payload), payload.summary.records, ticket],
    );
    if (updated.length !== 1) throw new Conflict("Validação expirada. Envie a planilha novamente.");
    return { ticket, summary: payload.summary, warnings: payload.warnings };
  } catch (error) {
    const known = error instanceof WorkbookError || error instanceof Conflict;
    const message = known
      ? (error as Error).message
      : "Falha no processamento. A base anterior foi preservada.";
    await query("UPDATE esg_imports SET status = 'Rejeitada', message = $1, raw = NULL, payload = NULL WHERE id = $2", [
      message,
      ticket,
    ]);
    if (known) throw error;
    throw new WorkbookError(message);
  }
}

/** Troca atômica da base ativa; a anterior vira backup e as demais são descartadas. */
export async function confirm(ticket: string, owner: string): Promise<void> {
  await transaction(async (client) => {
    const state = await client.query("SELECT active, previous FROM esg_state WHERE id = 1 FOR UPDATE");
    const rows = await client.query(
      "SELECT * FROM esg_imports WHERE id = $1 AND owner = $2 AND status = 'Aguardando confirmação'",
      [ticket, owner],
    );
    const row = rows.rows[0];
    if (!row || row.created < now() - PENDING_TTL) {
      throw new Conflict("Validação inexistente ou expirada. Valide o arquivo novamente.");
    }
    if ((state.rows[0]?.active ?? null) !== row.base) {
      throw new Conflict("A base mudou. Valide o arquivo novamente.");
    }
    const raw: Buffer = row.raw;
    await client.query(
      "INSERT INTO esg_versions (id, filename, created, size, sha256, raw, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [ticket, row.filename, now(), raw.length, sha256(raw), raw, JSON.stringify(row.payload)],
    );
    await client.query("UPDATE esg_state SET previous = active, active = $1 WHERE id = 1", [ticket]);
    await client.query("UPDATE esg_imports SET status = 'Sucesso', raw = NULL, payload = NULL WHERE id = $1", [ticket]);
    await client.query(
      "DELETE FROM esg_versions WHERE id NOT IN (SELECT active FROM esg_state WHERE active IS NOT NULL UNION SELECT previous FROM esg_state WHERE previous IS NOT NULL)",
    );
  });
}

export async function cancel(ticket: string, owner: string): Promise<void> {
  await query(
    "UPDATE esg_imports SET status = 'Cancelada', raw = NULL, payload = NULL WHERE id = $1 AND owner = $2 AND status = 'Aguardando confirmação'",
    [ticket, owner],
  );
}

export async function pending(owner: string): Promise<Validation | null> {
  const rows = await query<{ id: string; payload: Payload }>(
    "SELECT id, payload FROM esg_imports WHERE owner = $1 AND status = 'Aguardando confirmação' AND created > $2",
    [owner, now() - PENDING_TTL],
  );
  if (!rows.length) return null;
  return { ticket: rows[0].id, summary: rows[0].payload.summary, warnings: rows[0].payload.warnings };
}

/** Volta para a versão anterior; usada na manutenção, nunca pela interface. */
export async function restore(): Promise<void> {
  await transaction(async (client) => {
    const state = await client.query("SELECT previous FROM esg_state WHERE id = 1 FOR UPDATE");
    if (!state.rows[0]?.previous) throw new Conflict("Nenhuma versão anterior disponível.");
    await client.query("UPDATE esg_state SET active = previous, previous = active WHERE id = 1");
  });
}

export async function source(): Promise<Buffer> {
  const rows = await query<{ raw: Buffer }>(
    "SELECT raw FROM esg_versions WHERE id = (SELECT active FROM esg_state WHERE id = 1)",
  );
  if (!rows.length) throw new Error("Base ativa indisponível.");
  return rows[0].raw;
}

/* ---------- Sessões administrativas ---------- */

export async function createSession(tokenDigest: string, csrf: string): Promise<void> {
  await query("DELETE FROM esg_sessions WHERE expires < $1", [now()]);
  await query("INSERT INTO esg_sessions (token, csrf, expires) VALUES ($1,$2,$3)", [tokenDigest, csrf, now() + 3600]);
}

export async function readSession(tokenDigest: string): Promise<{ token: string; csrf: string } | null> {
  const rows = await query<{ token: string; csrf: string }>(
    "SELECT token, csrf FROM esg_sessions WHERE token = $1 AND expires > $2",
    [tokenDigest, now()],
  );
  return rows[0] ?? null;
}

export async function deleteSession(tokenDigest: string): Promise<void> {
  await query("DELETE FROM esg_sessions WHERE token = $1", [tokenDigest]);
}

/** Limite de tentativas de senha: por endereço e no total, em cinco minutos. */
export async function tooManyAttempts(address: string): Promise<boolean> {
  const since = now() - 300;
  await query("DELETE FROM esg_login_attempts WHERE created < $1", [since]);
  const [counts] = await query<{ mine: string; total: string }>(
    "SELECT COUNT(*) FILTER (WHERE address = $1) AS mine, COUNT(*) AS total FROM esg_login_attempts WHERE created >= $2",
    [address, since],
  );
  return Number(counts?.mine ?? 0) >= 5 || Number(counts?.total ?? 0) >= 100;
}

export async function recordAttempt(address: string): Promise<void> {
  await query("INSERT INTO esg_login_attempts (address, created) VALUES ($1,$2)", [address, now()]);
}

export async function clearAttempts(address: string): Promise<void> {
  await query("DELETE FROM esg_login_attempts WHERE address = $1", [address]);
}
