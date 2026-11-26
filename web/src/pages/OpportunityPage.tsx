import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  Coins,
  ExternalLink,
  FileCheck2,
  FileText,
  HelpCircle,
  Link2,
  MapPin,
  ThumbsDown,
  ThumbsUp,
  Wand2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DeadlineBadge, KindBadge, OpportunityCard, ScoreRing, STATUS_LABELS } from "../components/Opportunity";
import { Button, ButtonLink, EmptyState, Skeleton } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { daysLeft, formatDate, formatMoney } from "../lib/format";
import { useDocumentTitle, useTaxonomy } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { MatchStatus, Opportunity, OpportunityDetail } from "../lib/types";

const STATUS_FLOW: MatchStatus[] = ["interested", "preparing", "submitted", "won", "lost"];

export default function OpportunityPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { labels } = useTaxonomy();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const query = useQuery({
    queryKey: ["opportunity", id, user?.id],
    queryFn: () => api.get<OpportunityDetail>(`/opportunities/${id}`),
  });
  const similar = useQuery({
    queryKey: ["similar", id],
    queryFn: () => api.get<Opportunity[]>(`/opportunities/${id}/similar`),
    enabled: query.isSuccess,
  });
  useDocumentTitle(query.data?.title ?? "Offre");

  const mutation = useMutation({
    mutationFn: (body: { status?: MatchStatus; feedback?: "relevant" | "not_relevant" | "none" }) =>
      api.patch<Opportunity>(`/radar/${id}`, body),
    onSuccess: (updated, body) => {
      queryClient.setQueryData<OpportunityDetail>(["opportunity", id, user?.id], (old) => (old ? { ...old, match: updated.match } : old));
      queryClient.invalidateQueries({ queryKey: ["radar"] });
      if (body.status) toast.show(`Statut : ${STATUS_LABELS[body.status]}`);
      else if (body.feedback === "relevant") toast.show("Noté. L'agent te proposera plus d'offres de ce genre.");
      else if (body.feedback === "not_relevant") toast.show("Noté. L'agent en tiendra compte.");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (query.isLoading) {
    return (
      <div className="page container">
        <Skeleton height={20} width={140} />
        <div style={{ height: 18 }} />
        <Skeleton height={56} width="80%" />
        <div style={{ height: 32 }} />
        <Skeleton height={360} radius={24} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="page container">
        <EmptyState
          title={notFound ? "Cette offre n'existe plus" : "Impossible de charger cette offre"}
          action={<ButtonLink to="/explorer">Voir les autres offres</ButtonLink>}
        >
          {notFound ? "Elle a peut-être été retirée par son émetteur." : errorMessage(query.error)}
        </EmptyState>
      </div>
    );
  }

  const o = query.data;
  const match = o.match;
  const remaining = daysLeft(o.deadline_at);
  const closed = remaining !== null && remaining < 0;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.show("Lien copié");
    } catch {
      toast.show("Copie impossible sur ce navigateur", "error");
    }
  };

  return (
    <div className="page">
      <div className="container">
        <button type="button" className="back-link" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/explorer"))}>
          <ArrowLeft /> Retour
        </button>

        <div className="detail-grid">
          <article className="detail-main">
            <div className="row" style={{ gap: 8 }}>
              <KindBadge kind={o.kind} />
              <DeadlineBadge deadline={o.deadline_at} />
              {o.is_demo && <span className="badge badge-outline">Donnée de démonstration</span>}
              {o.sectors.map((s) => (
                <span key={s} className="badge badge-outline">
                  {labels.sector[s] ?? s}
                </span>
              ))}
            </div>
            <h1 className="detail-title">{o.title}</h1>

            <dl className="facts">
              <div>
                <dt>
                  <Building2 /> Émetteur
                </dt>
                <dd>{o.issuer || "Non précisé"}</dd>
              </div>
              <div>
                <dt>
                  <MapPin /> Pays
                </dt>
                <dd>{o.country ? labels.country[o.country] ?? o.country : "Non précisé"}</dd>
              </div>
              <div>
                <dt>
                  <Coins /> Montant
                </dt>
                <dd>{formatMoney(o.budget_amount, o.budget_currency, o.budget_xof)}</dd>
              </div>
              <div>
                <dt>
                  <CalendarClock /> Date limite
                </dt>
                <dd>{o.deadline_at ? formatDate(o.deadline_at) : "Non précisée"}</dd>
              </div>
            </dl>

            <section className="detail-section">
              <h2>En bref</h2>
              <p className="detail-summary">{o.summary || "Résumé indisponible."}</p>
            </section>

            {o.documents_required.length > 0 && (
              <section className="detail-section">
                <h2>Pièces à fournir</h2>
                <ul className="doc-list">
                  {o.documents_required.map((d) => (
                    <li key={d}>
                      <FileCheck2 /> {d}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {o.eligibility.length > 0 && (
              <section className="detail-section">
                <h2>Conditions d'éligibilité</h2>
                <ul className="bullets">
                  {o.eligibility.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </section>
            )}

            {o.description && (
              <section className="detail-section">
                <h2>Texte de l'avis</h2>
                <div className={clsx("detail-description", expanded && "is-expanded")}>
                  <p>{o.description}</p>
                </div>
                {o.description.length > 700 && (
                  <button type="button" className="link small" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? "Réduire" : "Lire tout l'avis"}
                  </button>
                )}
              </section>
            )}

            <div className="source-line">
              <FileText />
              <span>
                Source : <strong>{o.source.name}</strong>
                {o.published_at && <> · publiée le {formatDate(o.published_at)}</>} · fiche préparée par{" "}
                {o.enrichment_method || "l'agent"}
              </span>
            </div>
            <p className="tiny muted" style={{ marginTop: 8 }}>
              Cette fiche est un résumé automatique. Vérifie toujours les conditions dans l'avis original avant de déposer.
            </p>
          </article>

          <aside className="detail-side">
            <div className="card card-pad side-card">
              {user && match ? (
                <>
                  <div className="side-score">
                    <ScoreRing score={match.score} size={84} stroke={7} />
                    <div>
                      <span className="card-label">Adéquation avec ton profil</span>
                      <p className="small muted" style={{ marginTop: 4 }}>
                        Calcul : {match.method}
                      </p>
                    </div>
                  </div>
                  <ul className="reasons">
                    {match.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                  {match.criteria.length > 0 && (
                    <div className="criteria">
                      {match.criteria.map((c) => (
                        <div key={c.label} className={clsx("criterion", c.met === true && "ok", c.met === false && "ko")}>
                          {c.met === true ? <Check /> : c.met === false ? <X /> : <HelpCircle />}
                          <span>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {match.risks.length > 0 && (
                    <div className="risks">
                      {match.risks.map((r) => (
                        <div key={r}>
                          <AlertTriangle /> {r}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : user ? (
                <div className="stack" style={{ ["--gap" as string]: "10px" }}>
                  <span className="card-label">Adéquation</span>
                  <p className="small muted">
                    Cette offre n'est pas dans ton radar. Marque-la « Intéressé » pour la suivre et obtenir son score.
                  </p>
                </div>
              ) : (
                <div className="stack" style={{ ["--gap" as string]: "12px" }}>
                  <span className="card-label">Est-ce pour toi ?</span>
                  <p className="small" style={{ color: "var(--ink-2)" }}>
                    Crée ton radar gratuit : l'agent calcule ton score d'adéquation, t'explique pourquoi et t'aide à
                    préparer la réponse.
                  </p>
                  <ButtonLink to="/inscription" variant="signal" className="btn-block">
                    Créer mon radar
                  </ButtonLink>
                  <ButtonLink to={`/connexion?suite=/offre/${o.id}`} variant="ghost" className="btn-block">
                    J'ai déjà un compte
                  </ButtonLink>
                </div>
              )}

              {user && (
                <>
                  <hr className="divider" style={{ margin: "20px 0" }} />
                  <span className="card-label">Où en es-tu ?</span>
                  <div className="status-picker">
                    {STATUS_FLOW.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="chip"
                        aria-pressed={match?.status === s}
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ status: s })}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  <div className="feedback-row">
                    <button
                      type="button"
                      className={clsx("feedback-btn", match?.feedback === "relevant" && "is-good")}
                      onClick={() => mutation.mutate({ feedback: match?.feedback === "relevant" ? "none" : "relevant" })}
                    >
                      <ThumbsUp /> Pertinent
                    </button>
                    <button
                      type="button"
                      className={clsx("feedback-btn", match?.feedback === "not_relevant" && "is-bad")}
                      onClick={() => mutation.mutate({ feedback: match?.feedback === "not_relevant" ? "none" : "not_relevant" })}
                    >
                      <ThumbsDown /> Pas pour moi
                    </button>
                  </div>
                  <ButtonLink
                    to={`/preparer/${o.id}`}
                    variant="signal"
                    className="btn-block"
                    icon={<Wand2 />}
                    style={{ marginTop: 16 }}
                    aria-disabled={closed}
                  >
                    {o.has_preparation ? "Reprendre ma préparation" : "Aide-moi à répondre"}
                  </ButtonLink>
                </>
              )}

              <div className="side-links">
                {o.url && (
                  <a className="btn btn-ghost btn-block" href={o.url} target="_blank" rel="noreferrer noopener">
                    <ExternalLink /> Voir l'avis original
                  </a>
                )}
                <Button variant="soft" block icon={<Link2 />} onClick={copyLink}>
                  Copier le lien
                </Button>
              </div>
            </div>
          </aside>
        </div>

        {similar.data && similar.data.length > 0 && (
          <section className="similar">
            <h2 className="section-subtitle">Offres similaires</h2>
            <div className="opp-list">
              {similar.data.map((s) => (
                <OpportunityCard key={s.id} opportunity={s} compact />
              ))}
            </div>
          </section>
        )}
        <p className="tiny muted" style={{ marginTop: 32 }}>
          Une erreur dans cette fiche ? <Link className="link" to="/a-propos">Signale-la</Link>.
        </p>
      </div>
    </div>
  );
}
