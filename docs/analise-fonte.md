# Análise da planilha e regras de extração

Fonte: `Sistema Indicadores_FIEMS_2026 6(1).xlsx`. O arquivo original foi mantido byte a byte como `data/source/indicadores.xlsx`.

SHA-256: `14536606f79c6e69f5c7c08d7b068425c45b3c6f0e4c76f7f50b85a75d4df8ab`.

## Mapeamento verificado

| Código | Indicador | Registros | Ausentes | Período | Unidade extraída |
|---|---|---:|---:|---|---|
| A.1.1.1 | Consumo de água | 1056 | 16 | 2022–2025 | m³ |
| A.1.1.2 | Consumo de água per capita | 4 | 0 | 2022–2025 | m³/pessoa |
| A.2.1.1 | Consumo de energia | 1252 | 7 | 2022–2025 | kwh |
| A.2.1.2 | Consumo de energia per capita | 4 | 0 | 2022–2025 | kwh/pessoa |
| A.2.2.1 | Energia gerada por fontes renováveis | 122 | 0 | 2022–2026 | MWh |
| A.3.2.1 | Total de impressões | 226 | 0 | 2022–2025 | Número de impressões |
| A.4.1.1 | Consumo de combustível | 29 | 1 | 2023–2025 | litros |
| A.5.1.1 | Emissões GEE | 18 | 0 | 2023–2025 | tCO2e |
| S.1.1.1 | Número de colaboradores | 16 | 0 | 2022–2025 | Número de colaboradores |
| S.1.1.2 | Colaboradores por gênero | 32 | 0 | 2022–2025 | Número de colaboradores |
| S.1.1.3 | Colaboradores por faixa etária | 48 | 0 | 2022–2025 | Número de colaboradores |
| S.1.2.1 | Colaboradores por raça | 96 | 0 | 2022–2025 | Número de colaboradores |
| S.1.4.2 | Horas de capacitação Unindústria | 15 | 0 | 2022–2025 | Horas |
| G.1.1.7 | Participantes em treinamento de ética e compliance | 4 | 0 | 2022–2025 | Número de participantes |
| G.3.2.1 | Número de atendimentos — Ouvidoria | 4 | 0 | 2022–2025 | Número de atendimentos |
| G.3.2.3 | Número de atendimentos — SAC | 3 | 0 | 2022–2024 | Número de atendimentos |

Registros são valores normalizados. Nas tabelas de diversidade, cada categoria de uma linha da fonte vira um registro. Não equivalem ao número de pessoas.

## Cuidados descobertos na fonte

- Há 87 abas no arquivo, incluindo apresentação, metadados e indicadores fora do escopo. Somente os 16 indicadores solicitados alimentam as telas.
- Água e energia incluem ambos os códigos (total e per capita) em seus metadados. O parser diferencia as tabelas pelos cabeçalhos e dimensões, não apenas pelo código ou nome de aba.
- As dimensões declaradas de algumas abas chegam à coluna XFD por formatação. Leitura normal poderia expandir milhões de células vazias; a extração usa leitura somente-leitura com colunas limitadas.
- G.1.1.7 compartilha a aba com G.1.1.6: seleciona participantes, nunca quantidade de treinamentos. Ouvidoria/SAC selecionam atendimentos, nunca prazo de resposta.
- A descrição de periodicidade de vários indicadores é mensal, mas suas tabelas só possuem Ano. A interface respeita a granularidade efetiva das linhas e não fabrica meses.
- A.5.1.1 tem metadado genérico “Toneladas”, porém o cabeçalho informa tCO2e; prevalece a unidade específica do cabeçalho.
- Os índices per capita são mantidos exatamente como fornecidos, incluindo possíveis diferenças entre seus numeradores e o total de outras abas. Não se considera uma aba autorização para corrigir outra.
- Linhas repetidas podem representar contas diferentes sem identificador. A repetição exata encontrada em energia foi mantida; não se presume erro da fonte.
- Novas categorias em formato largo mantêm o prefixo semântico “Número de colaboradores …”. Se o padrão de cabeçalho mudar, a importação deve ser revisada; não há inferência semântica por IA.

## Avisos da extração inicial

- A.1.1.1: 16 valores ausentes; não convertidos em zero.
- A.1.1.1: 8 combinações Casa/ano com menos de 12 meses.
- A.1.1.2: valor anual consolidado, sem recorte por Casa; proporções não são somadas.
- A.2.1.1: 7 valores ausentes; não convertidos em zero.
- A.2.1.1: 1 registros iguais preservados; revisar na fonte.
- A.2.1.1: 3 combinações Casa/ano com menos de 12 meses.
- A.2.1.2: valor anual consolidado, sem recorte por Casa; proporções não são somadas.
- A.2.2.1: 5 combinações Casa/ano com menos de 12 meses.
- A.4.1.1: 1 valores ausentes; não convertidos em zero.

## Rastreabilidade

Cada indicador carrega `sheet` (aba de origem), e cada valor normalizado carrega `cell` (célula de origem). O arquivo bruto ativo pode ser baixado em Configurações. A normalização não modifica o XLSX.

## Limites do contrato de importação

O contrato suporta 150 abas, metadados e cabeçalhos nas primeiras 100 linhas, até 64 colunas úteis e 30.000 linhas por tabela. O arquivo compactado tem limite configurável (10 MB padrão); o conteúdo descompactado está limitado a 100 MB e 4.000 entradas. Alterações estruturais incompatíveis são recusadas. Anos aceitos: 1900–2200. Números não negativos e finitos; mês textual em português. XLSM, macros e vínculos externos não são aceitos.
