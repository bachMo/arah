import type { ReactNode } from "react";
import { Logo } from "../../components/Logo";

export function AuthShell({ title, subtitle, children, aside }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-panel">
        <div className="auth-card">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="muted auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
      <div className="auth-aside" aria-hidden>
        <div className="auth-aside-inner">
          <Logo size={34} />
          {aside ?? (
            <>
              <p className="auth-quote">
                « J'ai découvert un appel d'offres à 48 heures de la clôture. Plus jamais ça. »
              </p>
              <ul className="auth-points">
                <li>Les offres qui te correspondent, chaque matin</li>
                <li>Un score qui s'explique, pas une liste de plus</li>
                <li>Des rappels avant chaque date limite</li>
                <li>Un brouillon de réponse en quelques secondes</li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function GoogleButton() {
  return (
    <a className="btn btn-ghost btn-block google-btn" href="/api/auth/google/start">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.97 10.97 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      Continuer avec Google
    </a>
  );
}

export function OrDivider() {
  return (
    <div className="or-divider">
      <span>ou</span>
    </div>
  );
}
