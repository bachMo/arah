import { Compass } from "lucide-react";
import { ButtonLink, EmptyState } from "../components/ui";
import { useDocumentTitle } from "../lib/hooks";

export function NotFound() {
  useDocumentTitle("Page introuvable");
  return (
    <div className="page container">
      <EmptyState
        icon={<Compass />}
        title="Cette page n'existe pas (ou plus)"
        action={<ButtonLink to="/">Revenir à l'accueil</ButtonLink>}
      >
        Le lien est peut-être incomplet, ou l'offre a été retirée par son émetteur.
      </EmptyState>
    </div>
  );
}
