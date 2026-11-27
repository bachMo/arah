/**
 * Textures générées à la volée (aucune image à télécharger) : surfaces de planètes, halos, nébuleuses.
 * Bruit de valeur 3D échantillonné sur la sphère, pour des textures sans couture.
 */
import * as THREE from "three";

export type PlanetType = "habitable" | "gas" | "rocky" | "ice" | "lava" | "ocean" | "moon";

/** Type de planète selon la nature de l'offre. */
export const KIND_TO_PLANET: Record<string, PlanetType> = {
  job: "habitable",
  grant: "gas",
  tender: "rocky",
  consultancy: "ice",
  competition: "lava",
  program: "ocean",
  other: "moon",
};

export const PLANET_LABELS: Record<PlanetType, string> = {
  habitable: "Planète habitable",
  gas: "Géante gazeuse",
  rocky: "Planète tellurique",
  ice: "Planète de glace",
  lava: "Planète de lave",
  ocean: "Planète océan",
  moon: "Lune",
};

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440670441) ^ Math.imul(seed, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function noise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function fbm(x: number, y: number, z: number, seed: number, octaves = 5): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    total += amplitude * noise3(x * frequency, y * frequency, z * frequency, seed + i * 17);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return total / 0.97;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function ramp(stops: string[], t: number): RGB {
  const colors = stops.map(hex);
  const x = Math.min(0.9999, Math.max(0, t)) * (colors.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return [0, 1, 2].map((k) => colors[i][k] + (colors[i + 1][k] - colors[i][k]) * f) as RGB;
}

const W = 256;
const H = 128;

function paint(fn: (px: number, py: number, pz: number, lat: number) => RGB | [number, number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = (y / (H - 1) - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon);
      const py = Math.sin(lat);
      const pz = Math.cos(lat) * Math.sin(lon);
      const c = fn(px, py, pz, lat);
      const o = (y * W + x) * 4;
      image.data[o] = c[0];
      image.data[o + 1] = c[1];
      image.data[o + 2] = c[2];
      image.data[o + 3] = c.length === 4 ? c[3] : 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function surface(type: PlanetType, seed: number): HTMLCanvasElement {
  const s = seed;
  switch (type) {
    case "gas":
      return paint((x, y, z) => {
        const turb = fbm(x * 2, y * 2, z * 2, s, 4);
        const band = Math.sin(y * 14 + turb * 3.2) * 0.5 + 0.5;
        return ramp(["#7a4a2e", "#c98a55", "#f1d6a6", "#b56f45", "#e8bf86"], band * 0.85 + turb * 0.15);
      });
    case "rocky":
      return paint((x, y, z) => {
        const n = fbm(x * 2.4, y * 2.4, z * 2.4, s);
        const crater = Math.max(0, fbm(x * 7, y * 7, z * 7, s + 99, 2) - 0.62) * 2.4;
        return ramp(["#2e2018", "#6b4a30", "#a8743f", "#d4a467"], n - crater * 0.35);
      });
    case "ice":
      return paint((x, y, z) => {
        const n = fbm(x * 3, y * 3, z * 3, s);
        const crack = Math.abs(noise3(x * 9, y * 9, z * 9, s + 5) - 0.5) < 0.03 ? -0.25 : 0;
        return ramp(["#5e7f9e", "#a8c8e0", "#e4f1f9", "#ffffff"], n + crack);
      });
    case "lava":
      return paint((x, y, z) => {
        const n = fbm(x * 2.6, y * 2.6, z * 2.6, s);
        const vein = Math.abs(fbm(x * 4, y * 4, z * 4, s + 7, 4) - 0.5);
        if (vein < 0.045) return ramp(["#ffd27a", "#ff7a1f", "#d63a0f"], vein / 0.045);
        return ramp(["#0e0706", "#24120d", "#3d1d14"], n);
      });
    case "ocean":
    case "habitable": {
      const land = type === "habitable" ? 0.53 : 0.6;
      return paint((x, y, z, lat) => {
        const n = fbm(x * 1.8, y * 1.8, z * 1.8, s);
        const polar = Math.abs(lat) > 1.25 - n * 0.2;
        if (polar) return [236, 244, 250];
        if (n > land) {
          return type === "habitable"
            ? ramp(["#2f7a46", "#5a9d4f", "#b9a46c", "#8d7a52"], (n - land) * 3.2)
            : ramp(["#3d6b4a", "#7c7650"], (n - land) * 3);
        }
        return ramp(["#0a2442", "#123e6e", "#1d6ba4", "#3a9bc8"], n / land);
      });
    }
    default:
      return paint((x, y, z) => {
        const n = fbm(x * 3, y * 3, z * 3, s);
        const crater = Math.max(0, fbm(x * 8, y * 8, z * 8, s + 31, 2) - 0.6) * 2;
        return ramp(["#3d3d42", "#6e6e74", "#a9a9ae", "#d2d2d5"], n - crater * 0.3);
      });
  }
}

const cache = new Map<string, THREE.CanvasTexture>();

/** Surface d'une planète : quelques variantes par type, partagées entre les planètes. */
export function planetTexture(type: PlanetType, variant: number): THREE.CanvasTexture {
  const key = `${type}:${variant}`;
  let texture = cache.get(key);
  if (!texture) {
    texture = new THREE.CanvasTexture(surface(type, 1000 + variant * 7919 + type.length * 31));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    cache.set(key, texture);
  }
  return texture;
}

/** Couche de nuages (transparente) pour les planètes habitables et océans. */
export function cloudTexture(variant: number): THREE.CanvasTexture {
  const key = `clouds:${variant}`;
  let texture = cache.get(key);
  if (!texture) {
    texture = new THREE.CanvasTexture(
      paint((x, y, z) => {
        const n = fbm(x * 2.5, y * 4, z * 2.5, 500 + variant * 13, 5);
        const a = Math.max(0, n - 0.5) * 2.6;
        return [255, 255, 255, Math.min(255, a * 255)];
      }),
    );
    texture.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, texture);
  }
  return texture;
}

/** Anneaux d'une géante gazeuse : bandes concentriques, l'axe x de la texture suit le rayon. */
export function ringTexture(): THREE.CanvasTexture {
  let texture = cache.get("ring");
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 4;
    const ctx = canvas.getContext("2d")!;
    for (let x = 0; x < 256; x++) {
      const t = x / 255;
      const band = 0.35 + 0.65 * Math.abs(Math.sin(t * 38) * Math.sin(t * 9 + 1));
      const edge = Math.min(1, t * 6, (1 - t) * 6);
      const gap = t > 0.62 && t < 0.67 ? 0.1 : 1;
      ctx.fillStyle = `rgba(232, 206, 160, ${(band * edge * gap * 0.85).toFixed(3)})`;
      ctx.fillRect(x, 0, 1, 4);
    }
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    cache.set("ring", texture);
  }
  return texture;
}

/** Halo radial (étoiles, atmosphères, cœurs de galaxies). */
export function glowTexture(): THREE.CanvasTexture {
  let texture = cache.get("glow");
  if (!texture) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, "rgba(255,255,255,0.75)");
    g.addColorStop(0.45, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    texture = new THREE.CanvasTexture(canvas);
    cache.set("glow", texture);
  }
  return texture;
}

/** Nébuleuse : nuage de gaz doux et irrégulier. */
export function nebulaTexture(variant: number): THREE.CanvasTexture {
  const key = `nebula:${variant}`;
  let texture = cache.get(key);
  if (!texture) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = x / size - 0.5;
        const ny = y / size - 0.5;
        const r = Math.sqrt(nx * nx + ny * ny) * 2;
        const n = fbm(nx * 3, ny * 3, variant * 1.7, 900 + variant, 5);
        const a = Math.max(0, (1 - r) * (n * 1.6 - 0.45));
        const o = (y * size + x) * 4;
        image.data[o] = image.data[o + 1] = image.data[o + 2] = 255;
        image.data[o + 3] = Math.min(255, a * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    texture = new THREE.CanvasTexture(canvas);
    cache.set(key, texture);
  }
  return texture;
}

/** Libère les textures partagées quand on quitte l'univers. */
export function disposeTextures(): void {
  cache.forEach((t) => t.dispose());
  cache.clear();
}
