# Indicadores ESG — Sistema FIEMS

Dashboard funcional dos indicadores ambientais, sociais e de governança da planilha fornecida. Inclui 14 telas ESG (início, três dimensões e dez temas), Configurações, importação validada e persistente, histórico e backup da base anterior.

## Início rápido — sem precisar compilar o frontend

Requisito: **Python 3.12**. O ZIP inclui o frontend de produção já compilado, o código-fonte completo e o Excel original. Extraia o ZIP e abra o terminal na pasta `dashboard-indicadores-fiems`.

Windows (PowerShell):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe start.py
```

Linux / macOS:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
.venv/bin/python start.py
```

Abra **http://localhost:8000**. Na primeira execução, a planilha incluída é validada e ativada automaticamente. Não é necessário importar nenhum arquivo para consultar os gráficos. Inicialização leva alguns segundos; aguarde a mensagem de conclusão do servidor.

## Habilitar a administração

A consulta aos indicadores não exige login. A atualização e o download da fonte exigem autenticação. **Não há senha padrão**. Pare o servidor, execute o comando abaixo, escolha e confirme sua senha de pelo menos 12 caracteres e inicie novamente.

Windows:

```powershell
.\.venv\Scripts\python.exe -m backend.app.cli configure
```

Linux / macOS:

```bash
.venv/bin/python -m backend.app.cli configure
```

A senha é armazenada somente como hash scrypt em `data/runtime/admin.json`. A sessão administrativa dura uma hora, usa cookie HttpOnly/SameSite=Strict e token CSRF. Redefinir a senha pelo comando invalida sessões existentes. Nunca envie o diretório `data/runtime` ao Git.

## Atualizando os dados pelo dashboard

1. Acesse **Configurações** no cabeçalho e entre com sua senha.
2. Selecione a nova planilha `.xlsx`.
3. Clique em **Validar planilha** e aguarde o processamento.
4. Confira os 16 indicadores, anos, Casas, registros e avisos.
5. Clique em **Confirmar atualização da base** ou **Cancelar**.
6. Aguarde a mensagem de sucesso e confira a data da base.
7. Retorne ao dashboard. Os filtros passam a reconhecer os novos valores.

A validação não substitui os dados ativos. Arquivos inválidos são rejeitados, com o motivo exibido e registrado. Planilhas válidas com lacunas ou repetições apresentam avisos. A confirmação ativa a nova versão em uma transação SQLite; os dados continuam ativos após recarregar a página ou reiniciar o servidor. Outras abas do dashboard atualizam ao recuperar o foco ou em até 60 segundos.

Somente uma importação pode estar em validação/aguardando confirmação. Ela expira em 30 minutos. A confirmação é vinculada à sessão que fez o envio; não saia antes de confirmar ou cancelar.

**Formato:** `.xlsx`, até 10 MB por padrão. `.xls`, `.xlsm`, macros, arquivos corrompidos, vínculos externos e XML com DTD/entidades são recusados. Não há execução de fórmulas nem macros. Para fórmulas, salve a planilha recalculada no Excel antes de enviar: apenas resultados armazenados são lidos.

## Dados e regras de interpretação

- Fonte inicial intacta: `data/source/indicadores.xlsx` (mesmos bytes do arquivo recebido).
- Extração reproduzível inicial: `data/processed/initial.json`, incluído como evidência. A aplicação **não depende desse JSON**: inicialização e upload usam o mesmo parser Python.
- Base ativa, backup anterior, arquivos brutos e histórico: `data/runtime/dashboard.sqlite3`.
- O parser usa código do indicador nos metadados e cabeçalhos semânticos; nomes/ordem das abas não determinam a extração. Aceita linhas introdutórias adicionais dentro das primeiras 100 linhas e dados nas primeiras 64 colunas, até 30.000 linhas por tabela.
- Unidades vêm dos metadados/cabeçalhos. Categorias, anos, Casas e meses vêm da fonte. A fonte inicial contém **2.929 valores normalizados**, **24 ausentes** e **1 repetição exata preservada**.
- `-`, branco e fórmula sem resultado armazenado são ausência, não zero. Valores não numéricos, negativos, infinitos e anos/meses inválidos bloqueiam a importação.
- Consumo e horas são agregados por período e série; colaboradores são retratos anuais, nunca totais somados entre anos.
- Água/energia per capita são índices anuais consolidados da fonte. Não são recalculados a partir de outras abas, somados nem atribuídos a Casas. Ao selecionar uma Casa, o gráfico informa a indisponibilidade do recorte.
- Total de impressões não inclui a coluna de cópias. Colaboradores não inclui temporários. Não se repartem `SESI/IEL`, `SESI/SENAI` nem `Sem Centro` entre outras Casas.
- SAC termina em 2024; muitos indicadores terminam em 2025; energia renovável chega a agosto de 2026. A ausência não é preenchida com projeções.
- Ao abrir um tema, seleciona-se o último ano comum a seus indicadores; os demais anos permanecem disponíveis no filtro. “Todos os anos” exibe a série temporal, não uma soma de pessoas ou índices entre anos.
- Somas com valores ausentes são parciais e sinalizadas. A opção “Consultar valores do gráfico” permite acesso textual/por teclado aos resultados.

