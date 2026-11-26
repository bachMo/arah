import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Field, Input, Notice, Select, Skeleton, Textarea, Toggle } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { formatNumber, relativeTime } from "../lib/format";
import { useDocumentTitle } from "../lib/hooks";
import { useToast } from "../lib/toast";

type Overview = {
  users: number;
  verified_users: number;
  opportunities: number;
  matches: number;
  source_kinds: { value: string; label: string }[];
  sources: {
    id: string;
    slug: string;
    name: string;
    kind: string;
    url: string;
    enabled: boolean;
    description: string;
    last_status: string;
    last_message: string;
    last_found: number;
    last_run_at: string | null;
  }[];
  ledger: { id: string; kind: "cost" | "donation"; label: string; amount_xof: number; month: string }[];
};

export default function Admin() {
  useDocumentTitle("Administration");
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin"], queryFn: () => api.get<Overview>("/admin/overview") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin"] });
  const [source, setSource] = useState({ slug: "", name: "", kind: "rss", url: "", description: "", config: "{}" });
  const [entry, setEntry] = useState({ kind: "cost", label: "", amount_xof: "" });

  const run = useMutation({
    mutationFn: (kind: "veille" | "rappels") => api.post<{ detail: string }>("/admin/run", undefined, { kind }),
    onSuccess: (r) => toast.show(r.detail),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.patch(`/admin/sources/${id}`, { enabled }),
    onSuccess: refresh,
  });
  const addSource = useMutation({
    mutationFn: () => api.post("/admin/sources", { ...source, config: JSON.parse(source.config || "{}") }),
    onSuccess: () => {
      toast.show("Source ajoutée");
      setSource({ slug: "", name: "", kind: "rss", url: "", description: "", config: "{}" });
      refresh();
    },
    onError: (e) => toast.show(e instanceof SyntaxError ? "Configuration JSON invalide" : errorMessage(e), "error"),
  });
  const addEntry = useMutation({
    mutationFn: () =>
      api.post("/admin/ledger", {
        month: new Date().toISOString().slice(0, 8) + "01",
        kind: entry.kind,
        label: entry.label,
        amount_xof: Number(entry.amount_xof),
      }),
    onSuccess: () => {
      toast.show("Ligne ajoutée au compteur public");
      setEntry({ kind: "cost", label: "", amount_xof: "" });
      refresh();
      queryClient.invalidateQueries({ queryKey: ["transparency"] });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const removeEntry = useMutation({ mutationFn: (id: string) => api.delete(`/admin/ledger/${id}`), onSuccess: refresh });

  const data = query.data;
  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <div>
            <span className="eyebrow">Réservé à l'équipe</span>
            <h1 className="page-title">
              Admini<span className="serif">stration</span>
            </h1>
          </div>
          <div className="row">
            <Button variant="ghost" icon={<Play />} loading={run.isPending && run.variables === "rappels"} onClick={() => run.mutate("rappels")}>
              Lancer les rappels
            </Button>
            <Button variant="signal" icon={<Play />} loading={run.isPending && run.variables === "veille"} onClick={() => run.mutate("veille")}>
              Lancer la veille
            </Button>
          </div>
        </div>
        {run.isSuccess && (
          <Notice tone="info">
            Suis l'exécution en direct sur le <Link to="/journal" className="link">journal de l'agent</Link>.
          </Notice>
        )}
        {!data ? (
          <Skeleton height={400} radius={24} />
        ) : (
          <>
            <div className="kpis">
              {[
                ["Comptes", data.users],
                ["Adresses confirmées", data.verified_users],
                ["Offres en base", data.opportunities],
                ["Correspondances", data.matches],
              ].map(([label, value]) => (
                <div key={label} className="kpi kpi-plain">
                  <strong className="tnum">{formatNumber(value as number)}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <section className="card card-pad" style={{ marginBottom: 20 }}>
              <h2 className="card-title">Sources</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Type</th>
                      <th>Dernier passage</th>
                      <th>Lues</th>
                      <th>Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <strong>{s.name}</strong>
                          <div className="tiny muted">{s.url || s.slug}</div>
                          {s.last_status === "error" && <div className="tiny" style={{ color: "#b42318" }}>{s.last_message.slice(0, 140)}</div>}
                        </td>
                        <td>{s.kind}</td>
                        <td>{relativeTime(s.last_run_at)}</td>
                        <td className="tnum">{s.last_found}</td>
                        <td>
                          <Toggle label={`Activer ${s.name}`} checked={s.enabled} onChange={(enabled) => toggle.mutate({ id: s.id, enabled })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="admin-grid">
              <form
                className="card card-pad stack"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  addSource.mutate();
                }}
              >
                <h2 className="card-title">Ajouter une source</h2>
                <p className="small muted">Vérifie d'abord que les conditions d'utilisation du site autorisent la collecte automatique.</p>
                <div className="form-grid">
                  <Field label="Identifiant" hint="minuscules, chiffres et tirets">
                    <Input value={source.slug} onChange={(e) => setSource({ ...source, slug: e.target.value.toLowerCase() })} required />
                  </Field>
                  <Field label="Nom">
                    <Input value={source.name} onChange={(e) => setSource({ ...source, name: e.target.value })} required />
                  </Field>
                  <Field label="Type">
                    <Select value={source.kind} onChange={(e) => setSource({ ...source, kind: e.target.value })}>
                      {data.source_kinds.map((k) => (
                        <option key={k.value} value={k.value}>
                          {k.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Adresse">
                    <Input value={source.url} onChange={(e) => setSource({ ...source, url: e.target.value })} placeholder="https://…/feed/" />
                  </Field>
                </div>
                <Field label="Configuration (JSON)" hint='Ex. {"kind": "grant", "country": "SN", "language": "fr"}'>
                  <Textarea rows={2} className="mono" value={source.config} onChange={(e) => setSource({ ...source, config: e.target.value })} />
                </Field>
                <Button type="submit" icon={<Plus />} loading={addSource.isPending}>
                  Ajouter
                </Button>
              </form>

              <section className="card card-pad stack">
                <h2 className="card-title">Compteur public du mois</h2>
                <p className="small muted">Coûts du serveur et dons directs (Wave, Orange Money). Les coûts d'IA et les dons PayTech sont comptés automatiquement.</p>
                <form
                  className="form-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addEntry.mutate();
                  }}
                >
                  <Field label="Type">
                    <Select value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })}>
                      <option value="cost">Coût</option>
                      <option value="donation">Don direct</option>
                    </Select>
                  </Field>
                  <Field label="Libellé">
                    <Input value={entry.label} onChange={(e) => setEntry({ ...entry, label: e.target.value })} placeholder="Serveur VPS" required />
                  </Field>
                  <Field label="Montant (F CFA)">
                    <Input inputMode="numeric" value={entry.amount_xof} onChange={(e) => setEntry({ ...entry, amount_xof: e.target.value.replace(/\D/g, "") })} required />
                  </Field>
                  <div style={{ alignSelf: "end" }}>
                    <Button type="submit" loading={addEntry.isPending}>
                      Ajouter
                    </Button>
                  </div>
                </form>
                <ul className="ledger">
                  {data.ledger.map((l) => (
                    <li key={l.id}>
                      <span className={`badge ${l.kind === "cost" ? "badge-signal" : "badge-leaf"}`}>{l.kind === "cost" ? "Coût" : "Don"}</span>
                      <span>{l.label}</span>
                      <strong className="tnum">{formatNumber(l.amount_xof)} F</strong>
                      <button type="button" className="icon-btn subtle" aria-label="Supprimer" onClick={() => removeEntry.mutate(l.id)}>
                        <Trash2 />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
