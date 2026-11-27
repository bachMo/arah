import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Universe } from "../components/universe/Universe";
import "../components/universe/universe.css";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDocumentTitle } from "../lib/hooks";
import type { ConstellationData } from "../lib/types";

export default function UniversePage() {
  useDocumentTitle("Univers des opportunités");
  const { user } = useAuth();
  const navigate = useNavigate();
  const exit = () => navigate("/constellation");
  const query = useQuery({
    queryKey: ["constellation", user?.id],
    queryFn: () => api.get<ConstellationData>("/constellation"),
    staleTime: 120_000,
  });

  if (query.isPending) {
    return (
      <div className="universe universe-fallback" aria-busy>
        <div>
          <span className="u-eyebrow">
            <span className="u-live" /> Calcul de la trajectoire
          </span>
        </div>
      </div>
    );
  }

  if (query.isError || !query.data.nodes.length) {
    return (
      <div className="universe universe-fallback">
        <div>
          <h1>{query.isError ? "Impossible de charger l'univers." : "L'univers est encore vide."}</h1>
          <p>
            {query.isError
              ? "Le serveur ne répond pas pour le moment. Réessaie dans un instant."
              : "Aucune offre n'est encore publiée. Reviens après la prochaine veille."}
          </p>
          <button type="button" className="u-btn u-btn-primary" onClick={exit}>
            Revenir à la constellation
          </button>
        </div>
      </div>
    );
  }

  return <Universe data={query.data} sunName={query.data.personal ? "Toi" : "Arah!"} onExit={exit} />;
}
