/** Contratos dos indicadores: cabeçalhos semânticos, nunca coordenadas de planilha.
    Espelha backend/app/catalog.py — as duas listas precisam continuar idênticas. */

export interface Indicator {
  code: string;
  title: string;
  /** Regex sobre o cabeçalho normalizado que identifica a coluna de valor. */
  value: RegExp;
  kind: "sum" | "stock" | "ratio" | "wide";
  category?: RegExp;
}

const spec = (
  code: string,
  title: string,
  value: string,
  kind: Indicator["kind"] = "sum",
  category?: string,
): Indicator => ({
  code,
  title,
  value: new RegExp(value),
  kind,
  ...(category ? { category: new RegExp(category) } : {}),
});

export const CATALOG: Indicator[] = [
  spec("A.1.1.1", "Consumo de água", "^consumo de agua \\(m³\\)$"),
  spec("A.1.1.2", "Consumo de água per capita", "^consumo de agua per capita", "ratio"),
  spec("A.2.1.1", "Consumo de energia", "^consumo de energia eletrica \\(kwh\\)$"),
  spec("A.2.1.2", "Consumo de energia per capita", "^consumo de energia per capita", "ratio"),
  spec("A.2.2.1", "Energia gerada por fontes renováveis", "^total de energia gerada"),
  spec("A.3.2.1", "Total de impressões", "^total de impressoes$"),
  spec("A.4.1.1", "Consumo de combustível", "^total de combustivel consumido", "sum", "^tipo do combustivel"),
  spec("A.5.1.1", "Emissões GEE", "^total de emissoes", "sum", "^escopo$"),
  spec("S.1.1.1", "Número de colaboradores", "^numero de colaboradores$", "stock"),
  spec("S.1.1.2", "Colaboradores por gênero", "^numero de colaboradores (do genero|de genero)", "wide"),
  spec("S.1.1.3", "Colaboradores por faixa etária", "^numero de colaboradores (ate|de|com)", "wide"),
  spec("S.1.2.1", "Colaboradores por raça", "^numero de colaboradores .+", "wide"),
  spec("S.1.4.2", "Horas de capacitação Unindústria", "^carga horaria realizada$"),
  spec(
    "G.1.1.7",
    "Participantes em treinamento de ética e compliance",
    "^numero de participantes em treinamentos de compliance$",
  ),
  spec("G.3.2.1", "Número de atendimentos — Ouvidoria", "^numero de atendimentos$"),
  spec("G.3.2.3", "Número de atendimentos — SAC", "^numero de atendimentos$"),
];
