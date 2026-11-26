import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarClock, Gauge, MailWarning, Radar as RadarIcon, Sparkles, Target, UserRoundCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { OpportunityCard, OpportunitySkeleton } from "../components/Opportunity";
import { Button, ButtonLink, EmptyState, Notice, Pagination, Select, Tabs } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatShortDate, plural } from "../lib/format";
import { useDocumentTitle, useTaxonomy } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { Opportunity, Page, RadarSummary, TimelineItem } from "../lib/types";

type View = "active" | "new" | "interested" | "preparing" | "submitted" | "won" | "ignored";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
}

function placeLanes(items: TimelineItem[], width: number) {
  // Range les offres sur 4 lignes au plus, sans chevauchement.
  const laneEnds: number[] = [];
  const placed: { item: TimelineItem; lane: number; start: number; end: number }[] = [];
  for (const item of [...items].sort((a, b) => a.days_left - b.days_left)) {
    const end = Math.min(item.days_left, width);
    const start = Math.max(0, end - item.prep_days);
    const lane = laneEnds.findIndex((e) => e <= start - 0.5);
    if (lane >= 0) {
      laneEnds[lane] = end;
      placed.push({ item, lane, start, end });
    } else if (laneEnds.length < 4) {
      laneEnds.push(end);
      placed.push({ item, lane: laneEnds.length - 1, start, end });
    }
  }
  return placed;
}

