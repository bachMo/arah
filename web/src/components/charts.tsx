import { useId, useMemo, useState } from "react";
import { formatNumber, monthLabel } from "../lib/format";

export const PALETTE = ["#ff4f1f", "#2457c5", "#1f8a5b", "#e9a400", "#7a3e8e", "#0f8b8d", "#c2410c", "#64748b"];

export function BarList({
  items,
  format = formatNumber,
  highlight,
  max: maxOverride,
}: {
  items: { label: string; value: number; note?: string }[];
  format?: (value: number) => string;
  highlight?: (label: string) => boolean;
  max?: number;
}) {
  const max = maxOverride ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="barlist">
      {items.map((item, index) => (
        <li key={item.label} className={highlight?.(item.label) ? "is-highlight" : undefined}>
          <div className="barlist-row">
            <span className="barlist-label">{item.label}</span>
            <span className="barlist-value tnum">
              {format(item.value)}
              {item.note && <em>{item.note}</em>}
            </span>
          </div>
          <div className="barlist-track">
            <div
              className="barlist-fill"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%`, animationDelay: `${index * 60}ms` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AreaChart({ data, height = 220 }: { data: { month: string; count: number }[]; height?: number }) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const pad = { top: 16, right: 8, bottom: 28, left: 8 };
  const geometry = useMemo(() => {
    const max = Math.max(1, ...data.map((d) => d.count));
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const step = data.length > 1 ? innerW / (data.length - 1) : innerW;
    const points = data.map((d, i) => ({
      x: pad.left + (data.length > 1 ? i * step : innerW / 2),
      y: pad.top + innerH - (d.count / max) * innerH,
      ...d,
    }));
    const line = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const area = points.length
      ? `${line} L${points[points.length - 1].x},${pad.top + innerH} L${points[0].x},${pad.top + innerH} Z`
      : "";
    return { points, line, area, baseline: pad.top + innerH };
  }, [data, height, pad.bottom, pad.left, pad.right, pad.top]);

  if (!data.length) return <p className="muted small">Pas encore assez de données.</p>;
  if (data.length < 2) {
    return (
      <div className="area-empty">
        <strong className="tnum">{formatNumber(data[0].count)}</strong>
        <span>offres collectées en {monthLabel(data[0].month)}. La courbe mensuelle se dessinera au fil des semaines.</span>
      </div>
    );
  }
  const active = hover !== null ? geometry.points[hover] : geometry.points[geometry.points.length - 1];

  return (
    <div className="area-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Nombre d'offres publiées par mois" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff4f1f" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ff4f1f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.left} x2={width - pad.right} y1={pad.top + (geometry.baseline - pad.top) * f}
            y2={pad.top + (geometry.baseline - pad.top) * f} className="grid-line" />
        ))}
        <path d={geometry.area} fill={`url(#g${id})`} />
        <path d={geometry.line} fill="none" stroke="#ff4f1f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {geometry.points.map((p, i) => (
          <g key={p.month}>
            <rect x={p.x - 20} y={0} width={40} height={height} fill="transparent" onMouseEnter={() => setHover(i)} />
            <text x={p.x} y={height - 8} textAnchor="middle" className="axis-label">
              {monthLabel(p.month)}
            </text>
          </g>
        ))}
        {active && (
          <g>
            <line x1={active.x} x2={active.x} y1={active.y} y2={geometry.baseline} className="hover-line" />
            <circle cx={active.x} cy={active.y} r="5.5" fill="#fffdf8" stroke="#ff4f1f" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {active && (
        <div className="area-tooltip">
          <strong className="tnum">{formatNumber(active.count)}</strong> offres en {monthLabel(active.month)}
        </div>
      )}
    </div>
  );
}

export function Donut({
  items,
  size = 168,
  thickness = 22,
  centerLabel,
}: {
  items: { label: string; value: number }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Répartition">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--paper-2)" strokeWidth={thickness} />
        {items.map((item, index) => {
          const length = (item.value / total) * circumference;
          const segment = (
            <circle
              key={item.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={PALETTE[index % PALETTE.length]}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, length - 2)} ${circumference}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += length;
          return segment;
        })}
        <text x="50%" y="48%" textAnchor="middle" className="donut-total">
          {formatNumber(total)}
        </text>
        {centerLabel && (
          <text x="50%" y="62%" textAnchor="middle" className="donut-caption">
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="legend">
        {items.map((item, index) => (
          <li key={item.label}>
            <span className="legend-dot" style={{ background: PALETTE[index % PALETTE.length] }} />
            <span>{item.label}</span>
            <strong className="tnum">{Math.round((item.value / total) * 100)} %</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SkillRadar({ items, size = 280 }: { items: { label: string; demand: number; has: boolean }[]; size?: number }) {
  if (items.length < 3) return <p className="muted small">Pas encore assez d'offres dans ton secteur.</p>;
  const center = size / 2;
  const radius = size / 2 - 46;
  const max = Math.max(...items.map((i) => i.demand), 0.01);
  const angle = (i: number) => (i / items.length) * Math.PI * 2 - Math.PI / 2;
  const point = (i: number, r: number) => [center + Math.cos(angle(i)) * r, center + Math.sin(angle(i)) * r];
  const demand = items.map((it, i) => point(i, (it.demand / max) * radius).join(",")).join(" ");
  const mine = items.map((it, i) => point(i, it.has ? (it.demand / max) * radius : radius * 0.08).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="skill-radar" role="img" aria-label="Compétences demandées contre compétences du profil">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={items.map((_, i) => point(i, radius * f).join(",")).join(" ")} className="sr-grid" />
      ))}
      {items.map((_, i) => {
        const [x, y] = point(i, radius);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} className="sr-axis" />;
      })}
      <polygon points={demand} className="sr-demand" />
      <polygon points={mine} className="sr-mine" />
      {items.map((it, i) => {
        const [x, y] = point(i, radius + 22);
        return (
          <text key={it.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className={it.has ? "sr-label has" : "sr-label"}>
            {it.label.length > 14 ? `${it.label.slice(0, 13)}…` : it.label}
          </text>
        );
      })}
    </svg>
  );
}
