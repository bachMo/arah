import clsx from "clsx";

export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={clsx("logo", className)} style={{ fontSize: size }} aria-label="Arah!">
      <span className="logo-word">arah</span>
      <span className="logo-bang" aria-hidden>
        <span className="logo-bar" />
        <span className="logo-dot" />
      </span>
    </span>
  );
}
