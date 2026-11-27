import { BriefcaseBusiness, Building2, Megaphone } from "lucide-react";
import { useTaxonomy } from "../lib/hooks";
import type { Profile, ProfileKind } from "../lib/types";
import { ChipGroup, Field, Input, Select, TagInput, Textarea, Toggle } from "./ui";

export const EMPTY_PROFILE: Profile = {
  organization_name: "",
  org_type: "freelance",
  description: "",
  sectors: [],
  skills: [],
  countries: ["SN"],
  keywords_include: [],
  keywords_exclude: [],
  certifications: [],
  opportunity_kinds: [],
  budget_min: null,
  budget_max: null,
  team_size: null,
  past_references: "",
  profile_kind: "organization",
  job_title: "",
  contract_types: [],
  experience_level: null,
  remote_ok: false,
};

/** Types d'offres proposés par défaut à un candidat (identiques au serveur). */
export const CANDIDATE_KINDS = ["job", "competition", "program"];

/** Passe d'un type de profil à l'autre en gardant ce qui reste valable. */
export function switchProfileKind(profile: Profile, kind: ProfileKind): Profile {
  if (profile.profile_kind === kind) return profile;
  return {
    ...profile,
    profile_kind: kind,
    opportunity_kinds:
      kind === "candidate" ? CANDIDATE_KINDS : kind === "recruiter" ? [] : profile.opportunity_kinds.filter((k) => k !== "job"),
  };
}

