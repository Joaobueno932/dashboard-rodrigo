/** Exercita a função da API como o Netlify a chama: sessão, CSRF, upload e download.
    Usa o banco real configurado em DATABASE_URL e remove ao final as linhas que criou. */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../netlify/lib/security.js";

const PASSWORD = "senha-de-teste-automatizada";
process.env.ADMIN_PASSWORD_HASH = hashPassword(PASSWORD);

const { default: handler } = await import("../netlify/functions/api.mts");
const { query } = await import("../netlify/lib/store.js");

const root = fileURLToPath(new URL("../", import.meta.url));
const workbook = readFileSync(path.join(root, "data/source/indicadores.xlsx"));
const FILENAME = "teste-automatizado.xlsx";
const context = { ip: "203.0.113.7" } as never;

let cookie = "";
let csrf = "";

const call = (path: string, init: RequestInit = {}) =>
  handler(
    new Request(`https://exemplo.netlify.app/api${path}`, {
      ...init,
      headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
    }),
    context,
  );

after(async () => {
  await query("DELETE FROM esg_imports WHERE filename = $1 OR message = $2", [
    FILENAME,
    "Somente .xlsx com nome simples é aceito.",
  ]);
  await query("DELETE FROM esg_login_attempts WHERE address = $1", ["203.0.113.7"]);
  if (cookie) await query("DELETE FROM esg_sessions WHERE expires < $1 OR expires > $1", [0]).catch(() => {});
});

test("health responde sem banco", async () => {
  const response = await call("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("dados públicos trazem os 16 indicadores", async () => {
  const response = await call("/data");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { indicators: unknown[]; summary: { records: number } };
  assert.equal(body.indicators.length, 16);
  assert.equal(body.summary.records, 2929);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("sessão exige login", async () => {
  const response = await call("/session");
  assert.equal(response.status, 401);
});

test("login recusa requisição sem o cabeçalho esperado", async () => {
  const response = await call("/login", { method: "POST", body: JSON.stringify({ password: PASSWORD }) });
  assert.equal(response.status, 403);
});

test("login recusa senha errada", async () => {
  const response = await call("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fiems-dashboard" },
    body: JSON.stringify({ password: "errada" }),
  });
  assert.equal(response.status, 401);
});

test("login aceita a senha correta e abre sessão", async () => {
  const response = await call("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "fiems-dashboard" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("Set-Cookie") ?? "";
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Secure/);
  cookie = setCookie.split(";")[0];
  csrf = ((await response.json()) as { csrf: string }).csrf;
  assert.ok(csrf.length > 20);
});

test("histórico disponível após login", async () => {
  const response = await call("/imports");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { history: unknown[] };
  assert.ok(Array.isArray(body.history));
});

test("escrita sem token CSRF é recusada", async () => {
  const response = await call("/imports/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Filename": FILENAME,
    },
    body: workbook,
  });
  assert.equal(response.status, 403);
});

test("nome de arquivo com caminho é recusado", async () => {
  const response = await call("/imports/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Filename": encodeURIComponent("../../etc/passwd.xlsx"),
      "X-CSRF-Token": csrf,
    },
    body: workbook,
  });
  assert.equal(response.status, 422);
});

test("planilha válida é aceita e pode ser cancelada", async () => {
  const response = await call("/imports/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Filename": FILENAME,
      "X-CSRF-Token": csrf,
    },
    body: workbook,
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ticket: string; summary: { records: number } };
  assert.equal(body.summary.records, 2929);

  const pending = await call("/imports");
  const listed = (await pending.json()) as { pending: { ticket: string } | null };
  assert.equal(listed.pending?.ticket, body.ticket);

  const cancelled = await call(`/imports/${body.ticket}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } });
  assert.equal(cancelled.status, 200);
});

test("arquivo corrompido é recusado sem trocar a base", async () => {
  const response = await call("/imports/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "X-Filename": FILENAME,
      "X-CSRF-Token": csrf,
    },
    body: new Uint8Array([80, 75, 3, 4, 9, 9, 9]),
  });
  assert.equal(response.status, 422);
  const data = (await (await call("/data")).json()) as { summary: { records: number } };
  assert.equal(data.summary.records, 2929);
});

test("download da base ativa exige sessão e devolve o xlsx", async () => {
  const response = await call("/source");
  assert.equal(response.status, 200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(bytes.length, workbook.length);
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="base-ativa.xlsx"');
});

test("logout encerra a sessão", async () => {
  const response = await call("/logout", { method: "POST", headers: { "X-CSRF-Token": csrf } });
  assert.equal(response.status, 200);
  const after = await call("/session");
  assert.equal(after.status, 401);
});

test("rota inexistente responde 404", async () => {
  const response = await call("/nao-existe");
  assert.equal(response.status, 404);
});