Veja `docs/analise-fonte.md` para o mapeamento auditável e decisões de interpretação.

### Regenerar a extração inicial

Com o ambiente Python ativado:

```bash
python -m backend.app.cli extract
```

Esse comando gera novamente `data/processed/initial.json`; não altera a base ativa. Atualizações normais devem ocorrer pelas Configurações.

### Recuperar a versão anterior

Pare o servidor. Faça uma cópia de segurança de `data/runtime` e execute:

```bash
python -m backend.app.cli restore
```

Digite `RESTAURAR` e reinicie o servidor. Os ponteiros ativo/anterior são trocados atomicamente. Cada nova confirmação mantém exatamente a versão anterior, além da ativa. O histórico registra importações, incluindo rejeições; as 100 mais recentes aparecem na interface. A restauração é uma operação manual de manutenção, não uma importação.

## Arquitetura e stack

**React 19 + TypeScript + Vite + Recharts** na interface; **FastAPI + openpyxl + SQLite** no servidor. O servidor Python foi escolhido para ler Excel sem depender de serviços externos; SQLite permite guardar fonte e processamento com troca atômica. Uma única aplicação HTTP serve API e frontend compilado.

```text
backend/app/       catálogo, parser, persistência, segurança, API e CLI
backend/tests/     testes com a fonte real e mutações temporárias de teste
frontend/src/      páginas, gráficos, filtros, tipos, agregações e estilos
frontend/dist/     build de produção, pronto para servir
scripts/           desenvolvimento conjunto e verificação de navegador
data/source/       Excel original preservado
data/processed/    extração inicial reproduzível
docs/              requisitos recebidos, análise e validação
```

Não há serviços pagos, CDNs, telemetria, dependência de fontes online nem mocks nos dados exibidos. Testes alteram cópias temporárias da planilha somente para verificar casos de falha e novos anos/Casas.

## Desenvolvimento e build

Requisitos adicionais: **Node.js 22 ou 24 e npm 10+**. Depois de preparar o ambiente Python e instalar as dependências:

```bash
npm --prefix frontend ci
npm run dev
```

Esse comando inicia a API em 8000 e Vite em 5173. Em ambiente próprio, `PYTHON_BIN` permite selecionar outro executável Python. Para trabalhar separadamente, execute `python start.py` e `npm --prefix frontend run dev` em dois terminais.

Build:

```bash
npm run build
python start.py
```

## Validação

Ative o ambiente Python (`.venv\Scripts\Activate.ps1` no PowerShell ou `source .venv/bin/activate` no Linux/macOS), depois:

```bash
python -m pip install -r requirements-dev.lock
npm --prefix frontend ci
python -m backend.app.cli extract
python -m ruff check backend start.py
python -m mypy
python -m pytest -q
npm run lint
npm run typecheck
npm test
npm run build
```

Os testes Python cobrem a fonte real, indicadores, valores ausentes, novos anos/Casas, nomes de abas, arquivo corrompido, autenticação, CSRF, limite de upload, traversal, concorrência, cancelamento, rollback e persistência após recriar a aplicação. Testes TypeScript cobrem filtros combinados, ordem temporal, lacunas, categorias e agregação de índices/retratos.

`node scripts/browser-check.mjs` é uma verificação adicional com Playwright. Use **apenas um servidor descartável** porque o teste confirma importações. Instale Chromium com `cd frontend && npx playwright install chromium`, informe `BASE_URL` e `E2E_PASSWORD` (senha do administrador desse ambiente). `SCREENSHOT_DIR` é opcional. Nunca execute esse teste contra a base de produção.

Resultados reais e eventuais limitações de execução estão em `docs/validacao.md`.

## Publicação no Netlify

