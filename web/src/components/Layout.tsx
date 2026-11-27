import clsx from "clsx";
import { BriefcaseBusiness, ChevronDown, FolderLock, LogOut, Menu, Radar, Settings, Shield, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { homePath, useAuth } from "../lib/auth";
import { initials } from "../lib/format";
import { useConfig } from "../lib/hooks";
import { GithubIcon } from "./icons";
import { Logo } from "./Logo";
import { ButtonLink } from "./ui";

const NAV = [
  { to: "/explorer", label: "Explorer" },
  { to: "/explorer?type=job", label: "Emplois" },
  { to: "/constellation", label: "Constellation" },
  { to: "/observatoire", label: "Observatoire" },
  { to: "/journal", label: "Journal de l'agent" },
  { to: "/soutenir", label: "Soutenir" },
];

/** « Explorer » et « Emplois » partagent la même page : on les distingue par le filtre de type. */
function isNavActive(to: string, pathname: string, search: string): boolean {
  const [path, query] = to.split("?");
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
  const jobs = new URLSearchParams(search).get("type") === "job";
  if (path !== "/explorer") return true;
  return query ? jobs : !jobs;
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="avatar-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="avatar">{initials(user.full_name, user.email)}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{user.full_name || "Mon compte"}</strong>
            <span className="muted tiny">{user.email}</span>
          </div>
          {user.profile_kind === "recruiter" ? (
            <Link role="menuitem" to="/mes-offres" onClick={() => setOpen(false)}>
              <BriefcaseBusiness /> Mes offres
            </Link>
          ) : (
            <>
              <Link role="menuitem" to="/radar" onClick={() => setOpen(false)}>
                <Radar /> Mon radar
              </Link>
              <Link role="menuitem" to="/coffre" onClick={() => setOpen(false)}>
                <FolderLock /> Coffre de documents
              </Link>
            </>
          )}
          <Link role="menuitem" to="/reglages" onClick={() => setOpen(false)}>
            <Settings /> Profil et réglages
          </Link>
          {user.is_admin && (
            <Link role="menuitem" to="/admin" onClick={() => setOpen(false)}>
              <Shield /> Administration
            </Link>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              navigate("/");
              await logout();
            }}
          >
            <LogOut /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={clsx("site-header", scrolled && "is-scrolled", open && "menu-open")}>
      <div className="container header-inner">
        <Link to="/" className="header-logo" aria-label="Arah!, accueil">
          <Logo />
        </Link>
        <nav className="main-nav" aria-label="Navigation principale">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={clsx("nav-link", isNavActive(item.to, location.pathname, location.search) && "is-active")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              {user.profile_kind === "recruiter" ? (
                <ButtonLink to={homePath(user)} size="sm" icon={<BriefcaseBusiness />}>
                  Mes offres
                </ButtonLink>
              ) : (
                <ButtonLink to={homePath(user)} size="sm" icon={<Radar />}>
                  Mon radar
                </ButtonLink>
              )}
              <UserMenu />
            </>
          ) : (
            <>
              <Link to="/connexion" className="nav-link">
                Se connecter
              </Link>
              <ButtonLink to="/inscription" size="sm" variant="signal">
                Créer mon radar
              </ButtonLink>
            </>
          )}
        </div>
        <button
          type="button"
          className="burger"
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="mobile-menu">
          <nav aria-label="Navigation mobile">
            {user && (
              <NavLink to={homePath(user)} className="mobile-link">
                {user.profile_kind === "recruiter" ? "Mes offres" : "Mon radar"}
              </NavLink>
            )}
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={clsx("mobile-link", isNavActive(item.to, location.pathname, location.search) && "active")}
              >
                {item.label}
              </Link>
            ))}
            <NavLink to="/publier-une-offre" className="mobile-link">
              Publier une offre d'emploi
            </NavLink>
            {user && (
              <>
                {user.profile_kind !== "recruiter" && (
                  <NavLink to="/coffre" className="mobile-link">
                    Coffre de documents
                  </NavLink>
                )}
                <NavLink to="/reglages" className="mobile-link">
                  Profil et réglages
                </NavLink>
                {user.is_admin && (
                  <NavLink to="/admin" className="mobile-link">
                    Administration
                  </NavLink>
                )}
              </>
            )}
          </nav>
          <div className="mobile-actions">
            {user ? (
              <button
                type="button"
                className="btn btn-ghost btn-block"
                onClick={async () => {
                  navigate("/");
                  await logout();
                }}
              >
                Se déconnecter
              </button>
            ) : (
              <>
                <ButtonLink to="/inscription" variant="signal" className="btn-block">
                  Créer mon radar gratuitement
                </ButtonLink>
                <ButtonLink to="/connexion" variant="ghost" className="btn-block">
                  Se connecter
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const { data: config } = useConfig();
  const github = config?.github_url ?? "https://github.com/bachMo/arah";
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo size={30} />
          <p className="muted">
            La veille d'appels d'offres, de financements, de concours et d'offres d'emploi, gratuite et open source.
            Pensée à Dakar pour les PME, freelances, ONG, startups et candidats d'Afrique de l'Ouest.
          </p>
          <a className="btn btn-ghost btn-sm" href={github} target="_blank" rel="noreferrer">
            <GithubIcon /> Code source
          </a>
        </div>
        <div>
          <h4 className="footer-title">Explorer</h4>
          <Link to="/explorer">Toutes les offres</Link>
          <Link to="/explorer?type=job">Offres d'emploi</Link>
          <Link to="/publier-une-offre">Publier une offre d'emploi</Link>
          <Link to="/constellation">Constellation 3D</Link>
          <Link to="/observatoire">Observatoire du marché</Link>
          <Link to="/journal">Journal de l'agent</Link>
        </div>
        <div>
          <h4 className="footer-title">Le projet</h4>
          <Link to="/soutenir">Soutenir par un don</Link>
          <Link to="/a-propos">À propos</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/conditions">Conditions d'utilisation</Link>
        </div>
        <div>
          <h4 className="footer-title">Contact</h4>
          {config?.contact_email && <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a>}
          <a href={`${github.replace(/\/$/, "")}/issues`} target="_blank" rel="noreferrer">
            Signaler un problème
          </a>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Arah! · Logiciel libre sous licence MIT</span>
        <span className="muted">Les offres restent la propriété de leurs émetteurs. Vérifie toujours l'avis original.</span>
      </div>
    </footer>
  );
}

export function Layout() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);
  return (
    <>
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <Header />
      <main id="contenu" className="site-main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
