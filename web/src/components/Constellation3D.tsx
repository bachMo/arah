import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { deadlineLabel } from "../lib/format";
import type { ConstellationData, StarNode } from "../lib/types";

export const URGENCY_COLORS: Record<StarNode["urgency"], string> = {
  high: "#ff4f1f",
  medium: "#e9a400",
  low: "#1f8a5b",
  none: "#8c8273",
};

const VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  uniform float uPixelRatio;
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float twinkle = 1.0 + 0.06 * sin(uTime * 1.6 + position.x * 3.1 + position.y * 2.3);
    gl_PointSize = aSize * twinkle * uPixelRatio * (34.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.30, 0.18, d);
    float halo = smoothstep(0.5, 0.18, d) * 0.38;
    float ring = smoothstep(0.035, 0.0, abs(d - 0.36)) * 0.55;
    float alpha = max(core, max(halo, ring)) * vAlpha;
    vec3 color = mix(mix(vColor, vec3(1.0), 0.45), vColor, core);
    gl_FragColor = vec4(color, alpha);
  }
`;

/** Espace occupé par des panneaux posés sur la scène, en pixels : la scène se centre dans la zone libre. */
export type SceneInsets = { left: number; right: number };

type Props = {
  data: ConstellationData;
  onSelect: (node: StarNode) => void;
  dimmed?: (node: StarNode) => boolean;
  autoRotate?: boolean;
  insets?: SceneInsets;
};

export function Constellation3D({ data, onSelect, dimmed, autoRotate = true, insets }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const insetsRef = useRef<SceneInsets>(insets ?? { left: 0, right: 0 });
  const resizeRef = useRef<() => void>(() => {});
  const labelsRef = useRef<HTMLDivElement>(null);
  const alphaRef = useRef<THREE.BufferAttribute | null>(null);
  const [hover, setHover] = useState<{ node: StarNode; x: number; y: number } | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const mount = mountRef.current;
    const labelLayer = labelsRef.current;
    if (!mount || !labelLayer) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(0, 3.2, data.personal ? 15.5 : 16);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.45;
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.enablePan = false;

    const count = data.nodes.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count).fill(1);
    const color = new THREE.Color();
    data.nodes.forEach((n, i) => {
      positions.set([n.x, n.y, n.z], i * 3);
      color.set(URGENCY_COLORS[n.urgency]).convertLinearToSRGB();
      colors.set([color.r, color.g, color.b], i * 3);
      sizes[i] = 9 + n.size * 18 + (n.score != null && n.score >= 70 ? 6 : 0);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const alphaAttr = new THREE.BufferAttribute(alphas, 1);
    geometry.setAttribute("aAlpha", alphaAttr);
    alphaRef.current = alphaAttr;

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: { uPixelRatio: { value: renderer.getPixelRatio() }, uTime: { value: 0 } },
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Fils discrets entre chaque étoile et le centre de son groupe
    const centroids = new Map(data.clusters.map((c) => [c.id, c]));
    const linePositions: number[] = [];
    data.nodes.forEach((n) => {
      const c = centroids.get(n.cluster);
      if (c) linePositions.push(n.x, n.y, n.z, c.x, c.y, c.z);
    });
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({ color: 0x9c8f7a, transparent: true, opacity: 0.16 }),
    );
    scene.add(lines);

    // Anneaux de distance autour du profil
    const rings = new THREE.Group();
    [3, 6, 9].forEach((r, i) => {
      const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2);
      const ringGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(128));
      const ring = new THREE.LineLoop(
        ringGeo,
        new THREE.LineBasicMaterial({ color: i === 0 ? 0xff4f1f : 0x15130f, transparent: true, opacity: i === 0 ? 0.3 : 0.08 }),
      );
      ring.rotation.x = Math.PI / 2;
      rings.add(ring);
    });
    scene.add(rings);

    // Le profil au centre
    const me = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 32), new THREE.MeshBasicMaterial({ color: 0x15130f }));
    scene.add(me);
    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.55, 48),
      new THREE.MeshBasicMaterial({ color: 0xff4f1f, transparent: true, side: THREE.DoubleSide }),
    );
    scene.add(pulse);

    // Étiquettes des groupes (HTML projeté)
    labelLayer.innerHTML = "";
    const labelEls = data.clusters.map((c) => {
      const el = document.createElement("div");
      el.className = "cluster-label";
      el.textContent = c.label;
      labelLayer.appendChild(el);
      return { el, pos: new THREE.Vector3(c.x * 1.08, c.y * 1.08 + 0.9, c.z * 1.08) };
    });
    const meLabel = document.createElement("div");
    meLabel.className = "cluster-label me-label";
    meLabel.textContent = data.personal ? "Ton profil" : "Centre";
    labelLayer.appendChild(meLabel);

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.35 };
    const pointer = new THREE.Vector2(10, 10);
    let pointerClient = { x: 0, y: 0 };
    let hovered = -1;
    let downAt = { x: 0, y: 0 };

    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pointerClient = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onLeave = () => {
      pointer.set(10, 10);
      hovered = -1;
      setHover(null);
    };
    const onDown = (e: PointerEvent) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      if (moved < 6 && hovered >= 0) onSelectRef.current(data.nodes[hovered]);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / Math.max(1, h);
      // Centre la scène dans la zone que les panneaux laissent libre, et la réduit pour qu'elle y tienne.
      const { left, right } = insetsRef.current;
      const free = Math.max(w * 0.35, w - left - right);
      if (left || right) {
        camera.setViewOffset(w, h, (right - left) / 2, 0, w, h);
        camera.zoom = Math.min(1, (free / w) * 1.45);
      } else {
        camera.clearViewOffset();
        camera.zoom = 1;
      }
      camera.updateProjectionMatrix();
    };
    resizeRef.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const projected = new THREE.Vector3();
    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      material.uniforms.uTime.value = t;
      controls.update();
      pulse.lookAt(camera.position);
      const s = 1 + ((t * 0.8) % 1) * 2.2;
      pulse.scale.set(s, s, s);
      (pulse.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - ((t * 0.8) % 1));

      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(points)[0];
      const index = hit?.index ?? -1;
      if (index !== hovered) {
        hovered = index;
        renderer.domElement.style.cursor = index >= 0 ? "pointer" : "grab";
        setHover(index >= 0 ? { node: data.nodes[index], ...pointerClient } : null);
      } else if (index >= 0) {
        setHover((h) => (h && Math.hypot(h.x - pointerClient.x, h.y - pointerClient.y) > 2 ? { ...h, ...pointerClient } : h));
      }

      const { clientWidth: w, clientHeight: h } = mount;
      const place = (el: HTMLElement, pos: THREE.Vector3) => {
        projected.copy(pos).project(camera);
        const visible = projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
        el.style.opacity = visible ? "1" : "0";
        el.style.transform = `translate(-50%, -50%) translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px)`;
      };
      labelEls.forEach(({ el, pos }) => place(el, pos));
      place(meLabel, new THREE.Vector3(0, -1.5, 0));
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose?.();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      labelLayer.innerHTML = "";
      alphaRef.current = null;
    };
  }, [data, autoRotate]);

  useEffect(() => {
    insetsRef.current = insets ?? { left: 0, right: 0 };
    resizeRef.current();
  }, [insets?.left, insets?.right]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const attr = alphaRef.current;
    if (!attr) return;
    data.nodes.forEach((n, i) => attr.setX(i, dimmed?.(n) ? 0.12 : 1));
    attr.needsUpdate = true;
  }, [data, dimmed]);

  return (
    <div className="constellation-3d">
      <div ref={mountRef} className="constellation-canvas" />
      <div ref={labelsRef} className="constellation-labels" aria-hidden />
      {hover && (
        <div className="star-tooltip" style={{ left: hover.x, top: hover.y }}>
          <span className="star-tooltip-meta" style={{ color: URGENCY_COLORS[hover.node.urgency] }}>
            ● {deadlineLabel(hover.node.deadline).label}
            {hover.node.score != null && <> · {hover.node.score}/100</>}
          </span>
          <strong>{hover.node.title}</strong>
          <span className="muted">{hover.node.issuer}</span>
        </div>
      )}
    </div>
  );
}
