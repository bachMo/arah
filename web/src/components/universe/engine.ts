/**
 * L'univers des opportunités, vu par un astronaute.
 *
 * - Au centre, ton soleil : ton profil. Les offres qui te correspondent le mieux sont des planètes en orbite
 *   autour de toi ; plus l'orbite est proche, meilleur est le score (et, comme le veut la troisième loi de Kepler,
 *   plus la planète tourne vite).
 * - Plus loin, les galaxies : chacune regroupe une famille d'offres proches (calculée par l'Analyste). Plus une
 *   galaxie te correspond, plus elle est proche ; dans chaque galaxie, les meilleures offres sont sur le bord
 *   tourné vers toi.
 * - Une planète = une offre : son type dit la nature de l'offre, sa taille le montant, son halo l'urgence.
 *   Une comète tourne autour des offres publiées il y a moins de trois jours.
 */
import * as THREE from "three";
import type { ConstellationData, StarNode } from "../../lib/types";
import { URGENCY_COLORS } from "../Constellation3D";
import {
  cloudTexture,
  disposeTextures,
  glowTexture,
  KIND_TO_PLANET,
  nebulaTexture,
  planetTexture,
  ringTexture,
  type PlanetType,
} from "./textures";

export type TargetInfo = {
  id: string;
  type: "planet" | "galaxy" | "sun";
  name: string;
  designation: string;
  distance: number;
  planetType?: PlanetType;
  node?: StarNode;
  members?: number;
  best?: number | null;
};

export type Destination = {
  id: string;
  type: "planet" | "galaxy" | "sun";
  name: string;
  designation: string;
  score?: number | null;
  members?: number;
  urgency?: StarNode["urgency"];
};

export type Readouts = {
  distanceUa: number;
  speed: number;
  heading: number;
  nearest: { name: string; distance: number } | null;
};

type Events = {
  onAim: (target: TargetInfo | null) => void;
  onSelect: (target: TargetInfo | null) => void;
  onReadouts: (readouts: Readouts) => void;
  onWarp: (intensity: number, duration: number) => void;
};

type Options = { reducedMotion: boolean; sunName: string };

type PlanetRec = {
  id: string;
  node: StarNode;
  type: PlanetType;
  designation: string;
  radius: number;
  body: THREE.Mesh;
  root: THREE.Object3D;
  spin: number;
  clouds?: THREE.Mesh;
  glow: THREE.Sprite;
  pulse: boolean;
  orbit?: { pivot: THREE.Object3D; speed: number };
  comet?: { pivot: THREE.Object3D; head: THREE.Sprite; tail: THREE.Line; speed: number; radius: number };
  label: HTMLDivElement;
  home: boolean;
};

type GalaxyRec = {
  id: string;
  name: string;
  designation: string;
  center: THREE.Vector3;
  radius: number;
  disk: THREE.Object3D;
  members: number;
  best: number | null;
  label: HTMLDivElement;
};

const HUES = ["#7aa2ff", "#c792ea", "#5eead4", "#fbbf24", "#f472b6", "#60a5fa", "#a3e635", "#fb923c"];
const LETTERS = "bcdefghijklmnopqrstuvwxyz";
const HOME_VIEW = new THREE.Vector3(0, 22, 118);

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

function gaussian(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const POINTS_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform float uAttenuate;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.8 + 0.2 * sin(uTime * (0.6 + aSize * 0.3) + position.x * 0.13 + position.y * 0.07);
    float size = uAttenuate > 0.5 ? aSize * (260.0 / -mv.z) : aSize;
    gl_PointSize = clamp(size * twinkle, 0.0, 9.0) * uPixelRatio;
    vColor = aColor;
  }
`;

const POINTS_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * a * uOpacity);
  }
`;

function pointsMaterial(pixelRatio: number, attenuate: boolean, opacity = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: POINTS_VERTEX,
    fragmentShader: POINTS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
      uAttenuate: { value: attenuate ? 1 : 0 },
      uOpacity: { value: opacity },
    },
  });
}

function glowSprite(color: string | number, opacity: number): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  return sprite;
}

