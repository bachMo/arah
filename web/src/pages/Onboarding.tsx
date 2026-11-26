import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, MailWarning, PenLine, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EMPTY_PROFILE, ProfileForm } from "../components/ProfileForm";
import { Button, Field, Notice, Textarea } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useConfig, useDocumentTitle } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { AlertSettings, Profile, ProfileSuggestion } from "../lib/types";

const EXAMPLE =
  "Je suis développeur freelance à Dakar. Je crée des sites web, des applications mobiles et des chatbots pour des PME et des ONG, surtout dans l'agriculture et la santé. Je peux gérer des projets jusqu'à 50 millions de F CFA au Sénégal et dans la sous-région.";

const STEPS = ["Ton activité", "Ton profil", "Tes alertes"];

export default function Onboarding() {
  useDocumentTitle("Bienvenue");
  const { user, refresh } = useAuth();
  const { data: config } = useConfig();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [description, setDescription] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [method, setMethod] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Pick<AlertSettings, "alert_frequency" | "alert_min_score">>({
    alert_frequency: "daily",
    alert_min_score: 60,
  });

  const existing = useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile | null>("/profile") });
  useEffect(() => {
    if (existing.data) {
      setProfile({ ...EMPTY_PROFILE, ...existing.data });
      setDescription(existing.data.description);
    }
  }, [existing.data]);

  const suggest = useMutation({
    mutationFn: () => api.post<ProfileSuggestion>("/profile/suggest", { description }),
    onSuccess: (s) => {
      const { method: m, ...fields } = s;
      setProfile((p) => ({
        ...p,
        ...fields,
        organization_name: fields.organization_name || p.organization_name,
        description,
        budget_min: fields.budget_min ?? p.budget_min,
        budget_max: fields.budget_max ?? p.budget_max,
      }));
      setMethod(m);
      setStep(1);
    },
  });

  const finish = useMutation({
    mutationFn: async () => {
      await api.put("/profile", { ...profile, description: profile.description || description });
      const current = await api.get<AlertSettings>("/settings/alerts");
      await api.put("/settings/alerts", { ...current, ...alerts });
    },
    onSuccess: async () => {
      await refresh();
      queryClient.invalidateQueries({ queryKey: ["radar"] });
      toast.show("Ton radar est prêt. L'agent cherche tes premières offres…");
      navigate("/radar?bienvenue=1", { replace: true });
    },
  });
  const finishErrors = finish.error instanceof ApiError ? finish.error.fields : {};
  const canContinue = profile.sectors.length > 0 || profile.skills.length > 0 || profile.keywords_include.length > 0;

  return (
    <div className="page onboarding">
      <div className="container container-narrow">
        <div className="steps" aria-label="Étapes">
          {STEPS.map((label, i) => (
            <div key={label} className={clsx("step", i === step && "is-current", i < step && "is-done")}>
              <span className="step-num">{i < step ? <Check /> : i + 1}</span>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </div>

        {user && !user.is_verified && (
          <Notice tone="info" icon={<MailWarning />}>
            Un e-mail de confirmation vient de partir vers <strong>{user.email}</strong>. Confirme ton adresse pour recevoir tes
            alertes.
          </Notice>
        )}

        {step === 0 && (
          <section className="onboarding-card card card-pad">
            <span className="eyebrow">Étape 1</span>
            <h1 className="onboarding-title">
              Raconte-nous ce que tu fais, <span className="serif">en quelques phrases.</span>
            </h1>
            <p className="muted">
              Ton métier, tes clients, tes secteurs, où tu interviens, les montants que tu peux porter.
              {config?.llm.enabled ? " L'agent remplit ton profil, tu corriges." : " On en déduit un premier profil, tu corriges."}
            </p>
            <Field label="Ton activité" htmlFor="desc" hint={`${description.length} / 6000 caractères`}>
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={6} maxLength={6000} placeholder={EXAMPLE} />
            </Field>
            {!description && (
              <button type="button" className="link small" onClick={() => setDescription(EXAMPLE)}>
                Utiliser l'exemple
              </button>
            )}
            {suggest.isError && <Notice tone="error">{errorMessage(suggest.error)}</Notice>}
            <div className="onboarding-actions">
              <Button variant="ghost" icon={<PenLine />} onClick={() => setStep(1)}>
                Remplir moi-même
              </Button>
              <Button
                variant="signal"
                size="lg"
                icon={<Sparkles />}
                loading={suggest.isPending}
                disabled={description.trim().length < 20}
                onClick={() => suggest.mutate()}
              >
                Remplir mon profil
              </Button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="onboarding-card card card-pad">
            <span className="eyebrow">Étape 2</span>
            <h1 className="onboarding-title">
              Vérifie ton profil. <span className="serif">C'est lui qui guide le tri.</span>
            </h1>
            {method && (
              <Notice tone="success" icon={<Sparkles />}>
                Profil pré-rempli ({method}). Corrige ce qui ne va pas, ajoute ce qui manque.
              </Notice>
            )}
            <ProfileForm value={profile} onChange={setProfile} errors={finishErrors} advanced={false} />
            <div className="onboarding-actions">
              <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setStep(0)}>
                Retour
              </Button>
              <Button variant="signal" size="lg" disabled={!canContinue} onClick={() => setStep(2)}>
                Continuer <ArrowRight />
              </Button>
            </div>
            {!canContinue && <p className="small muted">Choisis au moins un secteur ou une compétence.</p>}
          </section>
        )}

        {step === 2 && (
          <section className="onboarding-card card card-pad">
            <span className="eyebrow">Étape 3</span>
            <h1 className="onboarding-title">
              Quand veux-tu <span className="serif">être prévenu ?</span>
            </h1>
            <div className="choice-grid">
              {(
                [
                  ["daily", "Chaque matin", "Le résumé du jour, seulement s'il y a du nouveau."],
                  ["weekly", "Chaque lundi", "Un récapitulatif de la semaine."],
                  ["off", "Jamais", "Tu consultes ton radar quand tu veux."],
                ] as const
              ).map(([value, title, text]) => (
                <button
                  key={value}
                  type="button"
                  className="choice"
                  aria-pressed={alerts.alert_frequency === value}
                  onClick={() => setAlerts({ ...alerts, alert_frequency: value })}
                >
                  <strong>{title}</strong>
                  <span>{text}</span>
                </button>
              ))}
            </div>
            <Field label={`Seuil d'alerte : ${alerts.alert_min_score} / 100`} hint="Tu ne reçois que les offres au-dessus de ce score.">
              <input
                type="range"
                min={30}
                max={90}
                step={5}
                value={alerts.alert_min_score}
                onChange={(e) => setAlerts({ ...alerts, alert_min_score: Number(e.target.value) })}
                aria-label="Seuil d'alerte"
              />
            </Field>
            <Notice tone="info">
              Les rappels de dates limites (J-7, J-3, J-1) sont activés pour les offres que tu suis.
              {config?.whatsapp_enabled ? "" : " Les alertes WhatsApp arriveront dès que les dons le permettront."}
            </Notice>
            {finish.isError && <Notice tone="error">{errorMessage(finish.error)}</Notice>}
            <div className="onboarding-actions">
              <Button variant="ghost" icon={<ArrowLeft />} onClick={() => setStep(1)}>
                Retour
              </Button>
              <Button variant="signal" size="lg" loading={finish.isPending} onClick={() => finish.mutate()}>
                Voir mes offres <ArrowRight />
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
