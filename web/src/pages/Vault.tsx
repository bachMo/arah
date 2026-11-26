import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { FileBadge2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, EmptyState, Field, Input, Select, Skeleton, Textarea } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { daysLeft, formatDate } from "../lib/format";
import { useDocumentTitle, useTaxonomy } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { VaultDocument } from "../lib/types";

type Form = Omit<VaultDocument, "id" | "updated_at">;
const EMPTY: Form = { doc_type: "ninea", label: "", reference: "", issued_on: null, expires_on: null, notes: "" };

function expiry(doc: VaultDocument): { label: string; tone: "ok" | "warn" | "danger" | "none" } {
  const days = daysLeft(doc.expires_on);
  if (days === null) return { label: "Sans expiration", tone: "none" };
  if (days < 0) return { label: `Expiré depuis ${-days} j`, tone: "danger" };
  if (days <= 30) return { label: `Expire dans ${days} j`, tone: "warn" };
  return { label: `Valide jusqu'au ${formatDate(doc.expires_on)}`, tone: "ok" };
}

export default function Vault() {
  useDocumentTitle("Coffre de documents");
  const { data: taxonomy, labels } = useTaxonomy();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const docs = useQuery({ queryKey: ["vault"], queryFn: () => api.get<VaultDocument[]>("/vault") });
  const save = useMutation({
    mutationFn: (body: Form) => (editing ? api.put(`/vault/${editing}`, body) : api.post("/vault", body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault"] });
      toast.show(editing ? "Document mis à jour" : "Document ajouté au coffre");
      setForm(null);
      setEditing(null);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/vault/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault"] });
      toast.show("Document retiré");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form) save.mutate({ ...form, issued_on: form.issued_on || null, expires_on: form.expires_on || null });
  };

  const expiringSoon = (docs.data ?? []).filter((d) => {
    const days = daysLeft(d.expires_on);
    return days !== null && days <= 30;
  }).length;

  return (
    <div className="page">
      <div className="container container-mid">
        <div className="page-head">
          <div>
            <span className="eyebrow">Tes pièces administratives</span>
            <h1 className="page-title">
              Coffre <span className="serif">de documents</span>
            </h1>
            <p className="lead">
              Note tes attestations et leurs dates d'expiration : l'agent te prévient 30 et 7 jours avant, et l'observatoire
              te dit quelles pièces débloqueraient plus d'offres.
            </p>
          </div>
          {!form && (
            <Button variant="signal" icon={<Plus />} onClick={() => setForm(EMPTY)}>
              Ajouter un document
            </Button>
          )}
        </div>

        <div className="vault-note">
          <ShieldCheck />
          <span>
            Pour ta sécurité, le coffre garde les <strong>informations</strong> (numéro, dates), pas les fichiers. Conserve les
            originaux de ton côté.
          </span>
        </div>

        {form && (
          <form className="card card-pad vault-form" onSubmit={submit}>
            <h2 className="card-title">{editing ? "Modifier le document" : "Nouveau document"}</h2>
            <div className="form-grid">
              <Field label="Type de document" htmlFor="type">
                <Select id="type" value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
                  {taxonomy?.doc_types.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Libellé (facultatif)" htmlFor="label">
                <Input id="label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex. Quitus fiscal 2026" />
              </Field>
              <Field label="Numéro ou référence" htmlFor="ref">
                <Input id="ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              </Field>
              <Field label="Délivré le" htmlFor="issued">
                <Input id="issued" type="date" value={form.issued_on ?? ""} onChange={(e) => setForm({ ...form, issued_on: e.target.value })} />
              </Field>
              <Field label="Expire le" htmlFor="expires" hint="Laisse vide si le document n'expire pas.">
                <Input id="expires" type="date" value={form.expires_on ?? ""} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => (setForm(null), setEditing(null))}>
                Annuler
              </Button>
              <Button type="submit" variant="signal" loading={save.isPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        )}

        {expiringSoon > 0 && (
          <p className="small" style={{ margin: "8px 0 16px", color: "#8a5a00" }}>
            {expiringSoon} document{expiringSoon > 1 ? "s expirent" : " expire"} bientôt ou {expiringSoon > 1 ? "sont" : "est"} déjà
            périmé{expiringSoon > 1 ? "s" : ""}.
          </p>
        )}

        <div className="vault-list">
          {docs.isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={84} radius={20} />)}
          {docs.data?.map((doc) => {
            const status = expiry(doc);
            return (
              <div key={doc.id} className={clsx("vault-item card", `is-${status.tone}`)}>
                <span className="vault-icon">
                  <FileBadge2 />
                </span>
                <div className="vault-body">
                  <strong>{doc.label || labels.doc[doc.doc_type] || doc.doc_type}</strong>
                  <span className="small muted">
                    {labels.doc[doc.doc_type]}
                    {doc.reference && ` · n° ${doc.reference}`}
                  </span>
                </div>
                <span className={clsx("badge", { ok: "badge-leaf", warn: "badge-sun", danger: "badge-signal", none: "" }[status.tone])}>
                  {status.label}
                </span>
                <div className="vault-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Modifier"
                    onClick={() => {
                      setEditing(doc.id);
                      setForm({ doc_type: doc.doc_type, label: doc.label, reference: doc.reference, issued_on: doc.issued_on, expires_on: doc.expires_on, notes: doc.notes });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <Pencil />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Supprimer"
                    onClick={() => window.confirm("Retirer ce document du coffre ?") && remove.mutate(doc.id)}
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            );
          })}
          {docs.data && docs.data.length === 0 && !form && (
            <div className="card">
              <EmptyState icon={<FileBadge2 />} title="Ton coffre est vide" action={<Button onClick={() => setForm(EMPTY)}>Ajouter mon premier document</Button>}>
                NINEA, RCCM, quitus fiscal, attestations IPRES et CSS : ajoute-les pour ne plus jamais déposer une pièce périmée.
              </EmptyState>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
