/** Gera o valor de ADMIN_PASSWORD_HASH a partir de uma senha digitada no terminal.
    A senha não aparece na tela nem é gravada: só o hash scrypt é exibido. */

import { createInterface } from "node:readline";
import { hashPassword } from "../netlify/lib/security.js";

const ETX = String.fromCharCode(3); // Ctrl+C
const DEL = String.fromCharCode(127); // Backspace

/** Fila de linhas, usada quando a entrada vem redirecionada (sem terminal). */
const piped = process.stdin.isTTY
  ? null
  : createInterface({ input: process.stdin, crlfDelay: Infinity })[Symbol.asyncIterator]();

/** Lê uma linha sem eco; fora de um terminal, lê a próxima linha da entrada. */
async function ask(question: string): Promise<string> {
  process.stdout.write(question);
  if (piped) {
    const next = await piped.next();
    process.stdout.write("\n");
    return next.done ? "" : next.value;
  }
  return new Promise((resolve) => {
    const input = process.stdin;
    let value = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          input.off("data", onData);
          input.setRawMode(false);
          input.pause();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === ETX) {
          input.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (char === DEL || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= " ") value += char;
      }
    };
    input.on("data", onData);
  });
}

const password = await ask("Crie a senha administrativa (mínimo 12 caracteres): ");
if (password.length < 12) {
  console.error("Senha curta. Nada foi gerado.");
  process.exit(1);
}
if ((await ask("Confirme a senha: ")) !== password) {
  console.error("As senhas não conferem. Nada foi gerado.");
  process.exit(1);
}

console.log("\nNo Netlify, em Site configuration → Environment variables, crie:\n");
console.log("  ADMIN_PASSWORD_HASH");
console.log(`  ${hashPassword(password)}\n`);
console.log("A senha em si não é armazenada; guarde-a no seu gerenciador de senhas.");
process.exit(0);
