import { useTaxonomy } from "../lib/hooks";
import type { Profile } from "../lib/types";
import { ChipGroup, Field, Input, Select, TagInput, Textarea } from "./ui";

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
};

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

      <Field label="Types d'offres qui t'intéressent" hint="Laisse vide pour tout recevoir.">
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
