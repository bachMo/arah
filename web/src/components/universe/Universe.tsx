import clsx from "clsx";
import { ArrowUpRight, BookOpen, Compass, Home, LocateFixed, Navigation, Orbit, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { deadlineLabel } from "../../lib/format";
import { useTaxonomy } from "../../lib/hooks";
import type { ConstellationData } from "../../lib/types";
import { URGENCY_COLORS } from "../Constellation3D";
import { ScoreRing } from "../Opportunity";
import { createUniverse, type Destination, type Readouts, type TargetInfo, type UniverseEngine } from "./engine";
import { Hyperspace, type HyperspaceHandle } from "./Hyperspace";
import { PLANET_LABELS, type PlanetType } from "./textures";
import "./universe.css";

const PLANET_LEGEND: [PlanetType, string, string][] = [
  ["habitable", "Planète habitable", "Offre d'emploi"],
  ["gas", "Géante gazeuse à anneaux", "Financement, subvention"],
  ["rocky", "Planète tellurique", "Appel d'offres"],
  ["ice", "Planète de glace", "Manifestation d'intérêt"],
  ["lava", "Planète de lave", "Concours, prix"],
  ["ocean", "Planète océan", "Programme, incubation"],
  ["moon", "Lune", "Autre opportunité"],
];

const PLANET_SWATCH: Record<PlanetType, string> = {
  habitable: "radial-gradient(circle at 35% 35%, #8fd48a, #2f7a46 45%, #123e6e 75%)",
  gas: "radial-gradient(circle at 35% 35%, #f6deb0, #c98a55 55%, #7a4a2e)",
  rocky: "radial-gradient(circle at 35% 35%, #e0b07a, #8a5a35 60%, #3a281c)",
  ice: "radial-gradient(circle at 35% 35%, #ffffff, #b6d3e8 55%, #5e7f9e)",
  lava: "radial-gradient(circle at 35% 35%, #ffb03b, #a8300e 45%, #1a0b08)",
  ocean: "radial-gradient(circle at 35% 35%, #7fd0f0, #1d6ba4 55%, #0a2442)",
  moon: "radial-gradient(circle at 35% 35%, #e0e0e3, #8a8a90 60%, #3d3d42)",
};

const URGENCY_LEGEND: [keyof typeof URGENCY_COLORS, string][] = [
  ["high", "Moins de 7 jours"],
  ["medium", "8 à 21 jours"],
  ["low", "Plus de 3 semaines"],
  ["none", "Sans date limite"],
];

const formatUa = (value: number) => `${value < 10 ? value.toFixed(1) : Math.round(value)} ua`.replace(".", ",");

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

type Props = {
  data: ConstellationData;
  sunName: string;
  onExit: () => void;
};

export function Universe({ data, sunName, onExit }: Props) {
  const { labels } = useTaxonomy();
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const hyperRef = useRef<HyperspaceHandle>(null);
  const engineRef = useRef<UniverseEngine | null>(null);
  const [supported] = useState(canUseWebGL);
  const [destinations, setDestinations] = useState<{ home: Destination[]; galaxies: Destination[] }>({ home: [], galaxies: [] });
  const [aim, setAim] = useState<TargetInfo | null>(null);
  const [selected, setSelected] = useState<TargetInfo | null>(null);
  const [readouts, setReadouts] = useState<Readouts | null>(null);
  const [legend, setLegend] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [arrived, setArrived] = useState(false);
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    const layer = labelsRef.current;
    if (!mount || !layer || !supported) return;
    let engine: UniverseEngine;
    try {
      engine = createUniverse(
        mount,
        layer,
        data,
        {
          onAim: setAim,
          onSelect: setSelected,
          onReadouts: setReadouts,
          onWarp: (intensity, duration) => hyperRef.current?.jump(intensity, duration),
        },
        { reducedMotion, sunName },
      );
    } catch {
      return;
    }
    engineRef.current = engine;
    setDestinations(engine.destinations);
    const timer = window.setTimeout(() => setArrived(true), reducedMotion ? 0 : 3000);
    return () => {
      window.clearTimeout(timer);
      engine.dispose();
      engineRef.current = null;
    };
  }, [data, reducedMotion, sunName, supported]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (legend) setLegend(false);
      else if (sheet) setSheet(false);
      else if (selected) engineRef.current?.deselect();
      else onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [legend, sheet, selected, onExit]);

  const go = (id: string) => {
    engineRef.current?.flyTo(id);
    setSheet(false);
  };

  if (!supported) {
    return (
      <div className="universe universe-fallback">
        <div>
          <h1>Ton appareil ne peut pas afficher l'univers en 3D.</h1>
          <p>Le mode 3D demande WebGL, désactivé ou indisponible ici. La constellation reste accessible.</p>
          <button type="button" className="u-btn u-btn-primary" onClick={onExit}>
            Revenir à la constellation
          </button>
        </div>
      </div>
    );
  }

  const node = selected?.node;
  const destinationList = (
    <>
      <button type="button" className="u-dest u-dest-sun" onClick={() => go("sun")}>
        <span className="u-dest-dot" style={{ background: "#ffcf6e", boxShadow: "0 0 10px #ffb547" }} />
        <span className="u-dest-text">
          <strong>{sunName}</strong>
          <small>{data.personal ? "Ton étoile · retour à la base" : "Centre de l'univers"}</small>
        </span>
        <Home size={14} />
      </button>
      {destinations.home.length > 0 && (
        <>
          <p className="u-dest-title">{data.personal ? "Ton système solaire" : "Bientôt closes"}</p>
          {destinations.home.map((d) => (
            <button key={d.id} type="button" className="u-dest" onClick={() => go(d.id)}>
              <span className="u-dest-dot" style={{ background: d.urgency ? URGENCY_COLORS[d.urgency] : "#8c8273" }} />
              <span className="u-dest-text">
                <strong>{d.name}</strong>
                <small>{d.designation}</small>
              </span>
              {d.score != null && <span className="u-dest-score">{d.score}</span>}
            </button>
          ))}
        </>
      )}
      {destinations.galaxies.length > 0 && (
        <>
          <p className="u-dest-title">Galaxies</p>
          {destinations.galaxies.map((d) => (
            <button key={d.id} type="button" className="u-dest" onClick={() => go(d.id)}>
              <Orbit size={15} className="u-dest-icon" />
              <span className="u-dest-text">
                <strong>{d.name}</strong>
                <small>
                  {d.designation} · {d.members} planète{(d.members ?? 0) > 1 ? "s" : ""}
                </small>
              </span>
              {d.score != null && <span className="u-dest-score">{d.score}</span>}
            </button>
          ))}
        </>
      )}
    </>
  );

  return (
    <div className="universe" role="application" aria-label="Univers des opportunités en 3D">
      <div ref={mountRef} className="u-canvas" />
      <div ref={labelsRef} className="u-labels" aria-hidden />
      <Hyperspace ref={hyperRef} />
      <div className="u-visor" aria-hidden>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M2 18 V6 Q2 2 6 2 H20" />
          <path d="M80 2 H94 Q98 2 98 6 V18" />
          <path d="M98 82 V94 Q98 98 94 98 H80" />
          <path d="M20 98 H6 Q2 98 2 94 V82" />
        </svg>
      </div>

      <header className={clsx("u-top", arrived && "is-in")}>
        <div className="u-brand">
          <span className="u-eyebrow">
            <span className="u-live" /> Univers Arah!<span className="u-eyebrow-more"> · sortie extravéhiculaire</span>
          </span>
          {readouts && (
            <div className="u-readouts">
              <span>
                <LocateFixed size={12} /> {formatUa(readouts.distanceUa)} du soleil
              </span>
              <span>
                <Navigation size={12} /> {Math.round(readouts.speed)} km/s
              </span>
              <span>
                <Compass size={12} /> cap {Math.round(readouts.heading)}°
              </span>
            </div>
          )}
        </div>
        <div className="u-actions">
          <button type="button" className="u-btn" onClick={() => setLegend(true)}>
            <BookOpen size={15} /> <span>Légende</span>
          </button>
          <button type="button" className="u-btn" onClick={onExit} aria-label="Quitter l'univers">
            <X size={15} /> <span>Quitter</span> <kbd>Échap</kbd>
          </button>
        </div>
      </header>

      {!data.personal && arrived && (
        <div className="u-banner">
          <Sparkles size={15} />
          <span>
            Connecte-toi : ton profil devient un soleil, et les offres qui te correspondent viennent en orbite autour de toi.
          </span>
          <Link to="/inscription" className="u-link">
            Créer mon radar
          </Link>
        </div>
      )}

      <nav className={clsx("u-panel u-destinations", arrived && "is-in")} aria-label="Destinations">
        <p className="u-panel-title">Destinations</p>
        <div className="u-dest-list">{destinationList}</div>
      </nav>

      <div className={clsx("u-reticle", aim && "is-locked", selected && "is-busy")} aria-hidden>
        <span />
      </div>
      {aim && !selected && (
        <div className="u-aim" aria-live="polite">
          <span className="u-mono">
            {aim.type === "planet" && aim.planetType ? PLANET_LABELS[aim.planetType] : aim.designation} · {formatUa(aim.distance / 10)}
          </span>
          <strong>{aim.name}</strong>
          <small>
            <span className="u-hint-desktop">Clic ou Entrée pour {aim.type === "galaxy" ? "y entrer" : "approcher"}</span>
            <span className="u-hint-touch">Touche pour {aim.type === "galaxy" ? "y entrer" : "approcher"}</span>
          </small>
        </div>
      )}

      {arrived && !selected && (
        <p className="u-hint">
          <span className="u-hint-desktop">
            Glisse : regarder · <kbd>Z</kbd>
            <kbd>Q</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd> : avancer · <kbd>Espace</kbd>/<kbd>C</kbd> : monter, descendre · <kbd>Maj</kbd> : turbo · <kbd>H</kbd> : retour au soleil
          </span>
          <span className="u-hint-touch">Glisse pour regarder · pince pour avancer · touche une planète</span>
        </p>
      )}

      <button type="button" className="u-btn u-sheet-toggle" onClick={() => setSheet(true)}>
        <Orbit size={15} /> Destinations
      </button>
      {sheet && (
        <div className="u-sheet" role="dialog" aria-label="Destinations">
          <div className="u-sheet-head">
            <p className="u-panel-title">Destinations</p>
            <button type="button" className="u-icon" aria-label="Fermer" onClick={() => setSheet(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="u-dest-list">{destinationList}</div>
        </div>
      )}

      {selected && (
        <aside className="u-panel u-card" aria-live="polite">
          <button type="button" className="u-icon u-card-close" aria-label="Fermer" onClick={() => engineRef.current?.deselect()}>
            <X size={16} />
          </button>
          {node ? (
            <>
              <div className="u-card-head">
                <span className="u-planet" style={{ background: PLANET_SWATCH[selected.planetType ?? "moon"] }} />
                <div>
                  <span className="u-mono">{selected.designation}</span>
                  <span className="u-card-type">
                    {PLANET_LABELS[selected.planetType ?? "moon"]} · {labels.kind[node.kind] ?? node.kind}
                  </span>
                </div>
              </div>
              <h2>{node.title}</h2>
              <p className="u-card-issuer">{node.issuer}</p>
              <div className="u-card-facts">
                <span style={{ color: URGENCY_COLORS[node.urgency] }}>● {deadlineLabel(node.deadline).label}</span>
                {node.sector && <span>{labels.sector[node.sector] ?? node.sector}</span>}
              </div>
              {node.score != null && (
                <div className="u-card-score">
                  <ScoreRing score={node.score} size={50} />
                  <span>d'adéquation avec ton profil</span>
                </div>
              )}
              <div className="u-card-actions">
                <Link to={`/offre/${node.id}`} className="u-btn u-btn-primary">
                  Voir la fiche <ArrowUpRight size={15} />
                </Link>
                <button type="button" className="u-btn" onClick={() => go("sun")}>
                  <Home size={15} /> Retour au soleil
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="u-mono">{selected.designation}</span>
              <h2>{selected.name}</h2>
              <p className="u-card-issuer">
                {selected.members} planète{(selected.members ?? 0) > 1 ? "s" : ""}
                {selected.best != null ? ` · la plus proche de toi : ${selected.best}/100` : ""}
              </p>
              {selected.planets && selected.planets.length > 0 ? (
                <div className="u-card-planets">
                  <p className="u-panel-title">Ses planètes</p>
                  <div className="u-dest-list">
                    {selected.planets.map((d) => (
                      <button key={d.id} type="button" className="u-dest" onClick={() => go(d.id)}>
                        <span className="u-dest-dot" style={{ background: d.urgency ? URGENCY_COLORS[d.urgency] : "#8c8273" }} />
                        <span className="u-dest-text">
                          <strong>{d.name}</strong>
                          <small>{d.designation}</small>
                        </span>
                        {d.score != null && <span className="u-dest-score">{d.score}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="u-card-note">Les offres qui te correspondent le mieux sont sur le bord de la galaxie tourné vers ton soleil.</p>
              )}
              <div className="u-card-actions">
                <button type="button" className="u-btn" onClick={() => go("sun")}>
                  <Home size={15} /> Retour au soleil
                </button>
              </div>
            </>
          )}
        </aside>
      )}

      {legend && (
        <div className="u-modal" role="dialog" aria-label="Légende de l'univers" onClick={() => setLegend(false)}>
          <div className="u-panel u-legend" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="u-icon u-card-close" aria-label="Fermer" onClick={() => setLegend(false)}>
              <X size={16} />
            </button>
            <span className="u-eyebrow">Carte du ciel</span>
            <h2>Comment lire l'univers</h2>
            <div className="u-legend-grid">
              <section>
                <h3>Chaque planète est une offre</h3>
                <ul>
                  {PLANET_LEGEND.map(([type, name, meaning]) => (
                    <li key={type}>
                      <span className="u-planet u-planet-sm" style={{ background: PLANET_SWATCH[type] }} />
                      <span>
                        <strong>{name}</strong>
                        <small>{meaning}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Son halo dit l'urgence</h3>
                <ul>
                  {URGENCY_LEGEND.map(([u, text]) => (
                    <li key={u}>
                      <span className="u-halo" style={{ background: URGENCY_COLORS[u], boxShadow: `0 0 12px ${URGENCY_COLORS[u]}` }} />
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                <h3>Et le reste</h3>
                <ul className="u-legend-text">
                  <li>
                    <strong>Ton soleil</strong> : ton profil. Les offres qui te correspondent le mieux sont en orbite autour
                    de toi ; plus l'orbite est proche, meilleur est le score.
                  </li>
                  <li>
                    <strong>Les orbites</strong> suivent la troisième loi de Kepler : plus une planète est proche, plus elle
                    tourne vite.
                  </li>
                  <li>
                    <strong>Les galaxies</strong> regroupent des offres qui se ressemblent. Plus une galaxie est proche, plus
                    elle te correspond.
                  </li>
                  <li>
                    <strong>La taille</strong> d'une planète dit le montant en jeu.
                  </li>
                  <li>
                    <strong>Une comète</strong> tourne autour des offres publiées il y a moins de trois jours.
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
