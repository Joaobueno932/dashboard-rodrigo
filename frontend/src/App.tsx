import { useCallback, useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  Settings as SettingsIcon,
  ArrowUpRight,
  ArrowLeft,
  Home,
  ChevronRight,
  Database,
  Menu,
  RefreshCw,
  CalendarRange,
  Layers,
  Building2,
  Rows3,
} from "lucide-react";
import { dimensions } from "./catalog";
import { api, choices, initialYear, number } from "./data";
import type { Dataset, Indicator } from "./types";
import IndicatorChart from "./IndicatorChart";
import Settings from "./Settings";
import { BrandShapes, Logo } from "./Brand";

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function navigate(to: string) {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }
  return { path, navigate };
}
function Topic({
  indicators,
  governance,
  title,
  dimension,
}: {
  indicators: Indicator[];
  governance: boolean;
  title: string;
  dimension: string;
}) {
  const [year, setYear] = useState(() => initialYear(indicators)),
    [house, setHouse] = useState("all");
  const options = choices(indicators);
  return (
    <>
      <div className="topic-hero">
        <div className="topic-hero-copy">
          <div className="breadcrumb">
            Indicadores
            <ChevronRight size={14} />
            {dimension}
            <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          <h1>{title}</h1>
          <p>
            {house === "all" ? "Todas as Casas" : house}
            <span className="separator">/</span>
            {year === "all" ? "Série histórica" : year}
            <span className="separator">/</span>
            {indicators.length}{" "}
            {indicators.length === 1 ? "indicador" : "indicadores"}
          </p>
        </div>
        <div className="filters">
          {!governance && (
            <label>
              <span>Casa</span>
              <select
                aria-label="Casa"
                value={house}
                onChange={(e) => setHouse(e.target.value)}
              >
                <option value="all">Todas</option>
                {options.houses.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>Ano</span>
            <select
              aria-label="Ano"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="all">Todos os anos</option>
              {options.years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className={`chart-grid count-${indicators.length}`}>
        {indicators.map((i) => (
          <IndicatorChart
            key={i.code}
            indicator={i}
            house={house}
            year={year}
          />
        ))}
      </div>
    </>
  );
}
export default function App() {
  const { path, navigate } = useRoute();
  const [dataset, setDataset] = useState<Dataset | null>(null),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false);
  const refresh = useCallback(async () => {
    const data = await api<Dataset>("/data");
    setDataset(data);
    setError("");
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
    const timer = window.setInterval(() => {
      void refresh().catch(() => {});
    }, 60000);
    const focus = () => {
      void refresh().catch(() => {});
    };
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  useEffect(() => {
    setMobile(false);
    document.getElementById("main")?.focus();
  }, [path]);
  const segments = path.split("/").filter(Boolean),
    dim = dimensions.find((d) => d.id === segments[0]),
    topic = dim?.topics.find((t) => t.id === segments[1]);
  const settings = path === "/configuracoes";
  const Link = ({
    to,
    children,
    className = "",
    ...props
  }: {
    to: string;
    children: ReactNode;
    className?: string;
    "aria-current"?: "page";
  }) => (
    <a
      href={to}
      className={className}
      {...props}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
          e.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
  const hasSidebar = !!topic;
  return (
    <div className={`app theme-${dim?.color ?? "brand"}`}>
      <a className="skip-link" href="#main">
        Pular para conteúdo
      </a>
      <header className="topbar">
        <Link to="/" className="brand">
          <Logo className="brand-logo" />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-product">
            <small>Painel de</small>
            <span>
              Indicadores <strong>ESG</strong>
            </span>
          </span>
        </Link>
        <div className="header-tools">
          <span className="header-label">Sustentabilidade em dados</span>
          <Link
            to="/configuracoes"
            className={`settings-link ${settings ? "selected" : ""}`}
          >
            <SettingsIcon size={18} />
            <span>Configurações</span>
          </Link>
        </div>
      </header>
      <div className="brand-stripe" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className={`workspace ${hasSidebar ? "with-sidebar" : ""}`}>
        {hasSidebar && dim && (
          <>
            <button
              className="mobile-menu secondary"
              onClick={() => setMobile(!mobile)}
              aria-expanded={mobile}
            >
              <Menu size={18} />
              Navegação
            </button>
            <aside className={`sidebar ${mobile ? "open" : ""}`}>
              <Link to="/" className="home-link">
                <Home size={17} />
                Início
              </Link>
              <div className="sidebar-label">Dimensão</div>
              <Link to={`/${dim.id}`} className="dimension-label">
                <span className="dimension-label-icon">
                  <dim.icon size={19} />
                </span>
                {dim.title}
              </Link>
              <div className="sidebar-label">Temas</div>
              <nav aria-label={`Temas de ${dim.title}`}>
                {dim.topics.map((t) => (
                  <Link
                    key={t.id}
                    to={`/${dim.id}/${t.id}`}
                    className={topic.id === t.id ? "active" : ""}
                    aria-current={topic.id === t.id ? "page" : undefined}
                  >
                    <t.icon size={18} />
                    <span>{t.title}</span>
                    {topic.id === t.id && <ChevronRight size={15} />}
                  </Link>
                ))}
              </nav>
              <div className="sidebar-bottom">
                <BrandShapes className="sidebar-shapes" />
                <p>
                  Ambiental. Social.
                  <br />
                  Governança.
                </p>
              </div>
            </aside>
          </>
        )}
        <main
          id="main"
          tabIndex={-1}
          className={hasSidebar ? "content" : "content centered"}
        >
          {error ? (
            <div className="empty panel" role="alert">
              <h1>Não foi possível carregar os dados</h1>
              <p>{error}</p>
              <button
                className="primary"
                onClick={() => void refresh().catch((e) => setError(String(e)))}
              >
                <RefreshCw size={17} />
                Tentar novamente
              </button>
            </div>
          ) : !dataset ? (
            <div className="empty" role="status">
              <RefreshCw className="spin" />
              <p>Carregando indicadores…</p>
            </div>
          ) : settings ? (
            <>
              <Link to="/" className="back-link">
                <ArrowLeft size={17} />
                Início
              </Link>
              <Settings dataset={dataset} refresh={refresh} />
            </>
          ) : topic && dim ? (
            <Topic
              key={`${path}:${dataset.version}`}
              indicators={topic.codes
                .map((c) => dataset.indicators.find((i) => i.code === c))
                .filter((i): i is Indicator => !!i)}
              governance={dim.id === "governanca"}
              title={topic.title}
              dimension={dim.title}
            />
          ) : dim && segments.length === 1 ? (
            <>
              <section className="hero dimension-hero">
                <div className="hero-copy">
                  <Link to="/" className="back-link">
                    <ArrowLeft size={17} />
                    Início
                  </Link>
                  <span className="eyebrow">
                    Dimensão 0{dimensions.indexOf(dim) + 1}
                  </span>
                  <h1>{dim.title}</h1>
                  <p>{dim.description}</p>
                </div>
                <div className="hero-mark" aria-hidden="true">
                  <dim.icon size={88} strokeWidth={1.4} />
                </div>
              </section>
              <div className="section-title">
                <h2>Temas</h2>
                <span>
                  {dim.topics.length} temas ·{" "}
                  {dim.topics.reduce((n, t) => n + t.codes.length, 0)}{" "}
                  indicadores
                </span>
              </div>
              <div className={`topic-grid topics-${dim.topics.length}`}>
                {dim.topics.map((t, index) => (
                  <Link
                    to={`/${dim.id}/${t.id}`}
                    key={t.id}
                    className="topic-card"
                  >
                    <div className="topic-top">
                      <div className="icon-box">
                        <t.icon size={26} />
                      </div>
                      <span className="topic-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h2>{t.title}</h2>
                    <div className="topic-foot">
                      <span>
                        {t.codes.length}{" "}
                        {t.codes.length === 1 ? "indicador" : "indicadores"}
                      </span>
                      <ArrowUpRight size={20} />
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : path === "/" ? (
            <div className="home">
              <section className="hero home-hero">
                <div className="hero-copy">
                  <span className="eyebrow">
                    Sistema FIEMS · Sustentabilidade
                  </span>
                  <h1>
                    Indicadores <em>ESG</em>
                  </h1>
                  <p>
                    Resultados ambientais, sociais e de governança do Sistema
                    FIEMS. Explore os resultados de cada dimensão.
                  </p>
                </div>
                <BrandShapes className="hero-shapes" />
              </section>
              <dl className="kpis">
                <div>
                  <dt>
                    <CalendarRange size={16} />
                    Período da base
                  </dt>
                  <dd>
                    {dataset.summary.years[0]}–{dataset.summary.years.at(-1)}
                  </dd>
                </div>
                <div>
                  <dt>
                    <Layers size={16} />
                    Indicadores
                  </dt>
                  <dd>{dataset.summary.indicators}</dd>
                </div>
                <div>
                  <dt>
                    <Rows3 size={16} />
                    Registros
                  </dt>
                  <dd>{number(dataset.summary.records)}</dd>
                </div>
                <div>
                  <dt>
                    <Building2 size={16} />
                    Casas
                  </dt>
                  <dd>{dataset.summary.houses.length}</dd>
                </div>
              </dl>
              <div className="section-title">
                <h2>Dimensões</h2>
                <span>Selecione para ver os temas</span>
              </div>
              <div className="dimension-list">
                {dimensions.map((d, index) => (
                  <Link
                    to={`/${d.id}`}
                    key={d.id}
                    className={`dimension-card theme-${d.color}`}
                  >
                    <span className="dimension-number">0{index + 1}.</span>
                    <div className="dimension-icon">
                      <d.icon size={30} />
                    </div>
                    <div className="dimension-copy">
                      <h2>{d.title}</h2>
                      <p>{d.description}</p>
                    </div>
                    <span className="dimension-count">
                      <b>{d.topics.length}</b> temas
                    </span>
                    <span className="arrow-box">
                      <ArrowUpRight size={22} />
                    </span>
                  </Link>
                ))}
              </div>
              <div className="source-line">
                <Database size={16} />
                <span>
                  Base disponível: {dataset.summary.years[0]}–
                  {dataset.summary.years.at(-1)}
                  <span className="separator">·</span>
                  {dataset.summary.indicators} indicadores
                </span>
              </div>
            </div>
          ) : (
            <div className="empty">
              <h1>Página não encontrada</h1>
              <Link to="/" className="primary">
                Voltar ao início
              </Link>
            </div>
          )}
        </main>
      </div>
      <footer>
        <Logo className="footer-logo" />
        <span>Indicadores de sustentabilidade · Sistema FIEMS</span>
      </footer>
    </div>
  );
}
