/** API do painel em Netlify Functions: mesma superfície do backend FastAPI.
    Rotas: /api/health, /api/data, /api/login, /api/session, /api/logout,
    /api/imports, /api/imports/validate, /api/imports/:ticket/confirm, DELETE /api/imports/:ticket, /api/source. */

import type { Config, Context } from "@netlify/functions";
import { WorkbookError } from "../lib/parser.js";
import { randomToken, sameToken, tokenHash, verifyPassword } from "../lib/security.js";
import {
  Conflict,
  cancel,
  clearAttempts,
  confirm,
  createSession,
  deleteSession,
  ensureSchema,
  history,
  pending,
  readSession,
  recordAttempt,
  reject,
  snapshot,
  source,
  tooManyAttempts,
  validate,
} from "../lib/store.js";

const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB ?? "5") * 1024 * 1024;
const SESSION_COOKIE = "fiems_session";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...headers },
  });
}

function cookie(name: string, request: Request): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sessionCookie(token: string, secure: boolean, maxAge: number): string {
  const flags = ["Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (secure) flags.push("Secure");
  return `${SESSION_COOKIE}=${token}; ${flags.join("; ")}`;
}

/** Sessão administrativa válida; em métodos de escrita, confere também o token CSRF. */
async function requireSession(request: Request): Promise<{ token: string; csrf: string }> {
  const digest = tokenHash(cookie(SESSION_COOKIE, request));
  const row = digest ? await readSession(digest) : null;
  if (!row) throw new HttpError(401, "Entre para gerenciar a base de dados.");
  if (request.method !== "GET" && !sameToken(request.headers.get("X-CSRF-Token") ?? "", row.csrf)) {
    throw new HttpError(403, "Sessão de confirmação inválida. Recarregue a página.");
  }
  return row;
}

async function login(request: Request, context: Context): Promise<Response> {
  if (request.headers.get("X-Requested-With") !== "fiems-dashboard") {
    throw new HttpError(403, "Solicitação inválida.");
  }
  const adminHash = process.env.ADMIN_PASSWORD_HASH ?? "";
  if (!adminHash) {
    throw new HttpError(503, "Administrador não configurado. Defina ADMIN_PASSWORD_HASH nas variáveis do site.");
  }
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    throw new HttpError(422, "Requisição inválida.");
  }
  if (!password || password.length > 512) throw new HttpError(422, "Informe a senha administrativa.");
  const address = context.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";
  if (await tooManyAttempts(address)) throw new HttpError(429, "Muitas tentativas. Aguarde cinco minutos.");
  // A tentativa é registrada antes do hash, para valer também em chamadas simultâneas.
  await recordAttempt(address);
  if (!verifyPassword(password, adminHash)) throw new HttpError(401, "Senha inválida.");
  await clearAttempts(address);
  const token = randomToken();
  const csrf = randomToken();
  await createSession(tokenHash(token), csrf);
  const secure = new URL(request.url).protocol === "https:";
  return json({ csrf }, 200, { "Set-Cookie": sessionCookie(token, secure, 3600) });
}

async function upload(request: Request): Promise<Response> {
  const auth = await requireSession(request);
  const filename = decodeURIComponent(request.headers.get("X-Filename") ?? "");
  if (
    !filename ||
    filename.length > 180 ||
    /[/\\\x00]/.test(filename) ||
    [...filename].some((c) => c.charCodeAt(0) < 32) ||
    !filename.toLowerCase().endsWith(".xlsx")
  ) {
    await reject("Nome de arquivo inválido", "Somente .xlsx com nome simples é aceito.");
    throw new HttpError(422, "Selecione um arquivo .xlsx com nome simples, sem caminhos.");
  }
  const mime = (request.headers.get("Content-Type") ?? "").split(";")[0];
  if (
    mime !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" &&
    mime !== "application/octet-stream"
  ) {
    await reject(filename, "Tipo de arquivo inválido.");
    throw new HttpError(415, "Tipo de arquivo inválido.");
  }
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.length > MAX_UPLOAD) {
    await reject(filename, "Limite de upload excedido.");
    throw new HttpError(413, `Arquivo excede ${Math.floor(MAX_UPLOAD / (1024 * 1024))} MB.`);
  }
  if (!raw.length) throw new HttpError(422, "Arquivo vazio.");
  return json(await validate(raw, filename, auth.token));
}

async function route(request: Request, context: Context): Promise<Response> {
  const { pathname } = new URL(request.url);
  const path = pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/";
  const method = request.method.toUpperCase();

  if (path === "/health") return json({ status: "ok" });

  await ensureSchema();

  if (path === "/data" && method === "GET") {
    // O navegador recebe os indicadores normalizados, nunca o arquivo ou segredos.
    return json(await snapshot());
  }
  if (path === "/login" && method === "POST") return login(request, context);
  if (path === "/session" && method === "GET") {
    const auth = await requireSession(request);
    return json({ csrf: auth.csrf });
  }
  if (path === "/logout" && method === "POST") {
    const auth = await requireSession(request);
    await deleteSession(auth.token);
    const secure = new URL(request.url).protocol === "https:";
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", secure, 0) });
  }
  if (path === "/imports" && method === "GET") {
    const auth = await requireSession(request);
    return json({ history: await history(), pending: await pending(auth.token) });
  }
  if (path === "/imports/validate" && method === "POST") return upload(request);

  const confirmMatch = path.match(/^\/imports\/([A-Za-z0-9_-]{1,64})\/confirm$/);
  if (confirmMatch && method === "POST") {
    const auth = await requireSession(request);
    await confirm(confirmMatch[1], auth.token);
    return json({ ok: true });
  }
  const ticketMatch = path.match(/^\/imports\/([A-Za-z0-9_-]{1,64})$/);
  if (ticketMatch && method === "DELETE") {
    const auth = await requireSession(request);
    await cancel(ticketMatch[1], auth.token);
    return json({ ok: true });
  }
  if (path === "/source" && method === "GET") {
    await requireSession(request);
    const raw = await source();
    return new Response(new Uint8Array(raw), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="base-ativa.xlsx"',
        ...SECURITY_HEADERS,
      },
    });
  }
  throw new HttpError(404, "Recurso não encontrado.");
}

export default async function handler(request: Request, context: Context): Promise<Response> {
  try {
    return await route(request, context);
  } catch (error) {
    if (error instanceof HttpError) return json({ detail: error.message }, error.status);
    if (error instanceof WorkbookError) return json({ detail: error.message }, 422);
    if (error instanceof Conflict) return json({ detail: error.message }, 409);
    console.error("Falha inesperada:", error);
    const detail = error instanceof Error && /DATABASE_URL/.test(error.message)
      ? "Banco de dados não configurado."
      : "Não foi possível concluir a operação.";
    return json({ detail }, 500);
  }
}

export const config: Config = { path: "/api/*" };
