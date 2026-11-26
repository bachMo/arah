import { useMemo } from "react";
import { Link } from "react-router-dom";
import { deadlineLabel } from "../lib/format";

export type Blip = { id: string; title: string; kind: string; deadline: string | null; score?: number | null };

const SWEEP_SECONDS = 7;
const KIND_COLOR: Record<string, string> = {
  tender: "#2457c5",
  consultancy: "#7a3e8e",
  grant: "#1f8a5b",
  competition: "#e9a400",
  program: "#ff4f1f",
  other: "#7b7061",
};

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function phaseOffset(): number {
  // Phase commune : le balayage et les échos restent synchronisés, quel que soit le moment où ils apparaissent.
  const now = typeof document !== "undefined" && document.timeline ? Number(document.timeline.currentTime ?? 0) : 0;
  return (now / 1000) % SWEEP_SECONDS;
}

export function RadarScope({ blips, labels = 3 }: { blips: Blip[]; labels?: number }) {
  const sweepDelay = useMemo(() => -phaseOffset(), []);
  const points = useMemo(
    () =>
      blips.slice(0, 22).map((b, index) => {
        const angle = (hash(b.id) * 360 + index * 47) % 360;
        const base = b.score != null ? 1 - b.score / 100 : 0.25 + hash(`${b.id}r`) * 0.7;
        const radius = 0.16 + Math.min(0.78, base) * 0.8;
        const rad = (angle * Math.PI) / 180;
        return {
          ...b,
          angle,
          left: 50 + Math.sin(rad) * radius * 46,
          top: 50 - Math.cos(rad) * radius * 46,
          delay: (angle / 360) * SWEEP_SECONDS - phaseOffset(),
          color: KIND_COLOR[b.kind] ?? KIND_COLOR.other,
        };
      }),
    [blips],
  );
  const labelled = useMemo(() => {
    const chosen: typeof points = [];
    for (const p of points) {
      if (chosen.length >= labels) break;
      if (p.top < 14 || p.top > 86) continue;
      if (chosen.every((c) => Math.abs(c.top - p.top) > 18)) chosen.push(p);
    }
    return chosen;
  }, [points, labels]);

  return (
    <div className="radar" style={{ ["--sweep" as string]: `${SWEEP_SECONDS}s` }}>
      <svg className="radar-grid" viewBox="0 0 100 100" aria-hidden>
        {[46, 34.5, 23, 11.5].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} />
        ))}
        <line x1="50" y1="4" x2="50" y2="96" />
        <line x1="4" y1="50" x2="96" y2="50" />
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i * 5 * Math.PI) / 180;
          const long = i % 6 === 0;
          const r1 = long ? 43.5 : 44.8;
          return (
            <line
              key={i}
              className="tick"
              x1={50 + Math.sin(a) * r1}
              y1={50 - Math.cos(a) * r1}
              x2={50 + Math.sin(a) * 46}
              y2={50 - Math.cos(a) * 46}
            />
          );
        })}
      </svg>
      <div className="radar-sweep" style={{ animationDelay: `${sweepDelay}s` }} aria-hidden />
      <div className="radar-center" aria-hidden>
        <span>toi</span>
      </div>
      {points.map((p) => (
        <Link
          key={p.id}
          to={`/offre/${p.id}`}
          className="blip"
          style={{ left: `${p.left}%`, top: `${p.top}%`, ["--c" as string]: p.color, animationDelay: `${p.delay}s` }}
          aria-label={p.title}
          tabIndex={labelled.includes(p) ? 0 : -1}
        >
          <span className="blip-dot" style={{ animationDelay: `${p.delay}s` }} />
        </Link>
      ))}
      {labelled.map((p, index) => {
        const { label } = deadlineLabel(p.deadline);
        const side = p.left > 55 ? "left" : "right";
        return (
          <div
            key={`label-${p.id}`}
            className={`blip-label blip-label-${side}`}
            style={{ left: `${p.left}%`, top: `${p.top}%`, animationDelay: `${0.6 + index * 0.25}s` }}
            aria-hidden
          >
            <span className="blip-label-kind" style={{ color: p.color }}>
              ● {label}
            </span>
            <span className="blip-label-title">{p.title}</span>
          </div>
        );
      })}
    </div>
  );
}
