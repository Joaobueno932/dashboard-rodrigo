# Relatório de validação

Validação realizada no ambiente de entrega, em Linux, com Python 3.12 e Node.js 24.

| Verificação | Resultado |
|---|---|
| Instalação Python em venv novo com `requirements.lock` | Aprovada |
| Instalação frontend a partir do lock com `npm ci` | Aprovada |
| Extração da planilha inicial | 16 indicadores; 2.929 registros; 24 valores ausentes |
| Ruff — backend e inicializador | Aprovado |
| mypy — backend | Aprovado; 7 módulos |
| ESLint — frontend | Aprovado |
| TypeScript — frontend | Aprovado |
| pytest | 32 testes aprovados |
| Vitest | 11 testes aprovados |
| Build de produção | Aprovado; HTML, CSS e JavaScript em `frontend/dist` |
| Conferência independente célula a célula | 2.929 valores iguais à fonte; `conferencia-valores.json` |
| Servidor HTTP real em ambiente novo | Inicialização, API e rotas de aplicação respondendo corretamente |
| Persistência / backup / rollback | Testes reais com SQLite, reabertura da base, restauração e falha injetada em transação aprovados |
| Auditoria visual em navegador | **Não concluída — ambiente de prévia sem Python disponível para executar a aplicação** |
| Playwright E2E local | **Não executado — download do Chromium indisponível no ambiente** |
| Docker | Arquivos fornecidos; imagem não foi construída neste ambiente |

## Escopo dos testes

A suíte não depende de serviços externos e utiliza a planilha real. Mutações de teste ocorrem em arquivos temporários. Coberturas: identificação sem depender do nome da aba, fonte ausente/corrompida, nulos e traços, novo ano/Casa, registros da fonte, categorias, meses cronológicos, filtros, índices per capita, retratos anuais, autorização, CSRF, traversal, tamanho do upload, MIME, tentativas simultâneas, confirmação, cancelamento, troca atômica, restauração, falha de parser e falha de transação.

A verificação HTTP iniciou efetivamente o Uvicorn em um processo separado e consultou as rotas e a API. O teste de persistência recriou o objeto de acesso à base e executou novamente a inicialização para confirmar que a fonte inicial não sobrescreve uma importação já confirmada.

## Limitações da verificação

Os testes de componente/DOM, interação do navegador, tooltips visuais, teclado e responsividade não foram executados no navegador. A aplicação inclui CSS responsivo, tabelas acessíveis e semântica de interface, mas isso não equivale a aprovação visual. `scripts/browser-check.mjs` automatiza essas verificações principais em um ambiente local com Chromium. A revisão visual contra os mockups também depende das imagens, não fornecidas nesta tarefa; o layout foi construído conforme a descrição textual.

Os testes Python emitiram dois avisos de depreciação das dependências de teste Starlette/httpx/anyio; não são falhas nos testes ou mensagens produzidas pelos dados do dashboard. O npm emitiu aviso sobre configuração de proxy do ambiente e manutenção da versão do ESLint. Essas observações não foram ocultadas nem tratadas como erros da aplicação.

Nenhum dado do dashboard foi inventado. Nenhum serviço foi publicado. Senhas e sessões de teste não fazem parte da entrega. A pasta de dependências, os bancos de teste, caches e artefatos temporários foram excluídos do ZIP.