function Timeline({ items }: { items: TimelineItem[] }) {
  const weeks = 8;
  const width = weeks * 7;
  return (
    <div className="timeline card card-pad">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <span className="card-label">Météo des dates limites</span>
          <p className="small muted" style={{ marginTop: 4 }}>
            Tes offres suivies et les meilleures nouveautés, avec le temps de préparation estimé.
          </p>
        </div>
        <div className="legend-inline">
          <span>
            <i className="ok" /> faisable
          </span>
          <span>
            <i className="ko" /> serré
          </span>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="small muted" style={{ marginTop: 18 }}>
          Rien à l'horizon pour l'instant. Marque des offres « Intéressé » pour les voir ici.
        </p>
      ) : (
        <div className="timeline-track">
          <div className="timeline-weeks">
            {Array.from({ length: weeks }, (_, i) => {
              const d = new Date();
              d.setDate(d.getDate() + i * 7);
              return (
                <span key={i} style={{ left: `${(i / weeks) * 100}%` }}>
                  {i === 0 ? "Auj." : formatShortDate(d.toISOString())}
                </span>
              );
            })}
          </div>
          <div className="timeline-lanes">
            {placeLanes(items.slice(0, 16), width).map(({ item, lane, start, end }) => {
              return (
                <Link
                  key={item.id}
                  to={`/offre/${item.id}`}
                  className={clsx("timeline-item", item.feasible ? "ok" : "ko")}
                  style={{ left: `${(start / width) * 100}%`, width: `${Math.max(3, ((end - start) / width) * 100)}%`, top: `${lane * 30}px` }}
                  title={`${item.title} · ${formatDate(item.deadline)} · ${item.prep_days} j de préparation estimés`}
                >
                  <span>{item.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Radar() {
  useDocumentTitle("Mon radar");
  const { user } = useAuth();
  const { data: taxonomy } = useTaxonomy();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>("active");
  const [sort, setSort] = useState("score");
  const [sector, setSector] = useState("");
  const [page, setPage] = useState(1);
  const [welcomeUntil] = useState(() => (params.get("bienvenue") ? Date.now() + 25_000 : 0));

  useEffect(() => setPage(1), [view, sort, sector]);

  const summary = useQuery({
    queryKey: ["radar", "summary"],
    queryFn: () => api.get<RadarSummary>("/radar/summary"),
    refetchInterval: (q) => (Date.now() < welcomeUntil && !q.state.data?.active ? 2500 : false),
  });
  const list = useQuery({
    queryKey: ["radar", "list", view, sort, sector, page],
    queryFn: () => api.get<Page<Opportunity>>("/radar", { view, sort, sector, page }),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (Date.now() < welcomeUntil && !q.state.data?.total ? 2500 : false),
  });
  const timeline = useQuery({ queryKey: ["radar", "timeline"], queryFn: () => api.get<TimelineItem[]>("/radar/timeline") });

  const feedback = useMutation({
    mutationFn: ({ id, value }: { id: string; value: "relevant" | "not_relevant" }) => {
      const current = list.data?.items.find((o) => o.id === id)?.match?.feedback;
      return api.patch<Opportunity>(`/radar/${id}`, { feedback: current === value ? "none" : value });
    },
    onSuccess: (_, { value }) => {
      queryClient.invalidateQueries({ queryKey: ["radar"] });
      toast.show(value === "relevant" ? "Noté : plus d'offres comme celle-ci." : "Noté : l'offre est retirée de ta liste.");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const resend = useMutation({
    mutationFn: () => api.post<{ detail: string }>("/auth/resend-verification"),
    onSuccess: (r) => toast.show(r.detail),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const tabs = useMemo(() => {
    const counts = summary.data?.counts ?? {};
    return [
      { value: "active" as View, label: "Actives", count: summary.data?.active },
      { value: "new" as View, label: "À voir", count: counts.new ?? 0 },
      { value: "interested" as View, label: "Intéressé", count: counts.interested ?? 0 },
      { value: "preparing" as View, label: "En préparation", count: counts.preparing ?? 0 },
      { value: "submitted" as View, label: "Envoyé", count: counts.submitted ?? 0 },
      { value: "won" as View, label: "Gagné", count: counts.won ?? 0 },
      { value: "ignored" as View, label: "Ignoré", count: counts.ignored ?? 0 },
    ];
  }, [summary.data]);

  const firstName = user?.full_name?.split(" ")[0];
  const waiting = Date.now() < welcomeUntil && !list.data?.total;

  if (user && !user.has_profile) {
    return (
      <div className="page container">
        <div className="card">
          <EmptyState
            icon={<UserRoundCog />}
            title="Ton radar n'est pas encore réglé"
            action={<ButtonLink to="/bienvenue" variant="signal">Décrire mon activité</ButtonLink>}
          >
            Décris ton activité en quelques phrases : l'agent s'occupe du reste et t'affiche tes premières offres.
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="page radar-page">
      <div className="container">
        <div className="page-head">
          <div>
            <span className="eyebrow">{formatDate(new Date().toISOString(), { weekday: "long", year: undefined })}</span>
            <h1 className="page-title">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}. <span className="serif">Voici ton radar.</span>
            </h1>
          </div>
          <div className="row">
            <ButtonLink to="/reglages" variant="ghost" size="sm" icon={<UserRoundCog />}>
              Mon profil
            </ButtonLink>
            <ButtonLink to="/constellation" variant="soft" size="sm">
              Vue constellation
            </ButtonLink>
          </div>
        </div>

        {user && !user.is_verified && (
          <Notice tone="info" icon={<MailWarning />}>
            <span>
              Confirme ton adresse <strong>{user.email}</strong> pour recevoir tes alertes.{" "}
              <button type="button" className="link" onClick={() => resend.mutate()} disabled={resend.isPending}>
                Renvoyer l'e-mail
              </button>
            </span>
          </Notice>
        )}
        {params.get("bienvenue") && (
          <Notice tone="success" icon={<Sparkles />}>
            <span>
              Bienvenue ! L'agent compare ton profil aux offres ouvertes. Chaque matin, il cherchera les nouvelles pour toi.{" "}
              <button type="button" className="link" onClick={() => setParams({}, { replace: true })}>
                Fermer
              </button>
            </span>
          </Notice>
        )}

        <div className="kpis">
          <div className="kpi">
            <span className="kpi-icon tone-signal">
              <RadarIcon />
            </span>
            <strong className="tnum">{summary.data?.unseen ?? "–"}</strong>
            <span>offres pas encore vues</span>
          </div>
          <div className="kpi">
            <span className="kpi-icon tone-sun">
              <CalendarClock />
            </span>
            <strong className="tnum">{summary.data?.deadlines_this_week ?? "–"}</strong>
            <span>dates limites cette semaine</span>
          </div>
          <div className="kpi">
            <span className="kpi-icon tone-leaf">
              <Target />
            </span>
            <strong className="tnum">{summary.data?.best_score ?? "–"}</strong>
            <span>meilleur score actuel</span>
          </div>
          <div className="kpi">
            <span className="kpi-icon tone-ocean">
              <Gauge />
            </span>
            <strong className="tnum">{summary.data?.new_today ?? "–"}</strong>
            <span>nouvelles en 24 h</span>
          </div>
        </div>

        <Timeline items={timeline.data ?? []} />

        <div className="radar-toolbar">
          <Tabs tabs={tabs} value={view} onChange={setView} />
          <div className="row" style={{ gap: 10 }}>
            <Select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Secteur" className="sort-select">
              <option value="">Tous secteurs</option>
              {taxonomy?.sectors.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Trier" className="sort-select">
              <option value="score">Meilleur score</option>
              <option value="deadline">Date limite proche</option>
              <option value="recent">Plus récentes</option>
            </Select>
          </div>
        </div>

        <div className="opp-list" aria-busy={list.isFetching}>
          {(list.isLoading || waiting) && (
            <>
              {waiting && (
                <div className="scanning">
                  <span className="scanning-ring" /> L'agent analyse les offres ouvertes pour ton profil…
                </div>
              )}
              {Array.from({ length: 4 }, (_, i) => (
                <OpportunitySkeleton key={i} />
              ))}
            </>
          )}
          {!waiting &&
            list.data?.items.map((o) => (
              <OpportunityCard key={o.id} opportunity={o} onFeedback={(value) => feedback.mutate({ id: o.id, value })} />
            ))}
          {!waiting && list.data && list.data.items.length === 0 && (
            <div className="card">
              <EmptyState
                icon={<RadarIcon />}
                title={view === "active" ? "Pas encore d'offre pour ton profil" : "Rien dans cette catégorie"}
                action={
                  view === "active" ? (
                    <div className="row" style={{ justifyContent: "center" }}>
                      <ButtonLink to="/reglages" variant="ghost">
                        Élargir mon profil
                      </ButtonLink>
                      <ButtonLink to="/explorer">Explorer toutes les offres</ButtonLink>
                    </div>
                  ) : (
                    <Button variant="ghost" onClick={() => setView("active")}>
                      Voir les offres actives
                    </Button>
                  )
                }
              >
                {view === "active"
                  ? "L'agent cherche chaque matin. Ajoute des mots-clés ou des secteurs pour élargir la recherche."
                  : "Change le statut d'une offre depuis sa fiche pour la retrouver ici."}
              </EmptyState>
            </div>
          )}
        </div>
        {list.data && (
          <>
            <Pagination page={list.data.page} pages={list.data.pages} onChange={setPage} />
            {list.data.total > 0 && (
              <p className="tiny muted center" style={{ marginTop: 16 }}>
                {plural(list.data.total, "offre")} · Les avis « Pertinent » et « Pas pour moi » affinent ton tri.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
