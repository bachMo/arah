import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Cpu, HeartHandshake, MessageCircle, Server, Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Field, Input, Notice, Skeleton, Toggle } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { formatDate, formatNumber, monthLabel } from "../lib/format";
import { useConfig, useDocumentTitle } from "../lib/hooks";
import { useToast } from "../lib/toast";
import type { Transparency } from "../lib/types";

const PRESETS = [1000, 2500, 5000, 10000, 25000];
const xof = (v: number) => `${formatNumber(v)} F CFA`;

function History({ data }: { data: Transparency["history"] }) {
  const max = Math.max(1, ...data.flatMap((m) => [m.costs_xof, m.donations_xof]));
  return (
    <div className="history-chart" role="img" aria-label="Coûts et dons des six derniers mois">
      {data.map((m) => (
        <div key={m.month} className="history-col">
          <div className="history-bars">
            <span className="bar-cost" style={{ height: `${(m.costs_xof / max) * 100}%` }} title={`Coûts : ${xof(m.costs_xof)}`} />
            <span className="bar-don" style={{ height: `${(m.donations_xof / max) * 100}%` }} title={`Dons : ${xof(m.donations_xof)}`} />
          </div>
          <span className="history-label">{monthLabel(m.month)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Support() {
  useDocumentTitle("Soutenir Arah!");
  const { data: config } = useConfig();
  const toast = useToast();
  const [params] = useSearchParams();
  const [amount, setAmount] = useState(5000);
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const query = useQuery({ queryKey: ["transparency"], queryFn: () => api.get<Transparency>("/transparency") });

  const checkout = useMutation({
    mutationFn: () =>
      api.post<{ redirect_url: string }>("/donations/checkout", {
        amount_xof: custom ? Number(custom) : amount,
        donor_name: name,
        message,
        is_public: isPublic,
      }),
    onSuccess: ({ redirect_url }) => {
      window.location.href = redirect_url;
    },
  });

  const month = query.data?.month;
  const goal = Math.max(month?.costs_xof ?? 0, config?.donations.monthly_goal_xof ?? 0);
  const coverage = goal ? Math.min(100, Math.round(((month?.donations_xof ?? 0) / goal) * 100)) : 0;
  const finalAmount = custom ? Number(custom) : amount;

  const copy = (value: string) =>
    navigator.clipboard.writeText(value).then(
      () => toast.show("Numéro copié"),
      () => toast.show("Copie impossible", "error"),
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (finalAmount >= 500) checkout.mutate();
  };

  return (
    <div className="page support-page">
      <div className="container">
        {params.get("merci") && (
          <Notice tone="success" icon={<HeartHandshake />}>
            Merci infiniment pour ton don ! Il apparaîtra dans le compteur dès sa confirmation par PayTech.
          </Notice>
        )}
        {params.get("annule") && <Notice tone="info">Le paiement a été annulé. Aucun montant n'a été débité.</Notice>}

        <div className="support-hero">
          <div>
            <span className="eyebrow">Soutenir le projet</span>
            <h1 className="page-title">
              Garde le guetteur <span className="serif">éveillé.</span>
            </h1>
            <p className="lead">
              Arah! est gratuit pour tout le monde et le restera. Le serveur, l'IA et bientôt les messages WhatsApp ont un coût :
              chaque don, même petit, permet à l'agent de continuer à veiller pour des milliers de structures.
            </p>
            <div className="fund-list">
              <div>
                <Server />
                <span>
                  <strong>Le serveur</strong> qui fait tourner l'agent chaque matin
                </span>
              </div>
              <div>
                <Cpu />
                <span>
                  <strong>L'IA</strong> qui résume, note et rédige les brouillons
                </span>
              </div>
              <div>
                <MessageCircle />
                <span>
                  <strong>Les alertes WhatsApp</strong>, activées dès que les dons couvrent les frais de Meta
                </span>
              </div>
            </div>
          </div>

          <div className="card card-pad meter-card">
            <span className="card-label">{month ? `Ce mois-ci · ${monthLabel(query.data!.history.at(-1)!.month)}` : "Ce mois-ci"}</span>
            {month ? (
              <>
                <div className="meter-big">
                  <strong className="tnum">{xof(month.donations_xof)}</strong>
                  <span className="muted">reçus sur {xof(goal)}</span>
                </div>
                <div className="meter-bar meter-bar-lg">
                  <span style={{ width: `${coverage}%` }} />
                </div>
                <ul className="cost-lines">
                  {month.lines.map((l) => (
                    <li key={l.label}>
                      <span>{l.label}</span>
                      <strong className="tnum">{xof(l.amount_xof)}</strong>
                    </li>
                  ))}
                  <li>
                    <span>Modèles d'IA</span>
                    <strong className="tnum">{xof(month.llm_xof)}</strong>
                  </li>
                  <li className="total">
                    <span>Total des coûts</span>
                    <strong className="tnum">{xof(month.costs_xof)}</strong>
                  </li>
                </ul>
                {query.data && <History data={query.data.history} />}
                <div className="legend-inline">
                  <span>
                    <i className="cost" /> coûts
                  </span>
                  <span>
                    <i className="don" /> dons
                  </span>
                </div>
              </>
            ) : (
              <Skeleton height={260} />
            )}
          </div>
        </div>

        <div className="donate-grid">
          <form className="card card-pad stack donate-form" onSubmit={submit}>
            <h2 className="card-title">Faire un don</h2>
            <div className="amounts">
              {PRESETS.map((p) => (
                <button key={p} type="button" className="chip" aria-pressed={!custom && amount === p} onClick={() => (setAmount(p), setCustom(""))}>
                  {formatNumber(p)} F
                </button>
              ))}
            </div>
            <Field label="Autre montant (F CFA)" htmlFor="custom">
              <Input id="custom" inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="Ex. 3000" />
            </Field>
            <div className="form-grid">
              <Field label="Ton nom (facultatif)" htmlFor="dname">
                <Input id="dname" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Un petit mot (facultatif)" htmlFor="dmsg">
                <Input id="dmsg" value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} />
              </Field>
            </div>
            <label className="setting-row" style={{ padding: 0, border: 0 }}>
              <span className="small">Afficher mon nom et mon message parmi les donateurs</span>
              <Toggle label="Don public" checked={isPublic} onChange={setIsPublic} />
            </label>
            {config?.donations.paytech ? (
              <>
                {checkout.isError && <Notice tone="error">{errorMessage(checkout.error)}</Notice>}
                <Button type="submit" variant="signal" size="lg" block loading={checkout.isPending} disabled={finalAmount < 500} icon={<HeartHandshake />}>
                  Donner {finalAmount >= 500 ? xof(finalAmount) : ""}
                </Button>
                <p className="tiny muted center">Paiement sécurisé par PayTech : Wave, Orange Money, Free Money ou carte.</p>
              </>
            ) : (
              <Notice tone="info">Le paiement en ligne sera bientôt disponible. En attendant, tu peux donner directement par Wave ou Orange Money.</Notice>
            )}
          </form>

          <div className="stack" style={{ ["--gap" as string]: "20px" }}>
            {(config?.donations.wave || config?.donations.orange_money) && (
              <section className="card card-pad">
                <span className="card-label">Don direct</span>
                <div className="direct-list">
                  {config.donations.wave && (
                    <div className="direct wave">
                      <Smartphone />
                      <div>
                        <strong>Wave</strong>
                        <span className="mono">{config.donations.wave}</span>
                      </div>
                      <button type="button" className="icon-btn" aria-label="Copier le numéro Wave" onClick={() => copy(config.donations.wave!)}>
                        <Copy />
                      </button>
                    </div>
                  )}
                  {config.donations.orange_money && (
                    <div className="direct om">
                      <Smartphone />
                      <div>
                        <strong>Orange Money</strong>
                        <span className="mono">{config.donations.orange_money}</span>
                      </div>
                      <button type="button" className="icon-btn" aria-label="Copier le numéro Orange Money" onClick={() => copy(config.donations.orange_money!)}>
                        <Copy />
                      </button>
                    </div>
                  )}
                </div>
                <p className="tiny muted" style={{ marginTop: 10 }}>Les dons directs sont ajoutés au compteur à la main, sous 48 heures.</p>
              </section>
            )}
            <section className="card card-pad">
              <span className="card-label">Ils font vivre Arah!</span>
              {query.data?.donors.length ? (
                <ul className="donors">
                  {query.data.donors.map((d, i) => (
                    <li key={`${d.name}-${i}`}>
                      <span className="donor-avatar">{d.name.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{d.name}</strong>
                        {d.message && <span className="small muted">« {d.message} »</span>}
                      </div>
                      <span className="tiny muted">{d.date ? formatDate(d.date, { year: undefined }) : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted" style={{ marginTop: 10 }}>Sois la première personne à soutenir le projet ce mois-ci.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
