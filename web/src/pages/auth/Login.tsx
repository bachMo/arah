import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Input, Notice } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useConfig, useDocumentTitle } from "../../lib/hooks";
import type { User } from "../../lib/types";
import { AuthShell, GoogleButton, OrDivider } from "./AuthShell";

function safeNext(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export default function Login() {
  useDocumentTitle("Se connecter");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const { data: config } = useConfig();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.post<User>("/auth/login", { email, password }),
    onSuccess: (user) => {
      queryClient.clear();
      setUser(user);
      navigate(safeNext(params.get("suite")) ?? (user.has_profile ? "/radar" : "/bienvenue"), { replace: true });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <AuthShell title="Bon retour" subtitle="Ton radar t'attend.">
      {params.get("erreur") === "google" && <Notice tone="error">La connexion avec Google a échoué. Réessaie.</Notice>}
      {config?.google_enabled && (
        <>
          <GoogleButton />
          <OrDivider />
        </>
      )}
      <form className="stack" onSubmit={submit} noValidate>
        <Field label="Adresse e-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field
          label={
            <span className="row" style={{ justifyContent: "space-between", width: "100%" }}>
              Mot de passe
              <Link to="/mot-de-passe-oublie" className="link small">
                Oublié ?
              </Link>
            </span>
          }
          htmlFor="password"
        >
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {mutation.isError && <Notice tone="error">{errorMessage(mutation.error)}</Notice>}
        <Button type="submit" variant="signal" size="lg" block loading={mutation.isPending}>
          Se connecter
        </Button>
      </form>
      <p className="auth-switch">
        Pas encore de compte ? <Link to="/inscription" className="link">Crée ton radar</Link>
      </p>
    </AuthShell>
  );
}
