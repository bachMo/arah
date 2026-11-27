import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Field, Input, Notice } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { homePath, useAuth } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/hooks";
import type { User } from "../../lib/types";
import { AuthShell } from "./AuthShell";

export default function Reset() {
  useDocumentTitle("Nouveau mot de passe");
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const token = params.get("token") ?? "";
  const mutation = useMutation({
    mutationFn: () => api.post<User>("/auth/reset-password", { token, password }),
    onSuccess: (user) => {
      setUser(user);
      navigate(homePath(user), { replace: true });
    },
  });
  const mismatch = confirm.length > 0 && confirm !== password;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mismatch) mutation.mutate();
  };
  if (!token) {
    return (
      <AuthShell title="Lien incomplet">
        <Notice tone="error">Ce lien de réinitialisation est incomplet. Fais une nouvelle demande.</Notice>
        <p className="auth-switch">
          <Link to="/mot-de-passe-oublie" className="link">Nouvelle demande</Link>
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choisis un nouveau mot de passe">
      <form className="stack" onSubmit={submit}>
        <Field label="Nouveau mot de passe" htmlFor="password" hint="8 caractères minimum, lettres et chiffres.">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirme-le" htmlFor="confirm" error={mismatch ? "Les deux mots de passe ne correspondent pas." : undefined}>
          <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {mutation.isError && <Notice tone="error">{errorMessage(mutation.error)}</Notice>}
        <Button type="submit" variant="signal" size="lg" block loading={mutation.isPending} disabled={mismatch || !password}>
          Enregistrer et me connecter
        </Button>
      </form>
    </AuthShell>
  );
}
