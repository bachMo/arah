import clsx from "clsx";
import { ArrowUpRight, BriefcaseBusiness, Building2, CalendarClock, Coins, Laptop, MapPin, ThumbsDown, ThumbsUp } from "lucide-react";
import { Link } from "react-router-dom";
import { deadlineLabel, formatMoney, formatShortDate, scoreTone } from "../lib/format";
import { useTaxonomy } from "../lib/hooks";
import type { Opportunity } from "../lib/types";

export function ScoreRing({ score, size = 56, stroke = 5 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone = scoreTone(score);
  return (
    <div className={clsx("score-ring", `score-${tone}`)} style={{ width: size, height: size }} title={`Adéquation : ${score}/100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="score-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="score-value"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="score-num tnum" style={{ fontSize: size * 0.32 }}>
        {score}
      </span>
      <span className="sr-only">Score d'adéquation {score} sur 100</span>
    </div>
  );
}

export function DeadlineBadge({ deadline, withDate = true }: { deadline: string | null; withDate?: boolean }) {
  const { label, tone } = deadlineLabel(deadline);
  const cls = { danger: "badge-signal", warn: "badge-sun", ok: "badge-leaf", none: "" }[tone];
  return (
    <span className={clsx("badge", cls)}>
      <CalendarClock />
      {label}
      {withDate && deadline && tone !== "none" && <span className="badge-sub">· {formatShortDate(deadline)}</span>}
    </span>
  );
}

const KIND_TONE: Record<string, string> = {
  tender: "badge-ocean",
  consultancy: "badge-plum",
  grant: "badge-leaf",
  competition: "badge-sun",
  program: "badge-signal",
  job: "badge-ink",
  other: "",
};

export function KindBadge({ kind }: { kind: string }) {
  const { labels } = useTaxonomy();
  return <span className={clsx("badge", KIND_TONE[kind])}>{labels.kind[kind] ?? kind}</span>;
}

/** Contrat et télétravail d'une offre d'emploi. */
export function JobBadges({ contract, remote }: { contract: string | null; remote: boolean }) {
  const { labels } = useTaxonomy();
  return (
    <>
      {contract && (
        <span className="badge badge-outline">
          <BriefcaseBusiness />
          {labels.contract[contract] ?? contract}
        </span>
      )}
      {remote && (
        <span className="badge badge-outline">
          <Laptop />
          Télétravail
        </span>
      )}
    </>
  );
}

/** Lieu d'une offre : la ville quand on la connaît, avec le pays. */
export function placeLabel(o: Pick<Opportunity, "location" | "country">, countries: Record<string, string>): string {
  const country = o.country ? countries[o.country] ?? o.country : "";
  if (o.location && country && !o.location.toLowerCase().includes(country.toLowerCase())) return `${o.location}, ${country}`;
  return o.location || country;
}

type CardProps = {
  opportunity: Opportunity;
  onFeedback?: (feedback: "relevant" | "not_relevant") => void;
  compact?: boolean;
};

export function OpportunityCard({ opportunity: o, onFeedback, compact }: CardProps) {
  const { labels } = useTaxonomy();
  const match = o.match;
  return (
    <article className={clsx("opp-card", compact && "opp-card-compact")}>
      <Link to={`/offre/${o.id}`} className="opp-card-link" aria-label={o.title} />
      <div className="opp-card-main">
        <div className="opp-card-top">
          <KindBadge kind={o.kind} />
          {o.kind === "job" && <JobBadges contract={o.contract_type} remote={o.remote} />}
          <DeadlineBadge deadline={o.deadline_at} />
          {o.is_demo && <span className="badge badge-outline">Démo</span>}
          {match?.status && match.status !== "new" && <StatusBadge status={match.status} />}
        </div>
        <h3 className="opp-card-title">{o.title}</h3>
        <div className="opp-card-meta">
          {o.issuer && (
            <span>
              <Building2 /> {o.issuer}
            </span>
          )}
          {(o.country || o.location) && (
            <span>
              <MapPin /> {placeLabel(o, labels.country)}
            </span>
          )}
          {o.kind === "job" ? (
            o.experience_level && (
              <span>
                <BriefcaseBusiness /> {labels.level[o.experience_level] ?? o.experience_level}
              </span>
            )
          ) : (
            <span>
              <Coins /> {formatMoney(o.budget_amount, o.budget_currency, o.budget_xof)}
            </span>
          )}
        </div>
        {!compact && match?.reasons?.length ? (
          <ul className="opp-card-reasons">
            {match.reasons.slice(0, 2).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : !compact && o.summary ? (
          <p className="opp-card-summary">{o.summary}</p>
        ) : null}
      </div>
      <div className="opp-card-side">
        {match ? <ScoreRing score={match.score} /> : <span className="opp-card-arrow"><ArrowUpRight /></span>}
        {onFeedback && match && (
          <div className="feedback">
            <button
              type="button"
              className={clsx("icon-btn", match.feedback === "relevant" && "is-on-good")}
              aria-label="Pertinent"
              title="Pertinent"
              onClick={() => onFeedback("relevant")}
            >
              <ThumbsUp />
            </button>
            <button
              type="button"
              className={clsx("icon-btn", match.feedback === "not_relevant" && "is-on-bad")}
              aria-label="Pas pour moi"
              title="Pas pour moi"
              onClick={() => onFeedback("not_relevant")}
            >
              <ThumbsDown />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export const STATUS_LABELS: Record<string, string> = {
  new: "À voir",
  interested: "Intéressé",
  preparing: "En préparation",
  submitted: "Envoyé",
  ignored: "Ignoré",
  won: "Gagné",
  lost: "Perdu",
};

const STATUS_TONE: Record<string, string> = {
  new: "",
  interested: "badge-ocean",
  preparing: "badge-sun",
  submitted: "badge-plum",
  ignored: "badge-outline",
  won: "badge-leaf",
  lost: "badge-signal",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx("badge", STATUS_TONE[status])}>
      <span className="dot" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function OpportunitySkeleton() {
  return (
    <div className="opp-card" aria-hidden>
      <div className="opp-card-main" style={{ gap: 12 }}>
        <div className="row">
          <div className="skeleton" style={{ width: 110, height: 26, borderRadius: 99 }} />
          <div className="skeleton" style={{ width: 90, height: 26, borderRadius: 99 }} />
        </div>
        <div className="skeleton" style={{ width: "85%", height: 22 }} />
        <div className="skeleton" style={{ width: "55%", height: 16 }} />
      </div>
      <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 99 }} />
    </div>
  );
}
