import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type HyperspaceHandle = { jump: (intensity: number, duration: number) => void };

/** Saut en hyperespace : des traînées d'étoiles qui jaillissent du centre de l'écran. */
export const Hyperspace = forwardRef<HyperspaceHandle>(function Hyperspace(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ until: 0, start: 0, intensity: 0, frame: 0 });
  const stars = useRef(
    Array.from({ length: 320 }, () => ({ angle: Math.random() * Math.PI * 2, depth: Math.random(), hue: Math.random() })),
  );

  useImperativeHandle(ref, () => ({
    jump(intensity, duration) {
      const now = performance.now();
      state.current.start = now;
      state.current.until = now + duration * 1000;
      state.current.intensity = intensity;
      cancelAnimationFrame(state.current.frame);
      const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (canvas.width !== w * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const t = performance.now();
        const total = state.current.until - state.current.start;
        const p = Math.min(1, (t - state.current.start) / total);
        // Monte vite, tient, puis s'estompe.
        const power = Math.sin(Math.PI * Math.min(1, p * 1.15)) * state.current.intensity;
        if (p >= 1 || power <= 0.001) {
          ctx.clearRect(0, 0, w, h);
          return;
        }
        const cx = w / 2;
        const cy = h / 2;
        const reach = Math.hypot(cx, cy);
        ctx.lineCap = "round";
        for (const s of stars.current) {
          s.depth = (s.depth + 0.012 + power * 0.03) % 1;
          const r1 = Math.pow(s.depth, 2.2) * reach * 1.1;
          const r2 = r1 * (1 + power * 0.55);
          const x1 = cx + Math.cos(s.angle) * r1;
          const y1 = cy + Math.sin(s.angle) * r1;
          const x2 = cx + Math.cos(s.angle) * r2;
          const y2 = cy + Math.sin(s.angle) * r2;
          const alpha = Math.min(1, s.depth * 1.6) * power;
          ctx.strokeStyle = s.hue > 0.82 ? `rgba(255, 196, 140, ${alpha})` : s.hue > 0.6 ? `rgba(170, 200, 255, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
          ctx.lineWidth = 0.6 + s.depth * 1.8 * power;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach * 0.5);
        flash.addColorStop(0, `rgba(190, 215, 255, ${0.16 * power})`);
        flash.addColorStop(1, "rgba(190, 215, 255, 0)");
        ctx.fillStyle = flash;
        ctx.fillRect(0, 0, w, h);
        state.current.frame = requestAnimationFrame(draw);
      };
      draw();
    },
  }));

  useEffect(() => () => cancelAnimationFrame(state.current.frame), []);
  return <canvas ref={canvasRef} className="u-hyperspace" aria-hidden />;
});
