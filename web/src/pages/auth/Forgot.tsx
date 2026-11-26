import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Field, Input, Notice } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useDocumentTitle } from "../../lib/hooks";
import { AuthShell } from "./AuthShell";

export default function Forgot() {
  useDocumentTitle("Mot de passe oublié");
  const [email, setEmail] = useState("");
  const mutation = useMutation({ mutationFn: () => api.post<{ detail: string }>("/auth/forgot-password", { email }) });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };
  return (
    <AuthShell title="Mot de passe oublié" subtitle="Indique ton adresse : on t'envoie un lien pour en choisir un nouveau.">
      {mutation.isSuccess ? (
        <Notice tone="success" icon={<MailCheck />}>
          {mutation.data.detail} Pense à regarder dans tes courriers indésirables.
        </Notice>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Field label="Adresse e-mail" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {mutation.isError && <Notice tone="error">{errorMessage(mutation.error)}</Notice>}
          <Button type="submit" variant="signal" size="lg" block loading={mutation.isPending}>
            Envoyer le lien
          </Button>
        </form>
      )}
      <p className="auth-switch">
        <Link to="/connexion" className="link">Retour à la connexion</Link>
      </p>
    </AuthShell>
  );
}
