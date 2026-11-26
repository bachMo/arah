import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, MousePointer2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Constellation3D, URGENCY_COLORS } from "../components/Constellation3D";
import { ScoreRing } from "../components/Opportunity";
import { ButtonLink, EmptyState, Select } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { deadlineLabel } from "../lib/format";
import { useDocumentTitle, useMediaQuery, useTaxonomy } from "../lib/hooks";
import type { ConstellationData, StarNode } from "../lib/types";

const URGENCY_LABELS: Record<StarNode["urgency"], string> = {
  high: "Moins de 7 jours",
  medium: "8 à 21 jours",
  low: "Plus de 3 semaines",
  none: "Sans date limite",
};

function Flat({ data, onSelect, dimmed }: { data: ConstellationData; onSelect: (n: StarNode) => void; dimmed: (n: StarNode) => boolean }) {
  const extent = Math.max(1, ...data.nodes.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y))));
  return (
    <svg className="constellation-flat" viewBox="-110 -110 220 220" role="img" aria-label="Carte des offres">
      {[30, 60, 90].map((r) => (
        <circle key={r} r={r} className="flat-ring" />
      ))}
      {data.nodes.map((n) => (
        <circle
          key={n.id}
          cx={(n.x / extent) * 100}
          cy={(-n.y / extent) * 100}
          r={2.6 + n.size * 3.4}
          fill={URGENCY_COLORS[n.urgency]}
          opacity={dimmed(n) ? 0.15 : 0.9}
          onClick={() => onSelect(n)}
          style={{ cursor: "pointer" }}
        />
      ))}
      <circle r="4" fill="#15130f" />
    </svg>
  );
}

export default function ConstellationPage() {
  useDocumentTitle("Constellation des offres");
  const { user } = useAuth();
  const { data: taxonomy, labels } = useTaxonomy();
  const small = useMediaQuery("(max-width: 720px)");
  const [selected, setSelected] = useState<StarNode | null>(null);
  const [sector, setSector] = useState("");
  const [urgency, setUrgency] = useState<StarNode["urgency"] | "">("");

  const query = useQuery({
    queryKey: ["constellation", user?.id],
    queryFn: () => api.get<ConstellationData>("/constellation"),
    staleTime: 120_000,
  });

  const dimmed = useCallback(
    (n: StarNode) => Boolean((sector && n.sector !== sector) || (urgency && n.urgency !== urgency)),
    [sector, urgency],
  );
  const visible = useMemo(() => (query.data ? query.data.nodes.filter((n) => !dimmed(n)).length : 0), [query.data, dimmed]);

  return (
    <div className="constellation-page">
      <div className="constellation-stage">
        {query.data && query.data.nodes.length > 0 ? (
          small ? (
            <Flat data={query.data} onSelect={setSelected} dimmed={dimmed} />
          ) : (
            <Constellation3D data={query.data} onSelect={setSelected} dimmed={dimmed} />
          )
        ) : query.isLoading ? (
          <div className="constellation-loading">
            <span className="scanning-ring" /> Calcul de la constellation…
          </div>
        ) : (
          <EmptyState title="Pas encore assez d'offres">L'agent n'a pas encore collecté assez d'offres pour dessiner la constellation.</EmptyState>
        )}

        <div className="constellation-overlay container">
          <div className="constellation-head">
            <span className="eyebrow">Explorer autrement</span>
            <h1>
              La constellation <span className="serif">des opportunités</span>
            </h1>
            <p className="muted small">
              Chaque étoile est une offre. Les offres proches se ressemblent ; la taille donne le montant, la couleur l'urgence.
              {query.data?.personal
                ? " Plus une étoile est proche du centre, plus elle correspond à ton profil."
                : " Connecte-toi pour placer ton profil au centre."}
            </p>
            {!small && (
              <p className="tiny muted hint-line">
                <MousePointer2 size={13} /> Glisse pour tourner · molette pour zoomer · clique sur une étoile
              </p>
            )}
          </div>
          <div className="constellation-controls">
            <Select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Secteur">
              <option value="">Tous les secteurs</option>
              {taxonomy?.sectors.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <div className="urgency-legend">
              {(Object.keys(URGENCY_LABELS) as StarNode["urgency"][]).map((u) => (
                <button key={u} type="button" aria-pressed={urgency === u} onClick={() => setUrgency(urgency === u ? "" : u)}>
                  <i style={{ background: URGENCY_COLORS[u] }} />
                  {URGENCY_LABELS[u]}
                </button>
              ))}
            </div>
            {query.data && (
              <span className="tiny muted">
                {visible} étoile{visible > 1 ? "s" : ""} sur {query.data.nodes.length}
              </span>
            )}
            {!user && (
              <ButtonLink to="/inscription" size="sm" variant="signal">
                Me placer au centre
              </ButtonLink>
            )}
          </div>
        </div>

        {selected && (
          <aside className="star-panel card" aria-live="polite">
            <button type="button" className="icon-btn star-close" aria-label="Fermer" onClick={() => setSelected(null)}>
              <X />
            </button>
            <span className="star-panel-meta" style={{ color: URGENCY_COLORS[selected.urgency] }}>
              ● {deadlineLabel(selected.deadline).label}
              {selected.sector && ` · ${labels.sector[selected.sector] ?? selected.sector}`}
            </span>
            <h2>{selected.title}</h2>
            <p className="small muted">{selected.issuer}</p>
            {selected.score != null && (
              <div className="row" style={{ marginTop: 14 }}>
                <ScoreRing score={selected.score} size={52} />
                <span className="small">d'adéquation avec ton profil</span>
              </div>
            )}
            <Link to={`/offre/${selected.id}`} className="btn btn-block" style={{ marginTop: 18 }}>
              Voir la fiche <ArrowUpRight />
            </Link>
          </aside>
        )}
      </div>
    </div>
  );
}
