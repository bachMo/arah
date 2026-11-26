import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileUp,
  ListChecks,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { DeadlineBadge } from "../components/Opportunity";
import { Button, EmptyState, Notice, Skeleton, Textarea } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { formatDate, relativeTime } from "../lib/format";
import { useConfig, useDocumentTitle } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { CheckItem, OpportunityDetail, OutlineSection, Preparation } from "../lib/types";

type Draft = Pick<Preparation, "requirements" | "checklist" | "outline" | "letter" | "notes">;

const CATEGORY_LABEL: Record<string, string> = {
  administratif: "Administratif",
  technique: "Technique",
  financier: "Financier",
};

function newId() {
  return Math.random().toString(36).slice(2, 12);
}

function CheckList({
  items,
  onChange,
  grouped = false,
  addLabel,
}: {
  items: CheckItem[];
  onChange: (items: CheckItem[]) => void;
  grouped?: boolean;
  addLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const groups = grouped
    ? Object.entries(
        items.reduce<Record<string, CheckItem[]>>((acc, item) => {
          (acc[item.category ?? "administratif"] ??= []).push(item);
          return acc;
        }, {}),
      )
    : [["", items] as [string, CheckItem[]]];
  const toggle = (id: string) => onChange(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));
  const add = () => {
    if (!draft.trim()) return;
    onChange([...items, { id: newId(), label: draft.trim(), done: false, category: grouped ? "administratif" : null }]);
    setDraft("");
  };
  return (
    <div className="checklist">
      {groups.map(([group, list]) => (
        <div key={group} className="checklist-group">
          {group && <span className="card-label">{CATEGORY_LABEL[group] ?? group}</span>}
          {list.map((item) => (
            <div key={item.id} className={clsx("check-item", item.done && "is-done")}>
              <label>
                <input type="checkbox" checked={item.done} onChange={() => toggle(item.id)} />
                <span className="check-box" aria-hidden />
                <span className="check-label">
                  {item.label}
                  {item.source && <em> · {item.source}</em>}
                </span>
              </label>
              <button type="button" className="icon-btn subtle" aria-label="Supprimer" onClick={() => remove(item.id)}>
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      ))}
      <div className="check-add">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder={addLabel} />
        <button type="button" className="icon-btn" aria-label="Ajouter" onClick={add} disabled={!draft.trim()}>
          <Plus />
        </button>
      </div>
    </div>
  );
}

function OutlineEditor({ sections, onChange }: { sections: OutlineSection[]; onChange: (s: OutlineSection[]) => void }) {
  const update = (index: number, patch: Partial<OutlineSection>) =>
    onChange(sections.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  return (
    <ol className="outline">
      {sections.map((section, index) => (
        <li key={index}>
          <input className="outline-title" value={section.title} onChange={(e) => update(index, { title: e.target.value })} aria-label={`Titre de la section ${index + 1}`} />
          <textarea
            className="outline-points"
            value={section.points.join("\n")}
            rows={Math.max(2, section.points.length)}
            onChange={(e) => update(index, { points: e.target.value.split("\n") })}
            aria-label={`Points de la section ${index + 1}`}
          />
          <button type="button" className="icon-btn subtle outline-remove" aria-label="Supprimer la section" onClick={() => onChange(sections.filter((_, i) => i !== index))}>
            <Trash2 />
          </button>
        </li>
      ))}
      <li className="outline-add">
        <button type="button" className="btn btn-soft btn-sm" onClick={() => onChange([...sections, { title: "Nouvelle section", points: [""] }])}>
          <Plus /> Ajouter une section
        </button>
      </li>
    </ol>
  );
}

export default function Prepare() {
  const { id = "" } = useParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: config } = useConfig();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const opportunity = useQuery({ queryKey: ["opportunity", id, "prep"], queryFn: () => api.get<OpportunityDetail>(`/opportunities/${id}`) });
  const prep = useQuery({ queryKey: ["prepare", id], queryFn: () => api.get<Preparation | null>(`/prepare/${id}`) });
  useDocumentTitle(opportunity.data ? `Préparer · ${opportunity.data.title}` : "Préparer ma réponse");

  useEffect(() => {
    if (prep.data && !dirty) {
      setDraft({ requirements: prep.data.requirements, checklist: prep.data.checklist, outline: prep.data.outline, letter: prep.data.letter, notes: prep.data.notes });
      setSavedAt(prep.data.updated_at);
    }
  }, [prep.data, dirty]);

  const generate = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (file) form.append("document", file);
      return api.post<Preparation>(`/prepare/${id}/generate`, form);
    },
    onSuccess: (data) => {
      setDirty(false);
      queryClient.setQueryData(["prepare", id], data);
      queryClient.invalidateQueries({ queryKey: ["radar"] });
      setFile(null);
      toast.show("Brouillon prêt. Relis-le et adapte-le.");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const save = useMutation({
    mutationFn: (body: Draft) => api.put<Preparation>(`/prepare/${id}`, body),
    onSuccess: (data) => {
      setDirty(false);
      setSavedAt(data.updated_at);
      queryClient.setQueryData(["prepare", id], data);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const validate = useMutation({
    mutationFn: async () => {
      if (draft && dirty) await api.put(`/prepare/${id}`, draft);
      return api.post<Preparation>(`/prepare/${id}/validate`);
    },
    onSuccess: (data) => {
      setDirty(false);
      queryClient.setQueryData(["prepare", id], data);
      toast.show("Préparation validée. Tu peux la télécharger.");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  useEffect(() => {
    if (!dirty || !draft) return;
    const timer = window.setTimeout(() => save.mutate(draft), 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > 15 * 1024 * 1024) {
      toast.show("Le fichier dépasse 15 Mo.", "error");
      return;
    }
    setFile(f);
  };

  const copyLetter = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft.letter).then(
      () => toast.show("Lettre copiée"),
      () => toast.show("Copie impossible", "error"),
    );
  };

  if (opportunity.isLoading || prep.isLoading) {
    return (
      <div className="page container">
        <Skeleton height={40} width="60%" />
        <div style={{ height: 24 }} />
        <Skeleton height={420} radius={24} />
      </div>
    );
  }
  if (!opportunity.data) {
    return (
      <div className="page container">
        <EmptyState title="Offre introuvable" />
      </div>
    );
  }

  const o = opportunity.data;
  const done = draft ? [...draft.requirements, ...draft.checklist].filter((i) => i.done).length : 0;
  const total = draft ? draft.requirements.length + draft.checklist.length : 0;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const validated = prep.data?.validated_at && !dirty;

  return (
    <div className="page prepare-page">
      <div className="container">
        <Link to={`/offre/${id}`} className="back-link">
          <ArrowLeft /> Retour à l'offre
        </Link>
        <div className="prepare-head">
          <div>
            <span className="eyebrow">Préparation de la réponse</span>
            <h1 className="prepare-title">{o.title}</h1>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <DeadlineBadge deadline={o.deadline_at} />
              <span className="badge badge-outline">{o.issuer}</span>
            </div>
          </div>
          {draft && (
            <div className="prepare-actions no-print">
              <span className="save-state small muted" aria-live="polite">
                {save.isPending ? "Enregistrement…" : dirty ? "Modifications non enregistrées" : savedAt ? `Enregistré ${relativeTime(savedAt)}` : ""}
              </span>
              <a className="btn btn-ghost btn-sm" href={api.url(`/prepare/${id}/export`)} download>
                <Download /> Télécharger
              </a>
              <Button variant="ghost" size="sm" icon={<Printer />} onClick={() => window.print()}>
                Imprimer
              </Button>
              <Button variant={validated ? "soft" : "signal"} size="sm" icon={validated ? <CheckCircle2 /> : <ShieldCheck />} loading={validate.isPending} onClick={() => validate.mutate()}>
                {validated ? "Validé" : "Valider"}
              </Button>
            </div>
          )}
        </div>

        <Notice tone="warn">
          Tout ce qui est proposé ici est un <strong>brouillon</strong> à relire. Les éléments entre crochets sont à compléter. Rien
          n'est envoyé sans toi.
        </Notice>

        <section className="generator card card-pad no-print">
          <div className="generator-copy">
            <span className="generator-icon">
              <Wand2 />
            </span>
            <div>
              <h2 className="card-title">{draft ? "Régénérer le brouillon" : "Préparer ma réponse"}</h2>
              <p className="small muted">
                {config?.llm.enabled
                  ? "Ajoute le dossier d'appel d'offres (PDF) pour une matrice d'exigences complète, reliée aux pages du dossier."
                  : "Le Rédacteur propose une base solide à partir de l'avis et de ton profil. Ajoute une clé d'IA pour des brouillons sur mesure."}
              </p>
            </div>
          </div>
          <div className="generator-actions">
            <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={onFile} />
            <Button variant="ghost" icon={<FileUp />} onClick={() => fileRef.current?.click()}>
              {file ? file.name.slice(0, 28) : prep.data?.source_document_name ? "Changer le dossier" : "Ajouter le dossier (PDF)"}
            </Button>
            <Button variant="signal" icon={draft ? <RefreshCw /> : <Wand2 />} loading={generate.isPending} onClick={() => generate.mutate()}>
              {draft ? "Régénérer" : "Générer le brouillon"}
            </Button>
          </div>
          {draft && <p className="tiny muted">La régénération remplace le plan et la lettre ; les cases déjà cochées sont conservées.</p>}
        </section>

        {generate.isPending && (
          <div className="writing card card-pad">
            <span className="scanning-ring" />
            <div>
              <strong>Le Rédacteur travaille…</strong>
              <p className="small muted">Lecture de l'avis{file ? " et du dossier" : ""}, matrice d'exigences, plan, lettre. Cela peut prendre jusqu'à une minute.</p>
            </div>
          </div>
        )}

        {!draft && !generate.isPending && (
          <div className="card">
            <EmptyState icon={<ListChecks />} title="Aucun brouillon pour l'instant">
              Lance le Rédacteur : il prépare la liste des pièces, la matrice d'exigences, le plan et la lettre de soumission.
            </EmptyState>
          </div>
        )}

        {draft && (
          <div className="prepare-grid">
            <div className="stack" style={{ ["--gap" as string]: "20px" }}>
              <section className="card card-pad">
                <div className="section-row">
                  <h2 className="card-title">Matrice d'exigences</h2>
                  <span className="badge">{draft.requirements.filter((r) => r.done).length} / {draft.requirements.length}</span>
                </div>
                <CheckList items={draft.requirements} onChange={(requirements) => edit({ requirements })} grouped addLabel="Ajouter une exigence" />
              </section>
              <section className="card card-pad">
                <div className="section-row">
                  <h2 className="card-title">Pièces et actions</h2>
                  <span className="badge">{draft.checklist.filter((r) => r.done).length} / {draft.checklist.length}</span>
                </div>
                <CheckList items={draft.checklist} onChange={(checklist) => edit({ checklist })} addLabel="Ajouter une pièce ou une action" />
              </section>
            </div>
            <div className="stack" style={{ ["--gap" as string]: "20px" }}>
              <section className="card card-pad progress-card">
                <span className="card-label">Avancement</span>
                <div className="progress-big">
                  <strong className="tnum">{progress} %</strong>
                  <span className="muted small">{done} éléments prêts sur {total}</span>
                </div>
                <div className="meter-bar">
                  <span style={{ width: `${progress}%` }} />
                </div>
                {o.deadline_at && <p className="small muted">Dépôt attendu le {formatDate(o.deadline_at)}.</p>}
                {prep.data?.method && <p className="tiny muted">Brouillon : {prep.data.method}</p>}
              </section>
              <section className="card card-pad">
                <h2 className="card-title">Plan de la réponse</h2>
                <OutlineEditor sections={draft.outline} onChange={(outline) => edit({ outline })} />
              </section>
            </div>
            <section className="card card-pad letter-card">
              <div className="section-row">
                <h2 className="card-title">Lettre de soumission</h2>
                <Button variant="soft" size="sm" icon={<ClipboardCopy />} onClick={copyLetter}>
                  Copier
                </Button>
              </div>
              <Textarea className="letter" value={draft.letter} onChange={(e) => edit({ letter: e.target.value })} rows={22} />
              <span className="tiny muted">{draft.letter.split(/\s+/).filter(Boolean).length} mots</span>
            </section>
            <section className="card card-pad letter-card">
              <h2 className="card-title">Notes</h2>
              <Textarea value={draft.notes} onChange={(e) => edit({ notes: e.target.value })} rows={4} placeholder="Contacts, questions à poser à l'émetteur, idées…" />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
