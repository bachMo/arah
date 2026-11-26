import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Download, KeyRound, MessageCircle, Save, Trash2, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { EMPTY_PROFILE, ProfileForm } from "../components/ProfileForm";
import { Button, Field, Input, Notice, Select, Skeleton, Tabs, Toggle } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useConfig, useDocumentTitle } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { AlertSettings, Profile } from "../lib/types";

type Tab = "profil" | "alertes" | "compte";

function ProfileTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const query = useQuery({ queryKey: ["profile"], queryFn: () => api.get<Profile | null>("/profile") });
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  useEffect(() => {
    if (query.data) setProfile({ ...EMPTY_PROFILE, ...query.data });
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => api.put<Profile>("/profile", profile),
    onSuccess: async (data) => {
      queryClient.setQueryData(["profile"], data);
      queryClient.invalidateQueries({ queryKey: ["radar"] });
      await refresh();
      toast.show("Profil enregistré. Ton radar est recalculé.");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  if (query.isLoading) return <Skeleton height={480} radius={24} />;
  return (
    <form
      className="card card-pad stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <ProfileForm value={profile} onChange={setProfile} errors={save.error instanceof ApiError ? save.error.fields : {}} />
      <div className="sticky-save">
        <Button type="submit" variant="signal" icon={<Save />} loading={save.isPending}>
          Enregistrer le profil
        </Button>
      </div>
    </form>
  );
}

function AlertsTab() {
  const toast = useToast();
  const { data: config } = useConfig();
  const query = useQuery({ queryKey: ["alerts"], queryFn: () => api.get<AlertSettings>("/settings/alerts") });
  const [form, setForm] = useState<AlertSettings | null>(null);
  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: (body: AlertSettings) => api.put<AlertSettings>("/settings/alerts", body),
    onSuccess: (data) => {
      setForm(data);
      toast.show("Réglages des alertes enregistrés");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  if (!form) return <Skeleton height={360} radius={24} />;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };
  return (
    <form className="card card-pad stack settings-form" onSubmit={submit}>
      <div className="setting-row">
        <div>
          <strong>Fréquence du résumé</strong>
          <p className="small muted">Envoyé seulement s'il y a de nouvelles offres au-dessus de ton seuil.</p>
        </div>
        <Select value={form.alert_frequency} onChange={(e) => setForm({ ...form, alert_frequency: e.target.value as AlertSettings["alert_frequency"] })} style={{ maxWidth: 220 }}>
          <option value="daily">Chaque matin</option>
          <option value="weekly">Chaque lundi</option>
          <option value="off">Jamais</option>
        </Select>
      </div>
      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <strong>Seuil d'alerte : {form.alert_min_score} / 100</strong>
          <p className="small muted">Plus il est haut, moins tu reçois d'offres, mais plus elles te correspondent.</p>
          <input type="range" min={30} max={95} step={5} value={form.alert_min_score} onChange={(e) => setForm({ ...form, alert_min_score: Number(e.target.value) })} aria-label="Seuil d'alerte" />
        </div>
      </div>
      <div className="setting-row">
        <div>
          <strong>Alertes par e-mail</strong>
          <p className="small muted">Le résumé arrive dans ta boîte de réception.</p>
        </div>
        <Toggle label="Alertes par e-mail" checked={form.alert_email} onChange={(v) => setForm({ ...form, alert_email: v })} />
      </div>
      <div className="setting-row">
        <div>
          <strong>Rappels de dates limites</strong>
          <p className="small muted">J-7, J-3 et J-1 pour les offres marquées « Intéressé » ou « En préparation », et expiration des documents du coffre.</p>
        </div>
        <Toggle label="Rappels" checked={form.reminders_enabled} onChange={(v) => setForm({ ...form, reminders_enabled: v })} />
      </div>
      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <strong className="row" style={{ gap: 8 }}>
            <MessageCircle size={18} /> Alertes WhatsApp {!config?.whatsapp_enabled && <span className="badge badge-sun">Bientôt</span>}
          </strong>
          <p className="small muted">
            {config?.whatsapp_enabled
              ? "Reçois ton résumé et tes rappels sur WhatsApp."
              : "Le module est prêt : il sera activé dès que les dons couvriront les frais de messages de Meta."}
          </p>
          {config?.whatsapp_enabled && (
            <Input
              style={{ marginTop: 10, maxWidth: 280 }}
              placeholder="+221 77 123 45 67"
              value={form.whatsapp_number ?? ""}
              onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
            />
          )}
        </div>
        <Toggle label="Alertes WhatsApp" disabled={!config?.whatsapp_enabled} checked={form.alert_whatsapp} onChange={(v) => setForm({ ...form, alert_whatsapp: v })} />
      </div>
      <div className="sticky-save">
        <Button type="submit" variant="signal" icon={<Save />} loading={save.isPending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

function AccountTab() {
  const { user, refresh, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.full_name ?? "");
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const [confirmDelete, setConfirmDelete] = useState("");

  const saveName = useMutation({
    mutationFn: async () => {
      const current = await api.get<AlertSettings>("/settings/alerts");
      return api.put("/settings/alerts", { ...current, full_name: name });
    },
    onSuccess: async () => {
      await refresh();
      toast.show("Nom mis à jour");
    },
  });
  const changePassword = useMutation({
    mutationFn: () => api.post("/auth/change-password", passwords),
    onSuccess: () => {
      setPasswords({ current_password: "", new_password: "" });
      toast.show("Mot de passe modifié. Tes autres sessions sont déconnectées.");
    },
  });
  const exportData = useMutation({
    mutationFn: () => api.get<unknown>("/auth/export"),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mes-donnees-arah.json";
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  const deleteAccount = useMutation({
    mutationFn: () => api.delete("/auth/me"),
    onSuccess: async () => {
      navigate("/", { replace: true });
      await logout();
    },
  });

  if (!user) return null;
  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <section className="card card-pad stack">
        <h2 className="card-title">Identité</h2>
        <div className="form-grid">
          <Field label="Nom affiché" htmlFor="fullname">
            <Input id="fullname" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Adresse e-mail">
            <Input value={user.email} disabled />
          </Field>
        </div>
        <div>
          <Button variant="ghost" size="sm" loading={saveName.isPending} onClick={() => saveName.mutate()} disabled={name === user.full_name}>
            Enregistrer le nom
          </Button>
        </div>
      </section>

      <section className="card card-pad stack">
        <h2 className="card-title row" style={{ gap: 8 }}>
          <KeyRound size={20} /> {user.has_password ? "Changer de mot de passe" : "Définir un mot de passe"}
        </h2>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            changePassword.mutate();
          }}
        >
          {user.has_password && (
            <Field label="Mot de passe actuel" htmlFor="cur">
              <Input id="cur" type="password" autoComplete="current-password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} />
            </Field>
          )}
          <Field label="Nouveau mot de passe" htmlFor="new" error={changePassword.error instanceof ApiError ? changePassword.error.fields.new_password : undefined}>
            <Input id="new" type="password" autoComplete="new-password" value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} />
          </Field>
          <div>
            <Button type="submit" variant="ghost" size="sm" loading={changePassword.isPending} disabled={passwords.new_password.length < 8}>
              Mettre à jour
            </Button>
          </div>
        </form>
        {changePassword.isError && !(changePassword.error instanceof ApiError && changePassword.error.fields.new_password) && (
          <Notice tone="error">{errorMessage(changePassword.error)}</Notice>
        )}
      </section>

      <section className="card card-pad stack">
        <h2 className="card-title">Tes données</h2>
        <p className="small muted">Récupère tout ce qu'Arah! sait de toi : compte, profil, offres suivies, préparations et coffre.</p>
        <div>
          <Button variant="ghost" size="sm" icon={<Download />} loading={exportData.isPending} onClick={() => exportData.mutate()}>
            Télécharger mes données
          </Button>
        </div>
      </section>

      <section className="card card-pad stack danger-zone">
        <h2 className="card-title">Supprimer mon compte</h2>
        <p className="small muted">
          Ton compte, ton profil, tes préparations et ton coffre seront supprimés définitivement. Cette action est irréversible.
        </p>
        <Field label='Tape « SUPPRIMER » pour confirmer' htmlFor="confirm-delete">
          <Input id="confirm-delete" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} style={{ maxWidth: 260 }} />
        </Field>
        <div>
          <Button variant="danger" size="sm" icon={<Trash2 />} disabled={confirmDelete !== "SUPPRIMER"} loading={deleteAccount.isPending} onClick={() => deleteAccount.mutate()}>
            Supprimer définitivement
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function Settings() {
  useDocumentTitle("Profil et réglages");
  const [tab, setTab] = useState<Tab>("profil");
  return (
    <div className="page">
      <div className="container container-mid">
        <div className="page-head">
          <div>
            <span className="eyebrow">Ton compte</span>
            <h1 className="page-title">
              Profil <span className="serif">et réglages</span>
            </h1>
          </div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <Tabs
            tabs={[
              { value: "profil" as Tab, label: "Profil de veille" },
              { value: "alertes" as Tab, label: "Alertes" },
              { value: "compte" as Tab, label: "Compte" },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        {tab === "profil" && <ProfileTab />}
        {tab === "alertes" && <AlertsTab />}
        {tab === "compte" && <AccountTab />}
        <p className="tiny muted" style={{ marginTop: 24 }}>
          <UserRound size={12} style={{ display: "inline", verticalAlign: -2 }} /> Ton profil sert uniquement à trier les offres et à
          préparer tes brouillons. <BellRing size={12} style={{ display: "inline", verticalAlign: -2 }} /> Chaque e-mail contient un lien de
          désinscription en un clic.
        </p>
      </div>
    </div>
  );
}
