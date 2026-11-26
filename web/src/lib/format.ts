const nf = new Intl.NumberFormat("fr-FR");

export function formatNumber(value: number | null | undefined): string {
  return value == null ? "—" : nf.format(value).replace(/\u202f/g, " ");
}

export function formatXof(value: number | null | undefined, { short = true } = {}): string {
  if (value == null || value === 0) return "Montant non précisé";
  if (short) {
    if (value >= 1_000_000_000) return `${trim(value / 1_000_000_000)} Md F CFA`;
    if (value >= 1_000_000) return `${trim(value / 1_000_000)} M F CFA`;
    if (value >= 10_000) return `${trim(value / 1_000)} k F CFA`;
  }
  return `${formatNumber(value)} F CFA`;
}

export function formatMoney(amount: number | null, currency: string | null, xof: number | null): string {
  if (amount == null || !currency) return formatXof(xof);
  if (currency === "XOF") return formatXof(amount);
  const symbol = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency;
  const label = amount >= 1_000_000 ? `${trim(amount / 1_000_000)} M` : formatNumber(amount);
  return `${label} ${symbol}`;
}

function trim(value: number): string {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: value < 10 ? 1 : 0 });
}

const DAY = 86_400_000;

export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  const today = new Date();
  const a = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((a - b) / DAY);
}

export function deadlineLabel(iso: string | null): { label: string; tone: "danger" | "warn" | "ok" | "none" } {
  const days = daysLeft(iso);
  if (days === null) return { label: "Sans date limite", tone: "none" };
  if (days < 0) return { label: "Clôturée", tone: "none" };
  if (days === 0) return { label: "Dernier jour", tone: "danger" };
  if (days === 1) return { label: "Demain", tone: "danger" };
  if (days <= 7) return { label: `J-${days}`, tone: "danger" };
  if (days <= 21) return { label: `J-${days}`, tone: "warn" };
  return { label: `J-${days}`, tone: "ok" };
}

export function formatDate(iso: string | null, options: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", ...options });
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return formatDate(iso);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatNumber(count)} ${count > 1 ? pluralForm : singular}`;
}

export function monthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
}

export function scoreTone(score: number): "high" | "mid" | "low" {
  return score >= 75 ? "high" : score >= 55 ? "mid" : "low";
}

export function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
