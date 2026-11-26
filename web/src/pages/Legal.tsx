import { useConfig, useDocumentTitle } from "../lib/hooks";

type PageKey = "about" | "privacy" | "terms";

const TITLES: Record<PageKey, [string, string]> = {
  about: ["À propos", "d'Arah!"],
  privacy: ["Politique", "de confidentialité"],
  terms: ["Conditions", "d'utilisation"],
};

export default function Legal({ page }: { page: PageKey }) {
  const [first, second] = TITLES[page];
  useDocumentTitle(`${first} ${second}`);
  const { data: config } = useConfig();
  const contact = config?.contact_email ?? "";
  const github = config?.github_url ?? "";

  return (
    <div className="page">
      <div className="container container-narrow prose">
        <span className="eyebrow">Le projet</span>
        <h1 className="page-title">
          {first} <span className="serif">{second}</span>
        </h1>

        {page === "about" && (
          <>
            <p className="lead">
              « Arah ! », c'est le cri du guetteur qui prévient : attention, regarde ! L'agent fait exactement ça avec les
              opportunités.
            </p>
            <h2>Pourquoi ce projet</h2>
            <p>
              Appels d'offres, financements, concours et programmes sont publiés sur des dizaines de sites, avec des conditions et
              des dates limites différentes. Chercher prend des heures, et beaucoup d'opportunités sont ratées, surtout par les
              petites structures qui n'ont pas d'équipe dédiée.
            </p>
            <p>
              Arah! fait cette veille pour toi, chaque matin, explique pourquoi une offre te correspond et t'aide à préparer ta
              réponse. Il ne fait jamais rien d'irréversible sans ton accord.
            </p>
            <h2>Gratuit et open source</h2>
            <p>
              Toutes les fonctions sont gratuites pour tout le monde. Le code est public : tu peux le lire, l'améliorer, ajouter
              une source ou héberger ta propre instance. Le projet vit grâce aux dons, et les coûts comme les dons sont affichés
              publiquement chaque mois.
            </p>
            <h2>Contribuer</h2>
            <p>
              Signale une erreur dans une fiche, propose une source ou une amélioration sur{" "}
              <a className="link" href={github} target="_blank" rel="noreferrer">
                GitHub
              </a>
              {contact && (
                <>
                  , ou écris à{" "}
                  <a className="link" href={`mailto:${contact}`}>
                    {contact}
                  </a>
                </>
              )}
              .
            </p>
          </>
        )}

        {page === "privacy" && (
          <>
            <p className="lead">Arah! collecte le minimum nécessaire pour te rendre service, et rien n'est revendu.</p>
            <h2>Ce que nous conservons</h2>
            <ul>
              <li>Ton adresse e-mail, ton nom et ton mot de passe (chiffré, jamais lisible).</li>
              <li>Ton profil de veille : secteurs, compétences, pays, mots-clés, montants visés, présentation et références.</li>
              <li>Les offres que tu suis, tes avis (« pertinent », « pas pour moi ») et tes brouillons de réponse.</li>
              <li>Les informations de ton coffre : type de document, numéro et dates. Aucun fichier n'est stocké.</li>
            </ul>
            <h2>À quoi elles servent</h2>
            <p>
              Uniquement à trier les offres pour toi, t'envoyer tes alertes et rappels, et préparer tes brouillons. Pour ces deux
              dernières fonctions, ton profil et le texte de l'offre peuvent être transmis au fournisseur de modèles d'IA configuré
              par l'instance, le temps du traitement.
            </p>
            <h2>Ce qui est public</h2>
            <p>
              Le journal de l'agent et le compteur des coûts et des dons sont publics, mais ne contiennent aucune donnée
              personnelle. Ton nom n'apparaît parmi les donateurs que si tu l'as choisi.
            </p>
            <h2>Tes droits</h2>
            <p>
              Depuis tes réglages, tu peux à tout moment télécharger toutes tes données, modifier ton profil, désactiver les
              alertes ou supprimer définitivement ton compte. Chaque e-mail contient un lien de désinscription en un clic.
            </p>
            <h2>Cookies</h2>
            <p>Un seul cookie, indispensable, garde ta session ouverte. Aucun cookie publicitaire ni de mesure d'audience tierce.</p>
          </>
        )}

        {page === "terms" && (
          <>
            <p className="lead">Arah! est un service gratuit, fourni tel quel, pour t'aider à trouver et préparer des opportunités.</p>
            <h2>Les offres</h2>
            <p>
              Les offres proviennent de sources publiques. Les fiches sont des résumés automatiques qui peuvent contenir des
              erreurs : vérifie toujours les conditions, les pièces et la date limite dans l'avis original avant de déposer. Les
              offres restent la propriété de leurs émetteurs.
            </p>
            <h2>Les scores et les brouillons</h2>
            <p>
              Les scores d'adéquation et les brouillons de réponse sont des aides à la décision. Ils sont toujours à relire : tu
              restes seul responsable de ce que tu soumets.
            </p>
            <h2>Utilisation correcte</h2>
            <p>
              Pas d'utilisation abusive : création massive de comptes, collecte automatisée du site, tentative de contourner les
              limites d'utilisation de l'IA. Les comptes concernés peuvent être suspendus.
            </p>
            <h2>Logiciel libre</h2>
            <p>
              Le code d'Arah! est publié sous licence MIT. Tu peux l'utiliser, le modifier et l'héberger librement, dans le respect
              de cette licence.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
