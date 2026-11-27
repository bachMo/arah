import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Input, Notice } from "../../components/ui";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useConfig, useDocumentTitle } from "../../lib/hooks";
import type { User } from "../../lib/types";
import { AuthShell, GoogleButton, OrDivider } from "./AuthShell";

function strength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return { score, label: ["Trop court", "Faible", "Correct", "Solide", "Excellent"][score] };
}

export default function Register() {
  useDocumentTitle("Créer mon radar");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { setUser } = useAuth();
  const { data: config } = useConfig();
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [accepted, setAccepted] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post<User>("/auth/register", form),
    onSuccess: (user) => {
      setUser(user);
      const next = params.get("suite");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/bienvenue", { replace: true });
    },
  });
  const fields = mutation.error instanceof ApiError ? mutation.error.fields : {};
  const pwd = strength(form.password);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (accepted) mutation.mutate();
  };

  return (
    <AuthShell title="Crée ton radar" subtitle="Gratuit, sans carte bancaire, pour toujours.">
      {config?.google_enabled && (
        <>
          <GoogleButton />
          <OrDivider />
        </>
      )}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Ton nom ou celui de ta structure" htmlFor="name">
          <Input id="name" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Adresse e-mail" htmlFor="email" error={fields.email} hint="C'est là que l'agent t'enverra tes alertes.">
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Mot de passe" htmlFor="password" error={fields.password}>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {form.password && (
            <div className="strength" data-score={pwd.score}>
              <span />
              <span />
              <span />
              <span />
              <em>{pwd.label}</em>
            </div>
          )}
        </Field>
        <label className="check-line">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            J'accepte les <Link to="/conditions" className="link">conditions d'utilisation</Link> et la{" "}
            <Link to="/confidentialite" className="link">politique de confidentialité</Link>.
          </span>
        </label>
        {mutation.isError && !Object.keys(fields).length && <Notice tone="error">{errorMessage(mutation.error)}</Notice>}
        <Button type="submit" variant="signal" size="lg" block loading={mutation.isPending} disabled={!accepted}>
          Créer mon radar
        </Button>
      </form>
      <p className="auth-switch">
        Déjà inscrit ? <Link to="/connexion" className="link">Se connecter</Link>
      </p>
    </AuthShell>
  );
}
