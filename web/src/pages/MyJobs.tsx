import { useQuery } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { SubmissionList } from "../components/SubmissionList";
import { ButtonLink, EmptyState, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/hooks";
import type { JobSubmission } from "../lib/types";

export default function MyJobs() {
  useDocumentTitle("Mes offres");
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["submissions"], queryFn: () => api.get<JobSubmission[]>("/jobs/submissions/mine") });
  const items = query.data ?? [];
  const online = items.filter((s) => s.status === "approved");
  const reach = online.reduce((total, s) => total + s.candidates, 0);
  const pending = items.filter((s) => s.status === "pending").length;

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <div>
            <span className="eyebrow">Espace recruteur</span>
            <h1 className="page-title">
              Bonjour{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}. <span className="serif">Tes offres.</span>
            </h1>
            <p className="lead">
              Chaque offre est relue avant sa mise en ligne, puis proposée aux candidats dont le profil correspond.
            </p>
          </div>
          <ButtonLink to="/publier-une-offre" variant="signal" icon={<Plus />}>
            Publier une offre
          </ButtonLink>
        </div>

        <div className="kpis kpis-3" style={{ marginBottom: 24 }}>
          {[
            ["Offres en ligne", online.length],
            ["En attente de validation", pending],
            ["Candidats atteints", reach],
          ].map(([label, value]) => (
            <div key={label} className="kpi kpi-plain">
              <strong className="tnum">{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {query.isLoading ? (
          <Skeleton height={220} radius={24} />
        ) : items.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Megaphone />}
              title="Aucune offre pour l'instant"
              action={
                <ButtonLink to="/publier-une-offre" variant="signal" icon={<Plus />}>
                  Publier ma première offre
                </ButtonLink>
              }
            >
              C'est gratuit : décris le poste, Arah! le propose aux candidats qui correspondent.
            </EmptyState>
          </div>
        ) : (
          <SubmissionList items={items} />
        )}
      </div>
    </div>
  );
}
