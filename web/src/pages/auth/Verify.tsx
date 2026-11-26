import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ButtonLink, Notice } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useDocumentTitle } from "../../lib/hooks";
import type { User } from "../../lib/types";
import { AuthShell } from "./AuthShell";

export default function Verify() {
  useDocumentTitle("Confirmation de l'adresse");
  const [params] = useSearchParams();
  const { setUser } = useAuth();
  const started = useRef(false);
  const token = params.get("token") ?? "";
  const mutation = useMutation({
    mutationFn: () => api.post<User>("/auth/verify", { token }),
    onSuccess: (user) => setUser(user),
  });
  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      mutation.mutate();
    }
  }, [token, mutation]);

  return (
    <AuthShell title={mutation.isSuccess ? "Adresse confirmée" : "Confirmation en cours"}>
      {mutation.isPending && (
        <div className="row">
          <span className="spinner" /> Vérification du lien…
        </div>
      )}
      {mutation.isSuccess && (
        <div className="stack">
          <Notice tone="success" icon={<CheckCircle2 />}>
            C'est tout bon : tu recevras désormais tes alertes par e-mail.
          </Notice>
          <ButtonLink to={mutation.data.has_profile ? "/radar" : "/bienvenue"} variant="signal">
            Continuer
          </ButtonLink>
        </div>
      )}
      {(mutation.isError || !token) && (
        <div className="stack">
          <Notice tone="error">{token ? errorMessage(mutation.error) : "Ce lien est incomplet."}</Notice>
          <p className="small muted">
            Connecte-toi puis demande un nouveau lien depuis tes <Link className="link" to="/reglages">réglages</Link>.
          </p>
        </div>
      )}
    </AuthShell>
  );
}