function makeLabel(layer: HTMLElement, title: string, meta: string, className = ""): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `u-label ${className}`.trim();
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = meta;
  el.append(strong, span);
  el.style.display = "none";
  layer.appendChild(el);
  return el;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function createUniverse(
  mount: HTMLElement,
  labelLayer: HTMLElement,
  data: ConstellationData & { nodes: (StarNode & { fresh?: boolean })[] },
  events: Events,
  options: Options,
) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x03040a, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03040a, 0.00018);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 8000);
  camera.position.copy(HOME_VIEW);
  camera.lookAt(0, 0, 0);
  const look = new THREE.Euler(0, 0, 0, "YXZ");
  look.setFromQuaternion(camera.quaternion);

  const timeUniforms: { value: number }[] = [];
  const rand = seeded(20261127);

  // --- Ciel lointain : étoiles, Voie lactée, nébuleuses, galaxies lointaines (suit la caméra) ----------------
  const sky = new THREE.Group();
  scene.add(sky);
  {
    const count = 7000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const tints = [new THREE.Color("#ffffff"), new THREE.Color("#cfe0ff"), new THREE.Color("#ffe8c7"), new THREE.Color("#ffd2c2")];
    const bandNormal = new THREE.Vector3(0.25, 1, 0.15).normalize();
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(gaussian(rand), gaussian(rand), gaussian(rand)).normalize();
      // Un tiers des étoiles se concentre dans la bande de la Voie lactée.
      if (i % 3 === 0) {
        v.addScaledVector(bandNormal, -v.dot(bandNormal) * 0.92).normalize();
      }
      v.multiplyScalar(3200 + rand() * 800);
      positions.set([v.x, v.y, v.z], i * 3);
      const c = tints[Math.floor(rand() * tints.length)];
      const b = 0.45 + rand() * 0.55;
      colors.set([c.r * b, c.g * b, c.b * b], i * 3);
      sizes[i] = rand() < 0.02 ? 3.2 + rand() * 2 : 0.8 + rand() * 1.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const mat = pointsMaterial(pixelRatio, false);
    timeUniforms.push(mat.uniforms.uTime);
    sky.add(new THREE.Points(geo, mat));

    const nebulaColors = ["#6d3df5", "#2b6cff", "#ff4f8b", "#19c3b2", "#ff8a3d", "#9b5cff"];
    nebulaColors.forEach((color, i) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: nebulaTexture(i),
          color,
          transparent: true,
          opacity: 0.2 + rand() * 0.12,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        }),
      );
      const dir = new THREE.Vector3(gaussian(rand), gaussian(rand) * 0.4, gaussian(rand)).normalize();
      sprite.position.copy(dir.multiplyScalar(2600));
      const s = 1300 + rand() * 1100;
      sprite.scale.set(s, s * (0.6 + rand() * 0.5), 1);
      sprite.material.rotation = rand() * Math.PI;
      sky.add(sprite);
    });

    for (let i = 0; i < 14; i++) {
      const sprite = glowSprite(HUES[i % HUES.length], 0.28);
      (sprite.material as THREE.SpriteMaterial).fog = false;
      const dir = new THREE.Vector3(gaussian(rand), gaussian(rand), gaussian(rand)).normalize();
      sprite.position.copy(dir.multiplyScalar(2900));
      const s = 40 + rand() * 70;
      sprite.scale.set(s, s * (0.25 + rand() * 0.3), 1);
      sprite.material.rotation = rand() * Math.PI;
      sky.add(sprite);
    }
  }

  // --- Ton soleil ------------------------------------------------------------------------------------------------
  const SUN_RADIUS = 7;
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS, 48, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1c9") }),
  );
  sun.userData.target = "sun";
  scene.add(sun);
  const corona = [glowSprite("#ffb547", 0.9), glowSprite("#ff6a2b", 0.45), glowSprite("#ffd98a", 0.25)];
  [30, 62, 120].forEach((s, i) => {
    corona[i].scale.set(s, s, 1);
    scene.add(corona[i]);
  });
  scene.add(new THREE.PointLight(0xfff0d6, 2.6, 0, 0));
  scene.add(new THREE.AmbientLight(0x8090b0, 0.28));
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x1a1020, 0.22));
  const sunLabel = makeLabel(labelLayer, options.sunName, data.personal ? "Ton profil · ton étoile" : "Le centre de l'univers Arah!", "u-label-sun");

  // --- Planètes --------------------------------------------------------------------------------------------------
  const sphere = new THREE.SphereGeometry(1, 40, 28);
  const ringGeo = (() => {
    const g = new THREE.RingGeometry(1.35, 2.35, 96, 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - 1.35) / 1.0, 0.5);
    }
    return g;
  })();

  const planets: PlanetRec[] = [];
  const planetById = new Map<string, PlanetRec>();
  const pickables: THREE.Object3D[] = [sun];

  function makePlanet(node: StarNode & { fresh?: boolean }, radius: number, designation: string, home: boolean): PlanetRec {
    const type = KIND_TO_PLANET[node.kind] ?? "moon";
    const h = hashString(node.id);
    const variant = h % 3;
    const root = new THREE.Object3D();
    const material = new THREE.MeshStandardMaterial({
      map: planetTexture(type, variant),
      roughness: type === "ice" ? 0.55 : 0.92,
      metalness: 0,
    });
    if (type === "lava") {
      material.emissiveMap = material.map;
      material.emissive = new THREE.Color("#ffffff");
      material.emissiveIntensity = 0.85;
    }
    const tint = new THREE.Color().setHSL(((h >> 8) % 360) / 360, 0.25, 0.92);
    material.color.copy(type === "habitable" || type === "ocean" ? new THREE.Color("#ffffff") : tint);
    const body = new THREE.Mesh(sphere, material);
    body.scale.setScalar(radius);
    body.rotation.z = (((h >> 4) % 40) - 20) * (Math.PI / 180);
    body.userData.planetId = node.id;
    root.add(body);

    let clouds: THREE.Mesh | undefined;
    if (type === "habitable" || type === "ocean") {
      clouds = new THREE.Mesh(
        sphere,
        new THREE.MeshStandardMaterial({ map: cloudTexture(variant), transparent: true, depthWrite: false, opacity: 0.9 }),
      );
      clouds.scale.setScalar(radius * 1.025);
      root.add(clouds);
    }
    if (type === "gas") {
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.scale.setScalar(radius);
      ring.rotation.x = Math.PI / 2 - 0.35;
      ring.rotation.y = 0.2;
      root.add(ring);
    }
    const glow = glowSprite(URGENCY_COLORS[node.urgency], node.urgency === "high" ? 0.75 : 0.5);
    glow.scale.setScalar(radius * (type === "habitable" ? 3.6 : 3.1));
    root.add(glow);

    let comet: PlanetRec["comet"];
    if (node.fresh) {
      const pivot = new THREE.Object3D();
      pivot.rotation.set(rand() * 1.2 - 0.6, rand() * Math.PI, rand() * 0.8 - 0.4);
      const head = glowSprite("#d8f3ff", 1);
      const r = radius * 3.4;
      head.scale.setScalar(Math.max(1.4, radius * 0.9));
      const tailPoints = 32;
      const tailPos = new Float32Array(tailPoints * 3);
      const tailCol = new Float32Array(tailPoints * 3);
      for (let i = 0; i < tailPoints; i++) {
        const fade = 1 - i / tailPoints;
        tailCol.set([0.75 * fade, 0.92 * fade, 1 * fade], i * 3);
      }
      const tailGeo = new THREE.BufferGeometry();
      tailGeo.setAttribute("position", new THREE.BufferAttribute(tailPos, 3));
      tailGeo.setAttribute("color", new THREE.BufferAttribute(tailCol, 3));
      const tail = new THREE.Line(
        tailGeo,
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      pivot.add(head, tail);
      root.add(pivot);
      comet = { pivot, head, tail, speed: 0.9 + rand() * 0.5, radius: r };
    }

    const score = node.score != null ? ` · ${node.score}/100` : "";
    const label = makeLabel(labelLayer, truncate(node.title, 42), `${designation}${score}`, home ? "u-label-home" : "");
    const rec: PlanetRec = {
      id: node.id,
      node,
      type,
      designation,
      radius,
      body,
      root,
      spin: 0.05 + ((h >> 12) % 100) / 900,
      clouds,
      glow,
      pulse: node.urgency === "high",
      comet,
      label,
      home,
    };
    planets.push(rec);
    planetById.set(node.id, rec);
    pickables.push(body);
    return rec;
  }

  const planetRadius = (n: StarNode, home: boolean) => (1.1 + n.size * 2) * (home ? 1.2 : 1);

  // Système solaire personnel : les meilleures offres en orbite.
  const scored = data.nodes.filter((n) => n.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const homeNodes = data.personal
    ? scored.filter((n) => (n.score ?? 0) >= 55).slice(0, 12)
    : [...data.nodes]
        .filter((n) => n.urgency === "high" || n.urgency === "medium")
        .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
        .slice(0, 8);
  const homeIds = new Set(homeNodes.map((n) => n.id));
  const homeDest: Destination[] = [];
  let orbitRadius = 20;
  homeNodes.forEach((node, i) => {
    const r = planetRadius(node, true);
    orbitRadius += r + 5.5;
    const designation = `${options.sunName} ${LETTERS[i] ?? i + 1}`;
    const rec = makePlanet(node, r, designation, true);
    const pivot = new THREE.Object3D();
    pivot.rotation.x = (rand() - 0.5) * 0.18;
    pivot.rotation.z = (rand() - 0.5) * 0.18;
    const spinner = new THREE.Object3D();
    spinner.rotation.y = rand() * Math.PI * 2;
    pivot.add(spinner);
    rec.root.position.set(orbitRadius, 0, 0);
    spinner.add(rec.root);
    scene.add(pivot);
    // Troisième loi de Kepler : la période croît comme le rayon puissance 3/2.
    rec.orbit = { pivot: spinner, speed: 0.9 * Math.pow(20 / orbitRadius, 1.5) };
    const path = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius).getPoints(160)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 }),
    );
    path.rotation.x = Math.PI / 2;
    pivot.add(path);
    orbitRadius += r;
    homeDest.push({ id: node.id, type: "planet", name: node.title, designation, score: node.score, urgency: node.urgency });
  });

  // Galaxies : une par famille d'offres.
  const groups = new Map<number, (StarNode & { fresh?: boolean })[]>();
  data.nodes.forEach((n) => {
    if (homeIds.has(n.id)) return;
    groups.set(n.cluster, [...(groups.get(n.cluster) ?? []), n]);
  });
  const clusterInfo = new Map(data.clusters.map((c) => [c.id, c]));
  const relevance = (members: StarNode[]) => {
    if (!data.personal) return members.length;
    const top = members.map((m) => m.score ?? 10).sort((a, b) => b - a).slice(0, 3);
    return top.reduce((a, b) => a + b, 0) / Math.max(1, top.length);
  };
  const ordered = [...groups.entries()].sort((a, b) => relevance(b[1]) - relevance(a[1]));
  const galaxies: GalaxyRec[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  ordered.forEach(([clusterId, members], rank) => {
    const info = clusterInfo.get(clusterId);
    const name = info?.label ?? "Divers";
    const designation = `AR-${1000 + ((clusterId * 733 + 211) % 9000)}`;
    const radius = 26 + Math.min(34, members.length * 1.6);
    const y = 1 - ((rank + 0.5) / Math.max(1, ordered.length)) * 2;
    const ring = Math.sqrt(1 - y * y);
    const theta = rank * golden + 0.6;
    const dir = new THREE.Vector3(Math.cos(theta) * ring, y * 0.38, Math.sin(theta) * ring).normalize();
    const distance = 190 + rank * 95 + rand() * 40;
    const center = dir.multiplyScalar(distance);

    const frame = new THREE.Object3D();
    frame.position.copy(center);
    frame.rotation.set((rand() - 0.5) * 1.6, rand() * Math.PI * 2, (rand() - 0.5) * 1.0);
    scene.add(frame);

    const disk = new THREE.Object3D();
    frame.add(disk);
    const hue = new THREE.Color(HUES[clusterId % HUES.length]);
    const coreColor = new THREE.Color("#fff3d6");
    const count = Math.min(3200, 1500 + members.length * 40);
    const arms = 2 + (clusterId % 3);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const mix = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = Math.pow(rand(), 0.75);
      const arm = i % arms;
      const angle = (arm / arms) * Math.PI * 2 + t * Math.PI * 3.1 + gaussian(rand) * 0.32 * (1.1 - t * 0.6);
      const r = t * radius + Math.abs(gaussian(rand)) * 0.8;
      positions.set([Math.cos(angle) * r, gaussian(rand) * radius * 0.035 * (1.2 - t), Math.sin(angle) * r], i * 3);
      mix.copy(coreColor).lerp(hue, Math.min(1, t * 1.25));
      const b = 0.55 + rand() * 0.45;
      colors.set([mix.r * b, mix.g * b, mix.b * b], i * 3);
      sizes[i] = 0.9 + rand() * 1.6 + (t < 0.12 ? 1.2 : 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const mat = pointsMaterial(pixelRatio, true);
    timeUniforms.push(mat.uniforms.uTime);
    disk.add(new THREE.Points(geo, mat));
    const core = glowSprite("#ffe2b0", 0.9);
    core.scale.setScalar(radius * 0.7);
    frame.add(core);
    const halo = glowSprite(HUES[clusterId % HUES.length], 0.3);
    halo.scale.setScalar(radius * 2.4);
    frame.add(halo);

    // Les meilleures offres sur le bord tourné vers le soleil.
    frame.updateMatrixWorld(true);
    const toSun = center.clone().negate().normalize().applyQuaternion(frame.quaternion.clone().invert());
    const base = Math.atan2(toSun.z, toSun.x);
    const sorted = [...members].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    sorted.forEach((node, k) => {
      const side = k % 2 === 0 ? 1 : -1;
      const angle = base + side * Math.ceil(k / 2) * (0.5 + 2.2 / Math.max(4, sorted.length));
      const r = radius * (0.92 - (0.55 * k) / Math.max(1, sorted.length));
      const rec = makePlanet(node, planetRadius(node, false), `${designation}-${k + 1}`, false);
      rec.root.position.set(Math.cos(angle) * r, (rand() - 0.5) * radius * 0.12, Math.sin(angle) * r);
      frame.add(rec.root);
    });

    const best = data.personal ? (sorted[0]?.score ?? null) : null;
    const label = makeLabel(
      labelLayer,
      `Galaxie ${name}`,
      `${designation} · ${members.length} planète${members.length > 1 ? "s" : ""}${best != null ? ` · jusqu'à ${best}/100` : ""}`,
      "u-label-galaxy",
    );
    galaxies.push({ id: `g${clusterId}`, name, designation, center, radius, disk, members: members.length, best, label });
  });

  const galaxyById = new Map(galaxies.map((g) => [g.id, g]));

  // --- Étoiles filantes ------------------------------------------------------------------------------------------
  const shooting = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, fog: false }),
  );
  sky.add(shooting);
  let shootingT = -1;
  let nextShooting = 4;
  const shootFrom = new THREE.Vector3();
  const shootDir = new THREE.Vector3();

  // --- Contrôles de l'astronaute ---------------------------------------------------------------------------------
  const velocity = new THREE.Vector3();
  const keys = new Set<string>();
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDistance = 0;
  let downAt = { x: 0, y: 0, time: 0 };
  let dragging = false;
  const pointerNdc = new THREE.Vector2(9, 9);
  const raycaster = new THREE.Raycaster();

  type Flight = {
    resolve: () => { position: THREE.Vector3; lookAt: THREE.Vector3 };
    from: THREE.Vector3;
    fromQuat: THREE.Quaternion;
    start: number;
    duration: number;
    follow?: PlanetRec;
    after?: () => void;
  };
  let flight: Flight | null = null;
  let follow: { planet: PlanetRec; offset: THREE.Vector3 } | null = null;
  let selectedId: string | null = null;

  const elapsed = () => performance.now() / 1000;

  function planetWorld(rec: PlanetRec, out = new THREE.Vector3()) {
    return rec.root.getWorldPosition(out);
  }

  function info(id: string): TargetInfo | null {
    if (id === "sun") {
      return {
        id,
        type: "sun",
        name: options.sunName,
        designation: data.personal ? "Ton profil" : "Centre",
        distance: camera.position.length(),
      };
    }
    const planet = planetById.get(id);
    if (planet) {
      return {
        id,
        type: "planet",
        name: planet.node.title,
        designation: planet.designation,
        planetType: planet.type,
        node: planet.node,
        distance: camera.position.distanceTo(planetWorld(planet)),
      };
    }
    const galaxy = galaxyById.get(id);
    if (galaxy) {
      return {
        id,
        type: "galaxy",
        name: `Galaxie ${galaxy.name}`,
        designation: galaxy.designation,
        members: galaxy.members,
        best: galaxy.best,
        distance: camera.position.distanceTo(galaxy.center),
      };
    }
    return null;
  }

  function flyTo(id: string) {
    follow = null;
    const fromQuat = camera.quaternion.clone();
    const from = camera.position.clone();
    let resolve: Flight["resolve"];
    let followPlanet: PlanetRec | undefined;
    let distance: number;
    if (id === "sun") {
      resolve = () => ({ position: HOME_VIEW.clone(), lookAt: new THREE.Vector3() });
      distance = from.distanceTo(HOME_VIEW);
    } else if (planetById.has(id)) {
      const planet = planetById.get(id)!;
      followPlanet = planet;
      const target = planetWorld(planet);
      const dir = from.clone().sub(target).normalize();
      // On arrive un peu au-dessus, côté éclairé quand c'est possible.
      dir.lerp(target.clone().negate().normalize(), 0.35).add(new THREE.Vector3(0, 0.25, 0)).normalize();
      const standoff = planet.radius * 4.2 + 5;
      resolve = () => {
        const p = planetWorld(planet);
        return { position: p.clone().addScaledVector(dir, standoff), lookAt: p };
      };
      distance = from.distanceTo(target);
    } else {
      const galaxy = galaxyById.get(id);
      if (!galaxy) return;
      const dir = from.clone().sub(galaxy.center).normalize().add(new THREE.Vector3(0, 0.45, 0)).normalize();
      resolve = () => ({
        position: galaxy.center.clone().addScaledVector(dir, galaxy.radius * 2.1),
        lookAt: galaxy.center.clone(),
      });
      distance = from.distanceTo(galaxy.center);
    }
    const duration = options.reducedMotion ? 0.01 : Math.min(3.2, 0.9 + distance / 260);
    if (!options.reducedMotion && distance > 240) events.onWarp(Math.min(1, distance / 900), duration);
    flight = { resolve, from, fromQuat, start: elapsed(), duration, follow: followPlanet };
    velocity.set(0, 0, 0);
    if (id !== "sun" && !galaxyById.has(id)) {
      selectedId = id;
      events.onSelect(info(id));
    } else {
      selectedId = null;
      events.onSelect(id === "sun" ? null : info(id));
    }
  }

  function cancelAutopilot() {
    flight = null;
    follow = null;
    look.setFromQuaternion(camera.quaternion);
  }

  function pick(ndc: THREE.Vector2): string | null {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    if (!hit) return null;
    return hit.object.userData.planetId ?? (hit.object.userData.target === "sun" ? "sun" : null);
  }

  const canvas = renderer.domElement;
  canvas.style.touchAction = "none";

  const onPointerDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = { x: e.clientX, y: e.clientY, time: performance.now() };
    dragging = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const previous = pointers.get(e.pointerId);
    if (!previous) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDistance) {
        if (flight || follow) cancelAutopilot();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        velocity.addScaledVector(forward, (d - pinchDistance) * 0.9);
      }
      pinchDistance = d;
      return;
    }
    const dx = e.clientX - previous.x;
    const dy = e.clientY - previous.y;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) dragging = true;
    if (!dragging) return;
    if (flight || follow) cancelAutopilot();
    const sensitivity = e.pointerType === "touch" ? 0.0045 : 0.0032;
    look.y -= dx * sensitivity;
    look.x = Math.max(-1.45, Math.min(1.45, look.x - dy * sensitivity));
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    const quick = performance.now() - downAt.time < 450;
    if (!dragging && quick && pointers.size === 0) {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      const id = pick(ndc);
      if (id) flyTo(id);
    }
    dragging = false;
  };
  const onPointerLeave = () => pointerNdc.set(9, 9);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (flight || follow) cancelAutopilot();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    velocity.addScaledVector(forward, Math.max(-60, Math.min(60, -e.deltaY * 0.08)));
  };
  const typing = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  };
  const MOVE_KEYS = new Set(["KeyW", "KeyZ", "KeyS", "KeyA", "KeyQ", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyC", "ShiftLeft", "ShiftRight", "KeyE", "KeyR", "KeyF"]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (typing(e)) return;
    if (MOVE_KEYS.has(e.code)) {
      if (e.code !== "ShiftLeft" && e.code !== "ShiftRight" && (flight || follow)) cancelAutopilot();
      keys.add(e.code);
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    }
    if (e.code === "Enter") {
      const id = pick(new THREE.Vector2(0, 0));
      if (id) flyTo(id);
    }
    if (e.code === "KeyH") flyTo("sun");
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => keys.clear();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  let viewShift = 0;
  const resize = () => {
    viewShift = 0;
    camera.clearViewOffset();
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);
  resize();

  // --- Arrivée : on part de loin et on file vers le soleil ---------------------------------------------------------
  if (!options.reducedMotion) {
    camera.position.set(-140, 260, 1700);
    camera.lookAt(0, 0, 0);
    look.setFromQuaternion(camera.quaternion);
    events.onWarp(1, 2.6);
    flight = {
      resolve: () => ({ position: HOME_VIEW.clone(), lookAt: new THREE.Vector3() }),
      from: camera.position.clone(),
      fromQuat: camera.quaternion.clone(),
      start: elapsed() + 0.15,
      duration: 2.8,
    };
  }

  // --- Boucle ----------------------------------------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const lookQuat = new THREE.Quaternion();
  const lookMatrix = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  let last = elapsed();
  let lastHud = 0;
  let lastAim: string | null = null;
  let frame = 0;
  let width = mount.clientWidth;
  let height = mount.clientHeight;

  // Étiquettes : on les place par ordre d'importance et on masque celles qui en chevaucheraient une autre.
  type LabelCandidate = { el: HTMLDivElement; x: number; y: number; opacity: number; priority: number };
  const labelQueue: LabelCandidate[] = [];
  const labelSizes = new WeakMap<HTMLDivElement, { w: number; h: number }>();
  const hideLabel = (el: HTMLDivElement) => {
    if (el.style.display !== "none") el.style.display = "none";
  };
  function placeLabel(el: HTMLDivElement, world: THREE.Vector3, visible: boolean, opacity = 1, priority = 0) {
    if (!visible) return hideLabel(el);
    projected.copy(world).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.05 || Math.abs(projected.y) > 1.05) return hideLabel(el);
    labelQueue.push({ el, x: ((projected.x + 1) / 2) * width, y: ((1 - projected.y) / 2) * height - 8, opacity, priority });
  }
  function flushLabels() {
    labelQueue.sort((a, b) => b.priority - a.priority);
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const c of labelQueue) {
      let size = labelSizes.get(c.el);
      if (!size) {
        c.el.style.display = "";
        size = { w: c.el.offsetWidth || 160, h: c.el.offsetHeight || 30 };
        labelSizes.set(c.el, size);
      }
      const box = { l: c.x - size.w / 2 - 4, r: c.x + size.w / 2 + 4, t: c.y - size.h - 2, b: c.y + 2 };
      if (placed.some((o) => box.l < o.r && box.r > o.l && box.t < o.b && box.b > o.t)) {
        hideLabel(c.el);
        continue;
      }
      placed.push(box);
      if (c.el.style.display === "none") c.el.style.display = "";
      c.el.style.opacity = c.opacity.toFixed(2);
      c.el.style.transform = `translate(-50%, -100%) translate(${c.x}px, ${c.y}px)`;
    }
    labelQueue.length = 0;
  }

  const animate = () => {
    frame = requestAnimationFrame(animate);
    if (document.hidden) return;
    const now = elapsed();
    const dt = Math.min(0.05, now - last);
    last = now;
    width = mount.clientWidth;
    height = mount.clientHeight;
    timeUniforms.forEach((u) => (u.value = now));

    // Mouvements de la scène
    planets.forEach((p) => {
      p.body.rotation.y += dt * p.spin;
      if (p.clouds) p.clouds.rotation.y += dt * p.spin * 1.35;
      if (p.orbit) p.orbit.pivot.rotation.y += dt * p.orbit.speed * 0.12;
      if (p.pulse) (p.glow.material as THREE.SpriteMaterial).opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(now * 3));
      if (p.comet) {
        const c = p.comet;
        const a = now * c.speed;
        c.head.position.set(Math.cos(a) * c.radius, 0, Math.sin(a) * c.radius);
        const pos = c.tail.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const b = a - i * 0.045;
          const spread = c.radius * (1 + i * 0.012);
          pos.setXYZ(i, Math.cos(b) * spread, 0, Math.sin(b) * spread);
        }
        pos.needsUpdate = true;
      }
    });
    galaxies.forEach((g) => (g.disk.rotation.y += dt * 0.015));
    corona[0].material.rotation += dt * 0.02;
    const coronaPulse = 1 + 0.04 * Math.sin(now * 1.3);
    corona[1].scale.set(62 * coronaPulse, 62 * coronaPulse, 1);

    // Pilote automatique ou pilotage manuel
    if (flight) {
      const t = Math.max(0, Math.min(1, (now - flight.start) / flight.duration));
      const target = flight.resolve();
      const k = ease(t);
      camera.position.lerpVectors(flight.from, target.position, k);
      lookMatrix.lookAt(camera.position, target.lookAt, up);
      lookQuat.setFromRotationMatrix(lookMatrix);
      camera.quaternion.slerpQuaternions(flight.fromQuat, lookQuat, Math.min(1, k * 1.5));
      camera.fov = 62 + Math.sin(Math.PI * t) * (flight.duration > 1.5 ? 14 : 4);
      camera.updateProjectionMatrix();
      if (t >= 1) {
        if (flight.follow) follow = { planet: flight.follow, offset: camera.position.clone().sub(planetWorld(flight.follow)) };
        flight = null;
        look.setFromQuaternion(camera.quaternion);
      }
    } else {
      if (follow) {
        camera.position.copy(planetWorld(follow.planet, tmp)).add(follow.offset);
      }
      const boost = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4 : 1;
      const thrust = 46 * boost * dt;
      const forward = tmp.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = tmp2.set(1, 0, 0).applyQuaternion(camera.quaternion);
      if (keys.has("KeyW") || keys.has("KeyZ") || keys.has("ArrowUp")) velocity.addScaledVector(forward, thrust);
      if (keys.has("KeyS") || keys.has("ArrowDown")) velocity.addScaledVector(forward, -thrust);
      if (keys.has("KeyA") || keys.has("KeyQ") || keys.has("ArrowLeft")) velocity.addScaledVector(right, -thrust);
      if (keys.has("KeyD") || keys.has("ArrowRight")) velocity.addScaledVector(right, thrust);
      if (keys.has("Space") || keys.has("KeyR")) velocity.y += thrust;
      if (keys.has("KeyC") || keys.has("KeyF")) velocity.y -= thrust;
      velocity.multiplyScalar(Math.exp(-1.6 * dt));
      camera.position.addScaledVector(velocity, dt);
      // On ne traverse pas le soleil.
      const minSun = SUN_RADIUS + 6;
      if (camera.position.length() < minSun) camera.position.setLength(minSun);
      camera.quaternion.setFromEuler(look);
      // Léger flottement d'apesanteur
      camera.position.y += Math.sin(now * 0.7) * 0.004;
      if (camera.fov !== 62) {
        camera.fov += (62 - camera.fov) * Math.min(1, dt * 4);
        camera.updateProjectionMatrix();
      }
    }

    // Sur téléphone, la fiche couvre le bas de l'écran : on remonte le cadrage pour garder l'objet visible.
    const shiftTarget = selectedId && width < 860 ? height * 0.22 : 0;
    if (Math.abs(shiftTarget - viewShift) > 0.5) {
      viewShift += (shiftTarget - viewShift) * Math.min(1, dt * 5);
      if (viewShift < 0.5) camera.clearViewOffset();
      else camera.setViewOffset(width, height, 0, viewShift, width, height);
      camera.updateProjectionMatrix();
    }

    // Le ciel lointain suit l'astronaute : il est « à l'infini ».
    sky.position.copy(camera.position);

    // Étoile filante de temps en temps
    if (shootingT < 0 && now > nextShooting) {
      shootingT = 0;
      shootFrom.set(gaussian(rand), Math.abs(gaussian(rand)) * 0.6 + 0.2, gaussian(rand)).normalize().multiplyScalar(2500);
      shootDir.set(gaussian(rand), -0.4, gaussian(rand)).normalize();
    }
    if (shootingT >= 0) {
      shootingT += dt;
      const p = shooting.geometry.attributes.position as THREE.BufferAttribute;
      const head = tmp.copy(shootFrom).addScaledVector(shootDir, shootingT * 1400);
      const tail = tmp2.copy(head).addScaledVector(shootDir, -260);
      p.setXYZ(0, head.x, head.y, head.z);
      p.setXYZ(1, tail.x, tail.y, tail.z);
      p.needsUpdate = true;
      (shooting.material as THREE.LineBasicMaterial).opacity = Math.sin(Math.min(1, shootingT / 0.9) * Math.PI) * 0.9;
      if (shootingT > 0.9) {
        shootingT = -1;
        nextShooting = now + 5 + rand() * 9;
      }
    }

    // Visée au centre de l'écran
    const aimed = flight ? null : pick(new THREE.Vector2(0, 0));
    if (aimed !== lastAim) {
      lastAim = aimed;
      events.onAim(aimed ? info(aimed) : null);
    }
    // Survol à la souris
    const hovered = dragging || pointers.size ? null : pick(pointerNdc);
    canvas.style.cursor = hovered ? "pointer" : pointers.size ? "grabbing" : "grab";

    // Étiquettes
    placeLabel(sunLabel, tmp.set(0, SUN_RADIUS + 3, 0), true, 1, 500);
    galaxies.forEach((g) => {
      const d = camera.position.distanceTo(g.center);
      placeLabel(g.label, tmp.copy(g.center).add(tmp2.set(0, g.radius * 0.45, 0)), d > g.radius * 1.3, Math.min(1, (d - g.radius * 1.3) / 60 + 0.25), g.id === selectedId ? 900 : 150 + (g.best ?? 0));
    });
    planets.forEach((p) => {
      const world = planetWorld(p, tmp);
      const d = camera.position.distanceTo(world);
      const range = p.home ? 330 : p.radius * 26 + 40;
      // La planète choisie est décrite par la fiche : son étiquette ferait doublon.
      const visible = p.id !== selectedId && (p.id === hovered || p.id === aimed || d < range);
      const focus = p.id === selectedId || p.id === aimed || p.id === hovered;
      placeLabel(
        p.label,
        world.add(tmp2.set(0, p.radius * 1.3, 0)),
        visible,
        focus ? 1 : Math.max(0.35, 1 - d / range),
        (focus ? 1000 : 0) + (p.node.score ?? 0) - d * 0.05,
      );
      p.label.classList.toggle("is-active", focus);
    });
    flushLabels();

    // Tableau de bord du casque (quelques fois par seconde)
    if (now - lastHud > 0.25) {
      lastHud = now;
      let nearest: Readouts["nearest"] = null;
      planets.forEach((p) => {
        const d = camera.position.distanceTo(planetWorld(p, tmp)) - p.radius;
        if (!nearest || d < nearest.distance) nearest = { name: p.node.title, distance: d };
      });
      const heading = ((THREE.MathUtils.radToDeg(-look.y) % 360) + 360) % 360;
      const speed = flight ? camera.position.distanceTo(flight.from) / Math.max(0.1, now - flight.start) : velocity.length();
      events.onReadouts({ distanceUa: camera.position.length() / 10, speed: speed * 7.2, heading, nearest });
    }

    renderer.render(scene, camera);
  };
  animate();

  const destinations = {
    home: homeDest,
    galaxies: galaxies.map<Destination>((g) => ({
      id: g.id,
      type: "galaxy",
      name: g.name,
      designation: g.designation,
      members: g.members,
      score: g.best,
    })),
  };

  return {
    destinations,
    flyTo,
    goHome: () => flyTo("sun"),
    deselect: () => {
      selectedId = null;
      events.onSelect(null);
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry && mesh.geometry !== sphere && mesh.geometry !== ringGeo) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      sphere.dispose();
      ringGeo.dispose();
      disposeTextures();
      renderer.dispose();
      mount.removeChild(canvas);
      labelLayer.innerHTML = "";
    },
  };
}

export type UniverseEngine = ReturnType<typeof createUniverse>;
