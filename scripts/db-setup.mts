/** Cria as tabelas e, se ainda não houver base ativa, carrega a planilha original.
    Idempotente: roda a cada publicação sem alterar dados já existentes. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSchema, hasActive, initialize, snapshot } from "../netlify/lib/store.js";

const root = fileURLToPath(new URL("../", import.meta.url));

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL && !process.env.NETLIFY_DATABASE_URL) {
    throw new Error(
      "DATABASE_URL não configurada. Defina a conexão do Neon nas variáveis de ambiente do site antes de publicar.",
    );
  }
  await ensureSchema();
  console.log("Tabelas verificadas.");
  if (await hasActive()) {
    const current = await snapshot();
    console.log(
      `Base ativa preservada: ${current.metadata.filename} · ${current.summary.indicators} indicadores · ${current.summary.records} registros.`,
    );
    return;
  }
  const file = path.join(root, "data/source/indicadores.xlsx");
  const raw = new Uint8Array(readFileSync(file));
  await initialize(raw, path.basename(file));
  const current = await snapshot();
  console.log(
    `Base inicial carregada: ${current.summary.indicators} indicadores · ${current.summary.records} registros · anos ${current.summary.years.join(", ")}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
