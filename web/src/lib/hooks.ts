import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { PublicConfig, Taxonomy } from "./types";

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => api.get<PublicConfig>("/config"), staleTime: Infinity });
}

export function useTaxonomy() {
  const query = useQuery({ queryKey: ["taxonomy"], queryFn: () => api.get<Taxonomy>("/taxonomy"), staleTime: Infinity });
  const labels = useMemo(() => {
    const data = query.data;
    const toMap = (list?: { value: string; label: string }[]) =>
      Object.fromEntries((list ?? []).map((o) => [o.value, o.label])) as Record<string, string>;
    return {
      sector: toMap(data?.sectors),
      country: toMap(data?.countries),
      kind: toMap(data?.opportunity_kinds),
      org: toMap(data?.org_types),
      doc: toMap(data?.doc_types),
    };
  }, [query.data]);
  return { ...query, labels };
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · Arah!` : "Arah!";
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const targets = node.querySelectorAll<HTMLElement>(".reveal");
    if (!("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  });
  return ref;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) {
      setValue(0);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}
