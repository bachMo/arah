import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Mail, MapPin, X } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "../lib/api";
import { formatDate } from "../lib/format";
import { useTaxonomy } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { JobSubmission } from "../lib/types";
import { Button, Textarea } from "./ui";

/** File de validation des offres d'emploi proposées par les recruteurs. */
export function SubmissionQueue() {
  const query = useQuery({ queryKey: ["admin", "submissions"], queryFn: () => api.get<JobSubmission[]>("/admin/submissions") });
  const items = query.data ?? [];
  return (
    <section className="card card-pad" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
        <h2 className="card-title">Offres d'emploi à valider</h2>
        <span className={`badge ${items.length ? "badge-sun" : "badge-outline"}`}>{items.length} en attente</span>
      </div>
      {items.length === 0 ? (
        <p className="small muted" style={{ marginTop: 10 }}>
          Aucune offre en attente. Les recruteurs proposent leurs offres depuis la page « Publier une offre ».
        </p>
      ) : (
        <ul className="review-list">
          {items.map((s) => (
            <ReviewItem key={s.id} submission={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewItem({ submission: s }: { submission: JobSubmission }) {
  const { labels } = useTaxonomy();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const review = useMutation({
    mutationFn: (decision: "approve" | "reject") => api.post<JobSubmission>(`/admin/submissions/${s.id}`, { decision, note }),
    onSuccess: (r) => {
      toast.show(r.status === "approved" ? "Offre publiée" : "Offre refusée");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  return (
    <li className="review-item">
      <div className="review-head">
        <div>
          <strong>{s.title}</strong>
          <span className="small muted">
            {s.company} · {labels.contract[s.contract_type] ?? s.contract_type}
            {s.experience_level ? ` · ${labels.level[s.experience_level] ?? s.experience_level}` : ""} · reçue le {formatDate(s.created_at)}
          </span>
          <span className="small muted review-meta">
            <MapPin /> {[s.location, labels.country[s.country] ?? s.country].filter(Boolean).join(", ")}
            {s.remote ? " · télétravail possible" : ""}
            {s.deadline_at ? ` · jusqu'au ${formatDate(s.deadline_at)}` : ""}
          </span>
        </div>
      </div>
      <p className={`review-desc ${open ? "is-open" : ""}`}>{s.description}</p>
      <button type="button" className="link small" onClick={() => setOpen((v) => !v)}>
        {open ? "Réduire" : "Lire toute l'offre"}
      </button>
      <div className="review-apply small">
        {s.apply_url && (
          <a className="link" href={s.apply_url} target="_blank" rel="noreferrer noopener">
            <ExternalLink /> {s.apply_url}
          </a>
        )}
        {s.apply_email && (
          <span>
            <Mail /> {s.apply_email}
          </span>
        )}
      </div>
      {rejecting && (
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Motif envoyé au recruteur (facultatif) : offre incomplète, frais demandés aux candidats…"
          aria-label="Motif du refus"
        />
      )}
      <div className="review-actions">
        {rejecting ? (
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Annuler
            </Button>
            <Button variant="soft" icon={<X />} loading={review.isPending} onClick={() => review.mutate("reject")}>
              Confirmer le refus
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" icon={<X />} onClick={() => setRejecting(true)}>
              Refuser
            </Button>
            <Button variant="signal" icon={<Check />} loading={review.isPending} onClick={() => review.mutate("approve")}>
              Publier
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
