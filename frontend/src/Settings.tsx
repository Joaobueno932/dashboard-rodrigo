import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Upload,
  FileSpreadsheet,
  LockKeyhole,
  LogOut,
  AlertTriangle,
  Download,
  LoaderCircle,
  Settings2,
  History,
  RefreshCcw,
} from "lucide-react";
import type { Dataset, Validation, HistoryEntry } from "./types";
import { api, date, number } from "./data";
export default function Settings({
  dataset,
  refresh,
}: {
  dataset: Dataset;
  refresh: () => Promise<void>;
}) {
  const [csrf, setCsrf] = useState(""),
    [password, setPassword] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [pending, setPending] = useState<Validation | null>(null),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [checking, setChecking] = useState(true);
  const loadHistory = useCallback(async () => {
    const result = await api<{
      history: HistoryEntry[];
      pending: Validation | null;
    }>("/imports");
    setHistory(result.history);
    setPending(result.pending);
  }, []);
  useEffect(() => {
    let active = true;
    api<{ csrf: string }>("/session")
      .then((r) => {
        if (active) {
          setCsrf(r.csrf);
          void loadHistory().catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [loadHistory]);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setSuccess("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy("");
    }
  }
  const headers = { "X-CSRF-Token": csrf };
  return (
    <div className="settings">
      <section className="hero settings-hero">
        <div className="hero-copy">
          <span className="eyebrow">Administração</span>
          <h1>Configurações</h1>
          <p>Atualize a planilha que alimenta os indicadores.</p>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <Settings2 size={84} strokeWidth={1.4} />
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div className="icon-box">
            <FileSpreadsheet />
          </div>
          <div>
            <h2>Base de dados</h2>
            <p>Fonte atualmente em uso</p>
          </div>
          <span className="badge">Base ativa</span>
        </div>
        <dl className="metadata">
          <div>
            <dt>Arquivo</dt>
            <dd>{dataset.metadata.filename}</dd>
          </div>
          <div>
            <dt>Última atualização / importação</dt>
            <dd>{date(dataset.metadata.importedAt)}</dd>
          </div>
          <div>
            <dt>Indicadores reconhecidos</dt>
            <dd>{dataset.summary.indicators} de 16</dd>
          </div>
          <div>
            <dt>Registros processados</dt>
            <dd>{number(dataset.summary.records)}</dd>
          </div>
          <div>
            <dt>Tamanho do arquivo</dt>
            <dd>{number(dataset.metadata.size / 1024 / 1024)} MB</dd>
          </div>
          <div>
            <dt>Última tentativa</dt>
            <dd>{history[0]?.status ?? "Entre para consultar"}</dd>
          </div>
        </dl>
        <p className="muted small">
          A data refere-se à ativação no sistema. A fonte não informa uma data
          de revisão confiável.
        </p>
      </section>
      <div aria-live="polite">
        {error && (
          <div className="notice error" role="alert">
            <AlertTriangle />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="notice success">
            <CheckCircle2 />
            <span>{success}</span>
          </div>
        )}
        {busy && (
          <div className="notice">
            <LoaderCircle className="spin" />
            <span>{busy}</span>
          </div>
        )}
      </div>
      {checking ? (
        <p role="status">Verificando sessão…</p>
      ) : !csrf ? (
        <section className="panel login">
          <div className="login-icon">
            <LockKeyhole />
          </div>
          <h2>Acesso administrativo</h2>
          <p>Entre para importar uma nova base e consultar o histórico.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("Verificando acesso…", async () => {
                const r = await api<{ csrf: string }>("/login", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Requested-With": "fiems-dashboard",
                  },
                  body: JSON.stringify({ password }),
                });
                setCsrf(r.csrf);
                setPassword("");
                await loadHistory();
              });
            }}
          >
            <label htmlFor="password">Senha administrativa</label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="primary" disabled={!!busy}>
              Entrar
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="panel">
            <div className="section-heading">
              <div className="icon-box">
                <RefreshCcw />
              </div>
              <div>
                <h2>Atualizar planilha</h2>
                <p>
                  Valide o arquivo, revise os avisos e confirme a atualização.
                </p>
              </div>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() =>
                  void run("Encerrando sessão…", async () => {
                    await api("/logout", { method: "POST", headers });
                    setCsrf("");
                    setPending(null);
                  })
                }
              >
                <LogOut size={17} />
                Sair
              </button>
            </div>
            <ol className="steps">
              <li className={!pending ? "current" : "done"}>
                <b>1</b>
                Selecionar e validar
              </li>
              <li className={pending ? "current" : ""}>
                <b>2</b>
                Revisar
              </li>
              <li>
                <b>3</b>
                Confirmar
              </li>
            </ol>
            {!pending ? (
              <>
                <label className="upload-box" htmlFor="workbook">
                  <Upload />
                  <strong>{file?.name ?? "Selecionar planilha"}</strong>
                  <span>
                    {file ? "Clique para trocar o arquivo" : "Arquivo Excel .xlsx"}
                  </span>
                </label>
                <input
                  id="workbook"
                  className="file-input"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={!!busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setSuccess("");
                    setError("");
                  }}
                />
                <div className="actions">
                  <button
                    className="primary"
                    disabled={!file || !!busy}
                    onClick={() =>
                      void run(
                        "Validando estrutura e processando indicadores…",
                        async () => {
                          if (!file) return;
                          const r = await api<Validation>("/imports/validate", {
                            method: "POST",
                            headers: {
                              ...headers,
                              "Content-Type":
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                              "X-Filename": encodeURIComponent(file.name),
                            },
                            body: file,
                          });
                          setPending(r);
                          await loadHistory();
                        },
                      )
                    }
                  >
                    Validar planilha
                  </button>
                  <span className="muted small">
                    A base atual permanece ativa durante a validação.
                  </span>
                </div>
              </>
            ) : (
              <div className="validation">
                <div className="notice success">
                  <CheckCircle2 />
                  <strong>Apta para importação</strong>
                </div>
                <dl className="metadata">
                  <div>
                    <dt>Indicadores</dt>
                    <dd>{pending.summary.indicators} de 16</dd>
                  </div>
                  <div>
                    <dt>Registros</dt>
                    <dd>{number(pending.summary.records)}</dd>
                  </div>
                  <div>
                    <dt>Anos</dt>
                    <dd>{pending.summary.years.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Casas</dt>
                    <dd>{pending.summary.houses.join(", ")}</dd>
                  </div>
                  <div>
                    <dt>Valores ausentes</dt>
                    <dd>{number(pending.summary.missing)}</dd>
                  </div>
                </dl>
                <details open>
                  <summary>
                    Avisos da validação ({pending.warnings.length})
                  </summary>
                  <ul className="warnings">
                    {pending.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() =>
                      void run("Atualizando a base…", async () => {
                        await api(`/imports/${pending.ticket}/confirm`, {
                          method: "POST",
                          headers,
                        });
                        setPending(null);
                        setFile(null);
                        await refresh();
                        await loadHistory();
                        setSuccess(
                          "Base atualizada com sucesso. Os gráficos já utilizam os novos dados.",
                        );
                      })
                    }
                  >
                    Confirmar atualização da base
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void run("Cancelando…", async () => {
                        await api(`/imports/${pending.ticket}`, {
                          method: "DELETE",
                          headers,
                        });
                        setPending(null);
                        setFile(null);
                        await loadHistory();
                      })
                    }
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="section-heading">
              <div className="icon-box">
                <History />
              </div>
              <div>
                <h2>Histórico de importações</h2>
                <p>Importações recentes, incluindo rejeições</p>
              </div>
              <a className="text-button" href="/api/source">
                <Download size={17} />
                Baixar base ativa
              </a>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Arquivo</th>
                    <th>Status</th>
                    <th>Registros</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>{date(h.created)}</td>
                      <td>
                        {h.filename}
                        {h.message && (
                          <span className="history-message">{h.message}</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`status status-${
                            h.status === "Sucesso"
                              ? "ok"
                              : h.status === "Rejeitada"
                                ? "error"
                                : "neutral"
                          }`}
                        >
                          {h.status}
                        </span>
                      </td>
                      <td>{number(h.records)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
