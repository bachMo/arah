import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BellRing, BriefcaseBusiness, Eye, FileSignature, HeartHandshake, Megaphone, Orbit, ScanSearch, Sparkles, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { AreaChart } from "../components/charts";
import { GithubIcon } from "../components/icons";
import { DeadlineBadge, KindBadge, ScoreRing } from "../components/Opportunity";
import { RadarScope } from "../components/RadarScope";
import { ButtonLink } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatNumber, formatXof } from "../lib/format";
import { useConfig, useCountUp, useDocumentTitle, useReveal } from "../lib/hooks";
import type { Observatory, Opportunity, Page, Transparency } from "../lib/types";

const AGENTS = [
  {
    icon: ScanSearch,
    name: "Le Veilleur",
    time: "Chaque matin, 6 h",
    text: "Parcourt les portails d'appels d'offres, les bailleurs, les programmes et les offres d'emploi. Il écarte les doublons et les offres déjà closes.",
    tone: "ocean",
  },
  {
    icon: Eye,
    name: "L'Analyste",
    time: "Dans la foulée",
    text: "Lit chaque offre, en fait une fiche claire et la compare à ton profil : un score sur 100, les raisons, les conditions remplies ou non.",
    tone: "plum",
  },
  {
    icon: BellRing,
    name: "Le Suivi",
    time: "Quand ça compte",
    text: "T'envoie le résumé du jour par e-mail et te rappelle les dates limites à J-7, J-3 et J-1. Rien de plus, rien de moins.",
    tone: "signal",
  },
  {
    icon: FileSignature,
    name: "Le Rédacteur",
    time: "Sur ta demande",
    text: "Prépare la liste des pièces, la matrice d'exigences, le plan et la lettre de soumission, ou ta lettre de motivation pour un poste. Tu relis, tu valides.",
    tone: "leaf",
  },
];

function Stat({ value, label, format = formatNumber }: { value: number; label: string; format?: (v: number) => string }) {
  const animated = useCountUp(value);
  return (
    <div className="hero-stat">
      <strong className="tnum">{format(animated)}</strong>
      <span>{label}</span>
    </div>
  );
}