export function ProfileKindPicker({ value, onChange }: { value: ProfileKind; onChange: (kind: ProfileKind) => void }) {
  const choices: [ProfileKind, typeof Building2, string, string][] = [
    ["organization", Building2, "Je cherche des marchés", "Entreprise, freelance, ONG, startup : appels d'offres, financements, concours."],
    ["candidate", BriefcaseBusiness, "Je cherche un emploi", "CDI, CDD, stage, alternance, mission freelance ou volontariat."],
    ["recruiter", Megaphone, "Je recrute", "Publie tes offres d'emploi : Arah! les propose aux candidats qui correspondent."],
  ];
  return (
    <div className="choice-grid" role="group" aria-label="Type de profil">
      {choices.map(([kind, Icon, title, text]) => (
        <button key={kind} type="button" className="choice choice-icon" aria-pressed={value === kind} onClick={() => onChange(kind)}>
          <Icon aria-hidden />
          <strong>{title}</strong>
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}

function MoneyInput({ value, onChange, id }: { value: number | null; onChange: (v: number | null) => void; id: string }) {
  return (
    <div className="money-input">
      <Input
        id={id}
        inputMode="numeric"
        value={value == null ? "" : value.toLocaleString("fr-FR").replace(/\u202f/g, " ")}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? Math.min(Number(digits), 100_000_000_000) : null);
        }}
        placeholder="—"
      />
      <span>F CFA</span>
    </div>
  );
}

export function ProfileForm({
  value,
  onChange,
  errors = {},
  advanced = true,
}: {
  value: Profile;
  onChange: (value: Profile) => void;
  errors?: Record<string, string>;
  advanced?: boolean;
}) {
  const { data: taxonomy } = useTaxonomy();
  const set = <K extends keyof Profile>(key: K, v: Profile[K]) => onChange({ ...value, [key]: v });

  if (value.profile_kind === "candidate") {
    return <CandidateForm value={value} set={set} advanced={advanced} errors={errors} />;
  }
  if (value.profile_kind === "recruiter") {
    return <RecruiterForm value={value} set={set} />;
  }

  return (
    <div className="profile-form">
      <div className="form-grid">
        <Field label="Nom de ta structure" htmlFor="org">
          <Input id="org" value={value.organization_name} onChange={(e) => set("organization_name", e.target.value)} placeholder="Ex. Studio Teranga" />
        </Field>
        <Field label="Tu es" htmlFor="orgtype">
          <Select id="orgtype" value={value.org_type} onChange={(e) => set("org_type", e.target.value)}>
            {taxonomy?.org_types.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Tes secteurs" hint="Jusqu'à 6. C'est le critère le plus important pour le tri." error={errors.sectors}>
        <ChipGroup options={taxonomy?.sectors ?? []} value={value.sectors} onChange={(v) => set("sectors", v)} max={6} />
      </Field>

      <Field label="Tes compétences et savoir-faire" hint="Appuie sur Entrée après chaque élément.">
        <TagInput value={value.skills} onChange={(v) => set("skills", v)} placeholder="Ex. développement web, formation, audit…" />
      </Field>

      <Field label="Mots-clés à surveiller" hint="Ce que tu veux voir apparaître dans les offres.">
        <TagInput value={value.keywords_include} onChange={(v) => set("keywords_include", v)} placeholder="Ex. plateforme, application mobile, chatbot…" />
      </Field>

      <Field label="Mots-clés à exclure" hint="Les offres qui les contiennent ne te seront jamais proposées.">
        <TagInput value={value.keywords_exclude} onChange={(v) => set("keywords_exclude", v)} placeholder="Ex. travaux, fourniture de véhicules…" tone="danger" />
      </Field>

      <Field label="Pays où tu peux intervenir">
        <ChipGroup options={taxonomy?.countries ?? []} value={value.countries} onChange={(v) => set("countries", v)} />
      </Field>

      <Field label="Types d'offres qui t'intéressent" hint="Laisse vide pour tout recevoir, sauf les offres d'emploi.">
        <ChipGroup options={taxonomy?.opportunity_kinds.filter((k) => k.value !== "other") ?? []} value={value.opportunity_kinds} onChange={(v) => set("opportunity_kinds", v)} />
      </Field>

      <div className="form-grid">
        <Field label="Montant minimum visé" htmlFor="bmin" error={errors.budget_min}>
          <MoneyInput id="bmin" value={value.budget_min} onChange={(v) => set("budget_min", v)} />
        </Field>
        <Field label="Montant maximum que tu peux porter" htmlFor="bmax" error={errors.budget_max}>
          <MoneyInput id="bmax" value={value.budget_max} onChange={(v) => set("budget_max", v)} />
        </Field>
      </div>

      {advanced && (
        <>
          <Field label="Présentation de ta structure" hint="Utilisée par le Rédacteur pour tes brouillons de réponse.">
            <Textarea value={value.description} onChange={(e) => set("description", e.target.value)} rows={4} maxLength={6000} />
          </Field>
          <Field label="Références passées" hint="Missions réalisées, clients, résultats. Une par ligne.">
            <Textarea value={value.past_references} onChange={(e) => set("past_references", e.target.value)} rows={4} maxLength={6000} />
          </Field>
          <div className="form-grid">
            <Field label="Certifications, agréments" hint="Ex. ISO 9001, agrément BTP…">
              <TagInput value={value.certifications} onChange={(v) => set("certifications", v)} placeholder="Ajouter" />
            </Field>
            <Field label="Taille de l'équipe" htmlFor="team">
              <Input
                id="team"
                type="number"
                min={1}
                value={value.team_size ?? ""}
                onChange={(e) => set("team_size", e.target.value ? Math.max(1, Number(e.target.value)) : null)}
              />
            </Field>
          </div>
        </>
      )}
    </div>
  );
}

type Setter = <K extends keyof Profile>(key: K, v: Profile[K]) => void;

function CandidateForm({
  value,
  set,
  advanced,
  errors,
}: {
  value: Profile;
  set: Setter;
  advanced: boolean;
  errors: Record<string, string>;
}) {
  const { data: taxonomy } = useTaxonomy();
  const kinds = (taxonomy?.opportunity_kinds ?? []).filter((k) => ["job", "competition", "program", "grant", "consultancy"].includes(k.value));
  return (
    <div className="profile-form">
      <div className="form-grid">
        <Field label="Ton nom" htmlFor="name">
          <Input id="name" value={value.organization_name} onChange={(e) => set("organization_name", e.target.value)} placeholder="Ex. Awa Ndiaye" />
        </Field>
        <Field label="Métier ou poste recherché" htmlFor="jobtitle" error={errors.job_title}>
          <Input id="jobtitle" value={value.job_title} onChange={(e) => set("job_title", e.target.value)} placeholder="Ex. développeuse web, comptable, chargé de communication" />
        </Field>
      </div>

      <Field label="Contrats recherchés" hint="Laisse vide pour tout recevoir.">
        <ChipGroup options={taxonomy?.contract_types ?? []} value={value.contract_types} onChange={(v) => set("contract_types", v)} />
      </Field>

      <Field label="Ton niveau d'expérience" htmlFor="level">
        <Select id="level" value={value.experience_level ?? ""} onChange={(e) => set("experience_level", e.target.value || null)}>
          <option value="">Non précisé</option>
          {taxonomy?.experience_levels.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Tes compétences" hint="Appuie sur Entrée après chaque élément. C'est ce qui compte le plus pour le tri.">
        <TagInput value={value.skills} onChange={(v) => set("skills", v)} placeholder="Ex. React, comptabilité OHADA, Canva, anglais…" />
      </Field>

      <Field label="Secteurs qui t'intéressent" hint="Facultatif, jusqu'à 6." error={errors.sectors}>
        <ChipGroup options={taxonomy?.sectors ?? []} value={value.sectors} onChange={(v) => set("sectors", v)} max={6} />
      </Field>

      <Field label="Pays où tu peux travailler">
        <ChipGroup options={taxonomy?.countries ?? []} value={value.countries} onChange={(v) => set("countries", v)} />
      </Field>

      <div className="toggle-row">
        <div>
          <strong>J'accepte le télétravail</strong>
          <span className="small muted">Les postes à distance te seront proposés, quel que soit le pays.</span>
        </div>
        <Toggle label="J'accepte le télétravail" checked={value.remote_ok} onChange={(v) => set("remote_ok", v)} />
      </div>

      <Field label="Mots-clés à exclure" hint="Les offres qui les contiennent ne te seront jamais proposées.">
        <TagInput value={value.keywords_exclude} onChange={(v) => set("keywords_exclude", v)} placeholder="Ex. commercial terrain, travail de nuit…" tone="danger" />
      </Field>

      <Field label="À recevoir aussi" hint="Les offres d'emploi sont toujours incluses.">
        <ChipGroup
          options={kinds}
          value={value.opportunity_kinds.length ? value.opportunity_kinds : CANDIDATE_KINDS}
          onChange={(v) => set("opportunity_kinds", v.includes("job") ? v : ["job", ...v])}
        />
      </Field>

      {advanced && (
        <>
          <Field label="Ton parcours" hint="Formation, expériences, ce que tu cherches. Utilisé par le Rédacteur pour tes lettres de motivation.">
            <Textarea value={value.description} onChange={(e) => set("description", e.target.value)} rows={4} maxLength={6000} />
          </Field>
          <Field label="Expériences marquantes" hint="Postes, missions, résultats. Une par ligne.">
            <Textarea value={value.past_references} onChange={(e) => set("past_references", e.target.value)} rows={4} maxLength={6000} />
          </Field>
        </>
      )}
    </div>
  );
}

function RecruiterForm({ value, set }: { value: Profile; set: Setter }) {
  const { data: taxonomy } = useTaxonomy();
  return (
    <div className="profile-form">
      <div className="form-grid">
        <Field label="Nom de ta structure" htmlFor="org">
          <Input id="org" value={value.organization_name} onChange={(e) => set("organization_name", e.target.value)} placeholder="Ex. Cabinet Teranga RH" />
        </Field>
        <Field label="Type de structure" htmlFor="orgtype">
          <Select id="orgtype" value={value.org_type} onChange={(e) => set("org_type", e.target.value)}>
            {taxonomy?.org_types.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Secteurs dans lesquels tu recrutes" hint="Facultatif, jusqu'à 3. Ils pré-remplissent tes offres.">
        <ChipGroup options={taxonomy?.sectors ?? []} value={value.sectors} onChange={(v) => set("sectors", v.slice(0, 3))} max={3} />
      </Field>
      <Field label="Pays où tu recrutes">
        <ChipGroup options={taxonomy?.countries ?? []} value={value.countries} onChange={(v) => set("countries", v)} />
      </Field>
      <Field label="Présentation" hint="Facultatif. Quelques mots sur ta structure.">
        <Textarea value={value.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={6000} />
      </Field>
    </div>
  );
}
