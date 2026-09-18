/** Hash de senha e tokens de sessão.
    Mesmo formato scrypt do backend Python (salt:digest, N=16384 r=8 p=1, 64 bytes),
    para que um hash gerado pela CLI continue válido aqui. */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 64, PARAMS).toString("hex");
  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  try {
    const separator = encoded.indexOf(":");
    if (separator < 0) return false;
    const salt = encoded.slice(0, separator);
    const expected = Buffer.from(encoded.slice(separator + 1), "hex");
    const actual = scryptSync(password, salt, 64, PARAMS);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Comparação de tokens em tempo constante, tolerante a tamanhos diferentes. */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