export function Home() {
  useDocumentTitle("");
  const { user } = useAuth();
  const { data: config } = useConfig();
  const ref = useReveal<HTMLDivElement>();
  const latest = useQuery({
    queryKey: ["home", "latest"],
    queryFn: () => api.get<Page<Opportunity>>("/opportunities", { size: 22, sort: "recent" }),
  });
  const urgent = useQuery({
    queryKey: ["home", "urgent"],
    queryFn: () => api.get<Page<Opportunity>>("/opportunities", { size: 3, sort: "deadline", deadline_within: 30 }),
  });
  const market = useQuery({ queryKey: ["observatory", ""], queryFn: () => api.get<Observatory>("/observatory") });
  const money = useQuery({ queryKey: ["transparency"], queryFn: () => api.get<Transparency>("/transparency") });

  const blips = (latest.data?.items ?? []).map((o) => ({ id: o.id, title: o.title, kind: o.kind, deadline: o.deadline_at }));
  const totals = market.data?.totals;
  const month = money.data?.month;
  const coverage = month && month.costs_xof > 0 ? Math.min(100, Math.round((month.donations_xof / month.costs_xof) * 100)) : 0;
  const showcase = urgent.data?.items?.length ? urgent.data.items : (latest.data?.items ?? []).slice(0, 3);
  const demoScores = [92, 81, 67];

  return (
    <div ref={ref} className="home">
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Veille gratuite · open source</span>
            <h1 className="hero-title">
              Les opportunités passent.
              <br />
              <span className="serif">Arah!</span> les guette <span className="highlight">pour toi.</span>
            </h1>
            <p className="hero-lead">
              Appels d'offres, financements, concours, programmes et offres d'emploi : un agent les cherche chaque matin,
              te dit lesquels te correspondent et pourquoi, puis t'aide à préparer ta réponse ou ta candidature.
            </p>
            <div className="hero-cta">
              {user ? (
                <ButtonLink to="/radar" size="lg" variant="signal" icon={<ArrowRight />}>
                  Ouvrir mon radar
                </ButtonLink>
              ) : (
                <ButtonLink to="/inscription" size="lg" variant="signal" icon={<ArrowRight />}>
                  Créer mon radar, c'est gratuit
                </ButtonLink>
              )}
              <ButtonLink to="/explorer" size="lg" variant="ghost">
                Explorer les offres
              </ButtonLink>
            </div>
            <div className="hero-stats">
              <Stat value={totals?.open ?? 0} label="offres ouvertes" />
              <Stat value={totals?.open_budget_xof ?? 0} label="en jeu" format={(v) => formatXof(v)} />
              <Stat value={totals?.sources ?? 0} label="sources suivies" />
            </div>
          </div>
          <div className="hero-visual">
            <RadarScope blips={blips} />
            <div className="hero-visual-caption mono">
              <span className="live-dot" /> Dernières offres captées
            </div>
          </div>
        </div>
      </section>

      {latest.data?.items?.length ? (
        <section className="ticker" aria-label="Dernières offres">
          <div className="ticker-track">
            {[...latest.data.items, ...latest.data.items].map((o, i) => (
              <Link key={`${o.id}-${i}`} to={`/offre/${o.id}`} className="ticker-item" tabIndex={i < latest.data.items.length ? 0 : -1}>
                <span className="ticker-dot" />
                {o.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="container">
          <div className="section-head reveal">
            <span className="eyebrow">Comment ça marche</span>
            <h2 className="section-title">
              Quatre agents, <span className="serif">une seule mission</span> : que tu ne rates plus rien.
            </h2>
            <p className="lead">
              Tu décris ton activité une fois. Ensuite, tu n'as plus qu'à lire ce que l'agent t'envoie. Il ne fait jamais
              rien d'irréversible sans toi.
            </p>
          </div>
          <div className="agents">
            {AGENTS.map((a, i) => (
              <article key={a.name} className={`agent-card reveal tone-${a.tone}`} style={{ transitionDelay: `${i * 80}ms` }}>
                <div className="agent-icon">
                  <a.icon />
                </div>
                <span className="agent-step mono">0{i + 1}</span>
                <h3>{a.name}</h3>
                <span className="agent-time">{a.time}</span>
                <p>{a.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-showcase">
        <div className="container showcase-grid">
          <div className="reveal">
            <span className="eyebrow">Ton radar</span>
            <h2 className="section-title">
              Pas une liste de plus.
              <br />
              <span className="serif">Un tri qui s'explique.</span>
            </h2>
            <p className="lead">
              Chaque offre reçoit un score d'adéquation avec ton profil, les raisons de ce score et les points de
              vigilance. Tu dis « pertinent » ou « pas pour moi », et le tri s'affine.
            </p>
            <ul className="checks">
              <li>Score de 0 à 100, raisons et conditions remplies</li>
              <li>Météo des dates limites : ce qui est encore faisable</li>
              <li>Statuts : à voir, intéressé, en préparation, envoyé</li>
              <li>Rappels J-7, J-3 et J-1 pour ne jamais déposer en retard</li>
            </ul>
          </div>
          <div className="showcase-stack reveal">
            <span className="showcase-tag mono">Exemple de radar · scores fictifs</span>
            {showcase.map((o, i) => (
              <Link key={o.id} to={`/offre/${o.id}`} className="showcase-card" style={{ ["--i" as string]: i }}>
                <div className="row" style={{ gap: 8 }}>
                  <KindBadge kind={o.kind} />
                  <DeadlineBadge deadline={o.deadline_at} withDate={false} />
                </div>
                <strong>{o.title}</strong>
                <span className="muted small">{o.issuer}</span>
                <div className="showcase-score">
                  <ScoreRing score={demoScores[i] ?? 60} size={48} />
                  <span className="small">
                    {i === 0 ? "Mots-clés trouvés : plateforme, application" : i === 1 ? "Dans ton secteur" : "Délai court : prévois tes pièces"}
                  </span>
                </div>
              </Link>
            ))}
            {!showcase.length && <div className="skeleton" style={{ height: 320, borderRadius: 24 }} />}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container features">
          <Link to="/constellation" className="feature feature-dark reveal">
            <div className="feature-orbit" aria-hidden>
              {Array.from({ length: 26 }, (_, i) => {
                const angle = (i * 137.5 * Math.PI) / 180;
                const radius = 14 + ((i * 53) % 34);
                return (
                  <span
                    key={i}
                    style={{ left: `${50 + Math.cos(angle) * radius}%`, top: `${50 + Math.sin(angle) * radius}%`, animationDelay: `${(i % 7) * 0.4}s` }}
                  />
                );
              })}
              <b />
            </div>
            <div className="feature-body">
              <span className="feature-kicker">
                <Orbit /> Constellation 3D
              </span>
              <h3>Promène-toi entre les offres.</h3>
              <p>
                Chaque offre est une étoile. Les offres qui se ressemblent sont proches, la taille donne le montant, la
                couleur l'urgence. Ton profil est au centre.
              </p>
              <span className="feature-link">
                Ouvrir la constellation <ArrowRight />
              </span>
            </div>
          </Link>
          <Link to="/observatoire" className="feature reveal">
            <div className="feature-body">
              <span className="feature-kicker">
                <TrendingUp /> Observatoire
              </span>
              <h3>Comprends ton marché.</h3>
              <p>
                Secteurs qui montent, bailleurs les plus actifs, montants moyens, et surtout ce qui te manque pour
                répondre à plus d'offres.
              </p>
            </div>
            <div className="feature-chart">
              <AreaChart data={market.data?.monthly ?? []} height={170} />
            </div>
            <span className="feature-link">
              Voir les tendances <ArrowRight />
            </span>
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="jobs-band reveal">
            <article className="jobs-card">
              <span className="jobs-icon">
                <BriefcaseBusiness />
              </span>
              <span className="eyebrow">Candidats</span>
              <h2>
                Tu cherches un emploi, <span className="serif">un stage ou une mission ?</span>
              </h2>
              <p>
                CDI, CDD, stage, alternance, freelance ou volontariat : indique ton métier et tes compétences, Arah! te
                propose chaque matin les postes qui te correspondent et t'aide à écrire ta lettre de motivation.
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <ButtonLink to={user ? "/radar" : "/inscription"} variant="signal" icon={<ArrowRight />}>
                  {user ? "Ouvrir mon radar" : "Créer mon profil candidat"}
                </ButtonLink>
                <ButtonLink to="/explorer?type=job" variant="ghost">
                  Voir les offres d'emploi
                </ButtonLink>
              </div>
            </article>
            <article className="jobs-card jobs-card-dark">
              <span className="jobs-icon">
                <Megaphone />
              </span>
              <span className="eyebrow">Recruteurs</span>
              <h2>
                Tu recrutes ? <span className="serif">Publie ton offre gratuitement.</span>
              </h2>
              <p>
                Ton offre est relue, mise en ligne, puis proposée directement aux candidats dont le profil correspond :
                métier, compétences, contrat et lieu.
              </p>
              <ButtonLink to="/publier-une-offre" variant="primary" icon={<ArrowRight />}>
                Publier une offre
              </ButtonLink>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="open-card reveal">
            <div className="open-copy">
              <span className="eyebrow">100 % gratuit, 100 % ouvert</span>
              <h2 className="section-title">
                Toutes les fonctions, pour tout le monde. <span className="serif">Financé par les dons.</span>
              </h2>
              <p className="lead">
                Pas d'abonnement, pas de version premium. Le code est public, les coûts aussi : chaque mois, tu vois ce
                que coûte l'agent et ce que la communauté a donné.
              </p>
              <div className="row" style={{ marginTop: 26 }}>
                <ButtonLink to="/soutenir" variant="signal" icon={<HeartHandshake />}>
                  Soutenir Arah!
                </ButtonLink>
                <a className="btn btn-ghost" href={config?.github_url ?? "https://github.com/bachMo/arah"} target="_blank" rel="noreferrer">
                  <GithubIcon /> Voir le code
                </a>
              </div>
            </div>
            <div className="open-meter">
              <div className="meter-head">
                <span className="card-label">Ce mois-ci</span>
                <Link to="/journal" className="small link">
                  Journal de l'agent
                </Link>
              </div>
              <div className="meter-figures">
                <div>
                  <span className="muted small">Coûts</span>
                  <strong className="tnum">{formatXof(month?.costs_xof ?? 0, { short: false }).replace("Montant non précisé", "0 F CFA")}</strong>
                </div>
                <div>
                  <span className="muted small">Dons reçus</span>
                  <strong className="tnum" style={{ color: "var(--leaf)" }}>
                    {formatXof(month?.donations_xof ?? 0, { short: false }).replace("Montant non précisé", "0 F CFA")}
                  </strong>
                </div>
              </div>
              <div className="meter-bar" role="progressbar" aria-valuenow={coverage} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${coverage}%` }} />
              </div>
              <p className="small muted">
                {coverage >= 100
                  ? "Les dons couvrent les coûts du mois. Merci !"
                  : `Les dons couvrent ${coverage} % des coûts du mois.`}
              </p>
              <div className="meter-sparkles">
                <Sparkles /> Le module WhatsApp sera activé dès que les dons couvriront les frais de Meta.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section final-cta">
        <div className="container reveal">
          <h2>
            Ton prochain marché est peut-être <span className="serif">déjà publié.</span>
          </h2>
          <p className="lead" style={{ marginInline: "auto" }}>
            Moins de cinq minutes pour créer ton radar. Les premières offres s'affichent tout de suite.
          </p>
          <ButtonLink to={user ? "/radar" : "/inscription"} size="lg" variant="signal" icon={<ArrowRight />}>
            {user ? "Ouvrir mon radar" : "Commencer maintenant"}
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
