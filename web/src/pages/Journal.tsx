import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { BellRing, CircleAlert, Eye, Globe, ScanSearch, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ButtonLink, EmptyState, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { formatDate, formatNumber, formatTime, formatXof, relativeTime } from "../lib/format";
import { useDocumentTitle } from "../lib/hooks";
import type { AgentRun, Transparency } from "../lib/types";

const AGENT_META: Record<string, { icon: typeof Eye; tone: string }> = {
  Veilleur: { icon: ScanSearch, tone: "ocean" },
  Analyste: { icon: Eye, tone: "plum" },
  Suivi: { icon: BellRing, tone: "signal" },
};

const STATUS: Record<AgentRun["status"], { label: string; cls: string }> = {
  running: { label: "En cours", cls: "badge-ocean" },
  success: { label: "Terminée", cls: "badge-leaf" },
  partial: { label: "Partielle", cls: "badge-sun" },
  failed: { label: "Échec", cls: "badge-signal" },
};

const PURPOSE: Record<string, string> = {
  enrich: "Fiches résumées",
  match: "Scores affinés",
  profile: "Profils pré-remplis",
  write: "Brouillons de réponse",
};

function duration(run: AgentRun): string {
  if (!run.finished_at) return "en cours";
  const s = Math.max(1, Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
}

function RunLog({ run }: { run: AgentRun }) {
  return (
    <ol className="runlog">
      {run.steps.map((step, i) => {
        const meta = AGENT_META[step.agent] ?? AGENT_META.Veilleur;
        const Icon = step.level === "error" ? CircleAlert : step.level === "warning" ? TriangleAlert : meta.icon;
        return (
          <li key={i} className={clsx("runlog-step", `level-${step.level}`)} style={{ animationDelay: `${i * 60}ms` }}>
            <span className={clsx("runlog-icon", `tone-${meta.tone}`)}>
              <Icon />
            </span>
            <div>
              <div className="runlog-meta">
                <strong>{step.agent}</strong>
                <span className="mono">{formatTime(step.t)}</span>
              </div>
              <p>{step.message}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function Journal() {
  useDocumentTitle("Journal de l'agent");
  const query = useQuery({ queryKey: ["transparency"], queryFn: () => api.get<Transparency>("/transparency"), refetchInterval: 30_000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const data = query.data;
  const runs = data?.runs ?? [];
  const latestVeille = runs.find((r) => r.kind === "veille");
  const active = runs.find((r) => r.id === openId) ?? latestVeille ?? runs[0];

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <div>
            <span className="eyebrow">Transparence</span>
            <h1 className="page-title">
              Journal <span className="serif">de l'agent</span>
            </h1>
            <p className="lead">
              Ce que l'agent a fait, source par source : les offres trouvées, celles écartées et pourquoi, ce qu'il a coûté. Le journal
              est public et ne contient aucune donnée personnelle.
            </p>
          </div>
        </div>

        {query.isLoading && <Skeleton height={420} radius={24} />}
        {data && runs.length === 0 && (
          <div className="card">
            <EmptyState icon={<ScanSearch />} title="L'agent n'a pas encore tourné">
              La première veille démarre au prochain passage planifié (chaque matin à 6 h).
            </EmptyState>
          </div>
        )}

        {active && (
          <div className="journal-grid">
            <section className="card card-pad journal-main">
              <div className="journal-head">
                <div>
                  <span className="card-label">{active.kind === "veille" ? "Veille" : "Rappels"} du {formatDate(active.started_at, { weekday: "long", year: undefined })}</span>
                  <h2 className="section-subtitle" style={{ marginTop: 8 }}>
                    {active.kind === "veille" ? (
                      <>
                        {formatNumber(active.stats.new_opportunities ?? 0)} nouvelles offres,{" "}
                        <span className="serif accent">{formatNumber(active.stats.matches ?? 0)} correspondances</span>
                      </>
                    ) : (
                      <>{formatNumber(active.stats.reminders ?? 0)} rappels envoyés</>
                    )}
                  </h2>
                </div>
                <span className={clsx("badge", STATUS[active.status].cls)}>
                  <span className="dot" /> {STATUS[active.status].label}
                </span>
              </div>
              <div className="run-stats">
                <span>
                  Démarrée à <strong>{formatTime(active.started_at)}</strong>
                </span>
                <span>
                  Durée <strong>{duration(active)}</strong>
                </span>
                {active.stats.sources !== undefined && (
                  <span>
                    <strong>{active.stats.sources}</strong> sources
                  </span>
                )}
                {active.stats.discarded !== undefined && (
                  <span>
                    <strong>{active.stats.discarded}</strong> écartées
                  </span>
                )}
                <span>
                  Coût IA <strong>{active.cost_xof ? formatXof(active.cost_xof, { short: false }) : "0 F CFA"}</strong>
                </span>
              </div>
              <RunLog run={active} />
            </section>

            <aside className="stack" style={{ ["--gap" as string]: "20px" }}>
              <section className="card card-pad">
                <span className="card-label">Exécutions récentes</span>
                <ul className="run-list">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <button type="button" className={clsx(r.id === active.id && "is-active")} onClick={() => setOpenId(r.id)}>
                        <span className={clsx("run-dot", r.status)} />
                        <span>
                          <strong>{r.kind === "veille" ? "Veille" : "Rappels"}</strong>
                          <em>{relativeTime(r.started_at)}</em>
                        </span>
                        <span className="muted tiny tnum">{r.kind === "veille" ? `+${r.stats.new_opportunities ?? 0}` : r.stats.reminders ?? 0}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="card card-pad">
                <span className="card-label">Sources suivies</span>
                <ul className="source-list">
                  {data?.sources.map((s) => (
                    <li key={s.slug}>
                      <span className={clsx("source-status", s.last_status === "ok" ? "ok" : s.last_status === "error" ? "ko" : "idle")} />
                      <div>
                        <strong>{s.name}</strong>
                        <span className="tiny muted">
                          {s.last_status === "error" ? "Injoignable au dernier passage" : `${s.last_found} offres lues`} · {relativeTime(s.last_run_at)}
                        </span>
                      </div>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noreferrer" aria-label={`Site de ${s.name}`} className="icon-btn subtle">
                          <Globe />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="tiny muted" style={{ marginTop: 12 }}>
                  Une source manque ? Chaque source est un module indépendant : tout le monde peut en proposer une sur GitHub.
                </p>
              </section>

              {data && data.llm_usage.length > 0 && (
                <section className="card card-pad">
                  <span className="card-label">Utilisation de l'IA ce mois-ci</span>
                  <ul className="usage-list">
                    {data.llm_usage.map((u) => (
                      <li key={u.purpose}>
                        <span>{PURPOSE[u.purpose] ?? u.purpose}</span>
                        <span className="tnum muted">{formatNumber(u.calls)} appels</span>
                        <strong className="tnum">{formatXof(u.cost_xof, { short: false }).replace("Montant non précisé", "0 F CFA")}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <ButtonLink to="/soutenir" variant="ghost">
                Voir les coûts et les dons du mois
              </ButtonLink>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