O site publicado usa **Netlify Functions + PostgreSQL (Neon)**: as telas são as mesmas, e a API que
lê a planilha e guarda os dados roda como função serverless, porque o Netlify não executa Python.

| Parte | No Netlify | No servidor próprio |
|---|---|---|
| Interface | `frontend/dist` | `frontend/dist` |
| API | `netlify/functions/api.mts` (TypeScript) | `backend/app` (FastAPI) |
| Leitor de planilha | `netlify/lib/parser.ts` | `backend/app/parser.py` |
| Armazenamento | Postgres/Neon | SQLite em `data/runtime` |

Os dois leitores produzem exatamente o mesmo resultado: `tests/parser.test.mts` compara a saída do
leitor TypeScript com `data/processed/initial.json`, que é a saída validada do leitor Python, registro
a registro, incluindo avisos e células de origem. Qualquer divergência quebra o teste.

### Variáveis de ambiente do site

Em **Site configuration → Environment variables**:

| Variável | Obrigatória | Uso |
|---|---|---|
| `DATABASE_URL` | sim | Conexão do Neon (a mesma do `.env` local) |
| `ADMIN_PASSWORD_HASH` | sim | Hash scrypt da senha administrativa; gere com `npm run admin:hash` |
| `MAX_UPLOAD_MB` | não | Limite de envio; padrão 5, teto prático da plataforma |

`NODE_VERSION` já está no `netlify.toml`. Nenhuma senha em texto puro é enviada ao Netlify.

### Publicação

1. `npm run admin:hash` e guarde o valor gerado.
2. Conecte o repositório no Netlify e cadastre as variáveis acima.
3. Publique. O build roda `npm run netlify:build`, que prepara o banco (`db:setup`), instala o
   frontend e compila. Na primeira publicação, a planilha de `data/source` vira a base ativa; nas
   seguintes, a base existente é preservada.

A atualização dos indicadores continua sendo feita pela tela de Configurações, com senha, validação,
confirmação, histórico e backup da versão anterior — agora gravados no Postgres.

O envio é limitado a cerca de 5 MB por requisição, limite da plataforma; a planilha atual tem 1,5 MB.
Para arquivos maiores, use o servidor próprio.

### Comandos

```bash
npm run db:setup        # cria as tabelas e, se vazio, carrega a planilha inicial
npm run admin:hash      # gera ADMIN_PASSWORD_HASH
npm run test:api        # testes do leitor TypeScript e da API (usa DATABASE_URL)
npm run typecheck:api   # tipos das funções e scripts
```

Localmente, `.env` traz `DATABASE_URL` e não vai para o Git. O backend Python continua funcionando
para desenvolvimento offline, com SQLite, sem depender do banco.

## Docker (alternativa)

```bash
docker compose up --build -d
docker compose exec dashboard python -m backend.app.cli configure
```

Após configurar a senha: `docker compose restart dashboard`. Abra http://localhost:8000. O volume `fiems-data` preserva a base. **Não execute `docker compose down -v` para atualizar**, pois remove o volume persistente.

## Configuração do servidor

Variáveis são lidas do ambiente do processo; `.env.example` documenta as opções e não é carregado automaticamente pelo Python.

| Variável | Padrão | Uso |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface de escuta em `start.py` |
| `PORT` | `8000` | Porta HTTP |
| `DATA_DIR` | `data/runtime` | Diretório durável do banco e configuração administrativa |
| `MAX_UPLOAD_MB` | `10` | Limite de envio |
| `COOKIE_SECURE` | `false` | Use `true` quando servido por HTTPS |
| `ADMIN_PASSWORD_HASH` | ausente | Alternativa ao hash salvo pela CLI; tem precedência |

A solução é de uma organização, com uma conta administrativa e consulta de indicadores liberada para quem alcança o servidor. Para uso institucional, mantenha a aplicação na rede autorizada ou atrás do controle de acesso corporativo. A publicação deve usar HTTPS e armazenamento persistente para `DATA_DIR`. Não há implementação de multi-tenant ou perfis adicionais, pois não foram solicitados.

## Layout e referências

Os dois textos de requisitos recebidos estão preservados em `docs/`. As imagens dos mockups citadas no texto não estavam entre os anexos. A hierarquia e a disposição descritas foram implementadas: início vertical; Ambiental em 3 + 2; Social em três opções; Governança em duas; gráficos em pares e terceiro centralizado quando indicado. Em telas menores, os blocos se empilham. Nenhum logotipo oficial foi inventado: o cabeçalho é texto institucional.
