import { CheckCircle2, Clock3, Users, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, plural } from "../lib/format";
import { useTaxonomy } from "../lib/hooks";
import type { JobSubmission } from "../lib/types";

const STATUS: Record<JobSubmission["status"], { label: string; icon: typeof Clock3; tone: string }> = {
  pending: { label: "En attente de validation", icon: Clock3, tone: "badge-sun" },
  approved: { label: "En ligne", icon: CheckCircle2, tone: "badge-leaf" },
  rejected: { label: "Non publiée", icon: XCircle, tone: "badge-signal" },
};

/** Offres proposées par un recruteur, avec leur statut et le nombre de candidats à qui elles ont été proposées. */
export function SubmissionList({ items }: { items: JobSubmission[] }) {
  const { labels } = useTaxonomy();
  return (
    <ul className="submission-list">
      {items.map((s) => {
        const status = STATUS[s.status];
        const Icon = status.icon;
        return (
          <li key={s.id} className="card submission-item">
            <div>
              <strong>{s.title}</strong>
              <span className="small muted">
                {s.company} · {labels.contract[s.contract_type] ?? s.contract_type} · proposée le {formatDate(s.created_at)}
              </span>
              {s.status === "approved" && (
                <span className="small submission-reach">
                  <Users /> Proposée à {plural(s.candidates, "candidat")}
                </span>
              )}
              {s.status === "rejected" && s.review_note && <span className="small">Motif : {s.review_note}</span>}
            </div>
            <div className="submission-side">
              <span className={`badge ${status.tone}`}>
                <Icon />
                {status.label}
              </span>
              {s.opportunity_id && (
                <Link className="link small" to={`/offre/${s.opportunity_id}`}>
                  Voir l'offre
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
