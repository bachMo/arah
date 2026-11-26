import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, FileWarning, Lightbulb, Lock, Minus, Sparkle } from "lucide-react";
import { useState } from "react";
import { AreaChart, BarList, Donut, SkillRadar } from "../components/charts";
import { ButtonLink, Select, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatNumber, formatXof } from "../lib/format";
import { useDocumentTitle, useTaxonomy } from "../lib/hooks";
import type { Observatory as ObservatoryData, Position } from "../lib/types";

function Trend({ value, previous }: { value: number; previous: number }) {
  if (previous === 0) return <span className="trend flat">nouveau</span>;
  const pct = Math.round(value * 100);
  if (Math.abs(pct) < 5) return <span className="trend flat"><Minus /> stable</span>;
  return pct > 0 ? (
    <span className="trend up"><ArrowUpRight /> +{pct} %</span>
  ) : (
    <span className="trend down"><ArrowDownRight /> {pct} %</span>
  );
}

function MyPosition() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["observatory", "me"], queryFn: () => api.get<Position>("/observatory/me"), enabled: Boolean(user) });
  if (!user) {
    return (
      <section className="position card card-pad position-locked">
        <Lock />
        <div>
          <h2 className="card-title">Ta position sur le marché</h2>
          <p className="small muted">
            Part des offres de ton secteur auxquelles tu peux répondre, ton score moyen, et surtout ce qui te manque pour en débloquer
            davantage.
          </p>
        </div>
        <ButtonLink to="/inscription" variant="signal" size="sm">
          Créer mon radar
        </ButtonLink>
      </section>
    );
  }
  if (query.isLoading) return <Skeleton height={300} radius={24} />;
  const data = query.data;
  if (!data || !data.ready) {
    return (
      <section className="position card card-pad position-locked">
        <Lightbulb />
        <div>
          <h2 className="card-title">Ta position sur le marché</h2>
          <p className="small muted">Choisis au moins un secteur dans ton profil pour voir ta position.</p>
        </div>
        <ButtonLink to="/reglages" size="sm">
          Compléter mon profil
        </ButtonLink>
      </section>
    );
  }
  return (
    <section className="position card card-pad">
      <div className="position-head">
        <div>
          <span className="eyebrow">Ma position</span>
          <h2 className="section-subtitle" style={{ marginTop: 10 }}>
            Tu peux répondre à <span className="serif accent">{Math.round(data.share * 100)} %</span> des offres de ton secteur.
          </h2>
          <p className="small muted">
            {formatNumber(data.eligible_offers)} offres avec un score d'au moins 60 sur {formatNumber(data.sector_offers)} publiées ces
            4 derniers mois · score moyen {data.avg_score}/100.
          </p>
        </div>
      </div>
      <div className="position-grid">
        <div>
          <span className="card-label">Ce qui te manque</span>
          {data.gaps.length === 0 ? (
            <p className="small muted" style={{ marginTop: 12 }}>
              Rien de flagrant : ton profil couvre bien ce que demandent les offres de ton secteur.
            </p>
          ) : (
            <ul className="gaps">
              {data.gaps.map((g) => (
                <li key={`${g.kind}-${g.label}`}>
                  <span className={clsx("gap-icon", g.kind)}>{g.kind === "document" ? <FileWarning /> : <Sparkle />}</span>
                  <div>
                    <strong>{g.label}</strong>
                    <span className="small muted">{g.hint}</span>
                  </div>
                  <span className="gap-count tnum">+{g.offers}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="radar-wrap">
          <span className="card-label">Compétences demandées / ton profil</span>
          <SkillRadar items={data.radar} />
          <div className="legend-inline center">
            <span>
              <i className="demand" /> demandé
            </span>
            <span>
              <i className="mine" /> dans ton profil
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Observatory() {
  useDocumentTitle("Observatoire du marché");
  const { data: taxonomy } = useTaxonomy();
  const [sector, setSector] = useState("");
  const query = useQuery({
    queryKey: ["observatory", sector],
    queryFn: () => api.get<ObservatoryData>("/observatory", { sector }),
  });
  const data = query.data;

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <div>
            <span className="eyebrow">Observatoire</span>
            <h1 className="page-title">
              Comprendre <span className="serif">ton marché</span>
            </h1>
            <p className="lead">
              Les tendances des appels d'offres et financements collectés par l'agent : secteurs qui montent, bailleurs actifs,
              montants, et ta position.
            </p>
          </div>
          <Select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Filtrer par secteur" style={{ maxWidth: 280 }}>
            <option value="">Tous les secteurs</option>
            {taxonomy?.sectors.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="kpis">
          {[
            ["Offres ouvertes", data ? formatNumber(data.totals.open) : "–"],
            ["Montant en jeu", data ? formatXof(data.totals.open_budget_xof) : "–"],
            ["Nouvelles cette semaine", data ? formatNumber(data.totals.this_week) : "–"],
            ["Sources suivies", data ? formatNumber(data.totals.sources) : "–"],
          ].map(([label, value]) => (
            <div key={label} className="kpi kpi-plain">
              <strong className="tnum">{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <MyPosition />

        <div className="obs-grid">
          <section className="card card-pad obs-wide">
            <span className="card-label">Offres publiées par mois</span>
            {data ? <AreaChart data={data.monthly} /> : <Skeleton height={220} />}
          </section>

          <section className="card card-pad">
            <span className="card-label">Secteurs · tendance sur 30 jours</span>
            {data ? (
              <ul className="sector-trends">
                {data.by_sector.slice(0, 9).map((s) => (
                  <li key={s.value}>
                    <span>{s.label}</span>
                    <span className="tnum muted small">{formatNumber(s.count)}</span>
                    <Trend value={s.trend} previous={s.previous} />
                  </li>
                ))}
              </ul>
            ) : (
              <Skeleton height={260} />
            )}
          </section>

          <section className="card card-pad">
            <span className="card-label">Types d'offres</span>
            {data ? <Donut items={data.by_kind.map((k) => ({ label: k.label, value: k.count }))} centerLabel="offres" /> : <Skeleton height={200} />}
          </section>

          <section className="card card-pad">
            <span className="card-label">Émetteurs les plus actifs</span>
            {data ? <BarList items={data.top_issuers.map((i) => ({ label: i.label, value: i.count }))} /> : <Skeleton height={240} />}
          </section>

          <section className="card card-pad">
            <span className="card-label">Où sont publiées les offres</span>
            {data ? <BarList items={data.by_country.map((c) => ({ label: c.label, value: c.count }))} /> : <Skeleton height={240} />}
          </section>

          <section className="card card-pad">
            <span className="card-label">Montant moyen par secteur</span>
            {data ? (
              <BarList
                items={data.by_sector
                  .filter((s) => s.avg_budget_xof)
                  .sort((a, b) => (b.avg_budget_xof ?? 0) - (a.avg_budget_xof ?? 0))
                  .slice(0, 8)
                  .map((s) => ({ label: s.label, value: s.avg_budget_xof ?? 0 }))}
                format={(v) => formatXof(v)}
              />
            ) : (
              <Skeleton height={240} />
            )}
          </section>

          <section className="card card-pad">
            <span className="card-label">Mots-clés qui émergent</span>
            {data ? (
              data.emerging_keywords.length ? (
                <div className="keyword-cloud">
                  {data.emerging_keywords.map((k, i) => (
                    <span key={k.label} style={{ fontSize: `${Math.max(14, 24 - i * 1.1)}px` }}>
                      {k.label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="small muted">Pas encore assez d'historique.</p>
              )
            ) : (
              <Skeleton height={160} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
