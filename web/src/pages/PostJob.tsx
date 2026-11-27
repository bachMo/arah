import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, MailWarning, Send, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, ButtonLink, ChipGroup, Field, Input, Notice, Select, Textarea, Toggle } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";
import { useDocumentTitle, useTaxonomy } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { JobSubmission } from "../lib/types";

type Form = {
  title: string;
  company: string;
  contract_type: string;
  experience_level: string;
  country: string;
  location: string;
  remote: boolean;
  sectors: string[];
  description: string;
  apply_url: string;
  apply_email: string;
  deadline: string;
};

const EMPTY: Form = {
  title: "",
  company: "",
  contract_type: "cdi",
  experience_level: "",
  country: "SN",
  location: "",
  remote: false,
  sectors: [],
  description: "",
  apply_url: "",
  apply_email: "",
  deadline: "",
};

const STATUS: Record<JobSubmission["status"], { label: string; icon: typeof Clock3; tone: string }> = {
  pending: { label: "En attente de validation", icon: Clock3, tone: "badge-sun" },
  approved: { label: "En ligne", icon: CheckCircle2, tone: "badge-leaf" },
  rejected: { label: "Non publiée", icon: XCircle, tone: "badge-signal" },
};

export default function PostJob() {
  useDocumentTitle("Publier une offre d'emploi");
  const { user } = useAuth();

  return (
    <div className="page">
      <div className="container container-narrow">
        <div className="page-head">
          <div>
            <span className="eyebrow">Recruteurs</span>
            <h1 className="page-title">
              Publie ton offre, <span className="serif">gratuitement.</span>
            </h1>
            <p className="lead">
              Arah! la propose directement aux candidats dont le profil correspond : métier, compétences, contrat, niveau,
              lieu. Chaque offre est relue avant sa mise en ligne.
            </p>
          </div>
        </div>
        {user ? (
          <SubmissionForm verified={user.is_verified} email={user.email} />
        ) : (
          <div className="card card-pad stack">
            <p>Pour publier une offre, crée ton compte gratuit ou connecte-toi. Il sert aussi à suivre la validation de tes offres.</p>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <ButtonLink to="/inscription?suite=/publier-une-offre" variant="signal">
                Créer mon compte
              </ButtonLink>
              <ButtonLink to="/connexion?suite=/publier-une-offre" variant="ghost">
                J'ai déjà un compte
              </ButtonLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmissionForm({ verified, email }: { verified: boolean; email: string }) {
  const { data: taxonomy } = useTaxonomy();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>({ ...EMPTY, apply_email: email });
  const [sent, setSent] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const mine = useQuery({ queryKey: ["submissions"], queryFn: () => api.get<JobSubmission[]>("/jobs/submissions/mine") });
  const submit = useMutation({
    mutationFn: () =>
      api.post<JobSubmission>("/jobs/submissions", {
        ...form,
        experience_level: form.experience_level || null,
        apply_email: form.apply_email.trim() || null,
        deadline: form.deadline || null,
      }),
    onSuccess: () => {
      setSent(true);
      setForm({ ...EMPTY, apply_email: email });
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
      toast.show("Offre envoyée. Tu recevras un e-mail dès qu'elle sera validée.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  const errors = submit.error instanceof ApiError ? submit.error.fields : {};

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate();
  };

  return (
    <>
      {sent && (
        <Notice tone="success" icon={<CheckCircle2 />}>
          Ton offre est bien reçue. Elle sera relue puis publiée, et tu recevras un e-mail à chaque étape.
        </Notice>
      )}
      {!verified && (
        <Notice tone="info" icon={<MailWarning />}>
          Confirme ton adresse e-mail (lien envoyé à <strong>{email}</strong>) pour pouvoir publier une offre.
        </Notice>
      )}

      <form className="card card-pad profile-form" onSubmit={onSubmit}>
        <div className="form-grid">
          <Field label="Intitulé du poste" htmlFor="title" error={errors.title}>
            <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex. Comptable confirmé·e" required maxLength={300} />
          </Field>
          <Field label="Entreprise ou organisation" htmlFor="company" error={errors.company}>
            <Input id="company" value={form.company} onChange={(e) => set("company", e.target.value)} required maxLength={200} />
          </Field>
        </div>

        <div className="form-grid">
          <Field label="Contrat" htmlFor="contract" error={errors.contract_type}>
            <Select id="contract" value={form.contract_type} onChange={(e) => set("contract_type", e.target.value)}>
              {taxonomy?.contract_types.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Expérience demandée" htmlFor="level">
            <Select id="level" value={form.experience_level} onChange={(e) => set("experience_level", e.target.value)}>
              <option value="">Non précisée</option>
              {taxonomy?.experience_levels.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="form-grid">
          <Field label="Pays" htmlFor="country">
            <Select id="country" value={form.country} onChange={(e) => set("country", e.target.value)}>
              {taxonomy?.countries
                .filter((c) => !["AO", "AF", "INT"].includes(c.value))
                .map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Ville" htmlFor="city">
            <Input id="city" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Ex. Dakar" maxLength={160} />
          </Field>
        </div>

        <div className="toggle-row">
          <div>
            <strong>Télétravail possible</strong>
            <span className="small muted">Le poste peut s'exercer à distance, en partie ou en totalité.</span>
          </div>
          <Toggle label="Télétravail possible" checked={form.remote} onChange={(v) => set("remote", v)} />
        </div>

        <Field label="Secteurs" hint="Jusqu'à 3.">
          <ChipGroup options={taxonomy?.sectors ?? []} value={form.sectors} onChange={(v) => set("sectors", v)} max={3} />
        </Field>

        <Field
          label="Description du poste"
          htmlFor="desc"
          hint={`Missions, profil recherché, conditions. ${form.description.length} / 12000 caractères (80 au minimum).`}
          error={errors.description}
        >
          <Textarea id="desc" value={form.description} onChange={(e) => set("description", e.target.value)} rows={9} maxLength={12000} required />
        </Field>

        <div className="form-grid">
          <Field label="Lien pour postuler" htmlFor="url" hint="Facultatif si tu indiques un e-mail." error={errors.apply_url}>
            <Input id="url" type="url" value={form.apply_url} onChange={(e) => set("apply_url", e.target.value)} placeholder="https://" />
          </Field>
          <Field label="E-mail de candidature" htmlFor="mail" error={errors.apply_email}>
            <Input id="mail" type="email" value={form.apply_email} onChange={(e) => set("apply_email", e.target.value)} />
          </Field>
        </div>

        <Field label="Date limite de candidature" htmlFor="deadline" hint="Facultatif." error={errors.deadline}>
          <Input id="deadline" type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} />
        </Field>

        {submit.isError && <Notice tone="error">{errorMessage(submit.error)}</Notice>}

        <p className="tiny muted">
          En publiant, tu confirmes que l'offre est réelle, gratuite pour les candidats et conforme aux{" "}
          <Link className="link" to="/conditions">
            conditions d'utilisation
          </Link>
          .
        </p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button type="submit" variant="signal" size="lg" icon={<Send />} loading={submit.isPending} disabled={!verified}>
            Envoyer pour validation
          </Button>
        </div>
      </form>

      {mine.data && mine.data.length > 0 && (
        <section className="submissions">
          <h2 className="section-subtitle">Mes offres proposées</h2>
          <ul className="submission-list">
            {mine.data.map((s) => {
              const status = STATUS[s.status];
              const Icon = status.icon;
              return (
                <li key={s.id} className="card submission-item">
                  <div>
                    <strong>{s.title}</strong>
                    <span className="small muted">
                      {s.company} · proposée le {formatDate(s.created_at)}
                    </span>
                    {s.status === "rejected" && s.review_note && <span className="small">Motif : {s.review_note}</span>}
                  </div>
                  <div className="submission-side">
                    <span className={`badge ${status.tone}`}>
                      <Icon />
                      {status.label}
                    </span>
                    {s.opportunity_id && (
                      <Link className="link small" to={`/offre/${s.opportunity_id}`}>
                        Voir l'offre
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
