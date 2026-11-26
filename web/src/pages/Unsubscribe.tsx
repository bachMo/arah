import { BellOff, CircleAlert } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { ButtonLink, EmptyState } from "../components/ui";
import { useDocumentTitle } from "../lib/hooks";

export default function Unsubscribe() {
  useDocumentTitle("Désinscription");
  const [params] = useSearchParams();
  const ok = params.get("ok") === "1";
  return (
    <div className="page container">
      <div className="card" style={{ maxWidth: 620, margin: "0 auto" }}>
        <EmptyState
          icon={ok ? <BellOff /> : <CircleAlert />}
          title={ok ? "C'est noté, tu ne recevras plus d'alertes" : "Ce lien de désinscription n'est pas valide"}
          action={<ButtonLink to="/reglages">Régler mes alertes</ButtonLink>}
        >
          {ok
            ? "Ton radar reste accessible à tout moment. Tu peux réactiver les alertes quand tu veux depuis tes réglages."
            : "Connecte-toi et désactive les alertes depuis tes réglages."}
        </EmptyState>
      </div>
    </div>
  );
}
