import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, SearchX, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OpportunityCard, OpportunitySkeleton } from "../components/Opportunity";
import { Button, EmptyState, Pagination, Select } from "../components/ui";
import { api } from "../lib/api";
import { plural } from "../lib/format";
import { useDebounced, useDocumentTitle, useTaxonomy } from "../lib/hooks";
import type { Opportunity, Page } from "../lib/types";

const DEADLINES = [
  { value: "", label: "Toutes les dates" },
  { value: "7", label: "Dans 7 jours" },
  { value: "14", label: "Dans 14 jours" },
  { value: "30", label: "Dans 30 jours" },
];

const SORTS = [
  { value: "recent", label: "Plus récentes" },
  { value: "deadline", label: "Date limite proche" },
  { value: "budget", label: "Montant le plus élevé" },
  { value: "relevance", label: "Pertinence de la recherche" },
];

export default function Explorer() {
  useDocumentTitle("Explorer les offres");
  const [params, setParams] = useSearchParams();
  const { data: taxonomy } = useTaxonomy();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const debounced = useDebounced(search, 350);

  const filters = {
    q: params.get("q") ?? "",
    sector: params.get("secteur") ?? "",
    country: params.get("pays") ?? "",
    kind: params.get("type") ?? "",
    deadline_within: params.get("delai") ?? "",
    sort: params.get("tri") ?? "recent",
    page: Number(params.get("page") ?? 1),
  };

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced, tri: debounced && filters.sort === "recent" ? "relevance" : filters.sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query = useQuery({
    queryKey: ["opportunities", filters],
    queryFn: () =>
      api.get<Page<Opportunity>>("/opportunities", {
        q: filters.q,
        sector: filters.sector,
        country: filters.country,
        kind: filters.kind,
        deadline_within: filters.deadline_within,
        sort: filters.sort,
        page: filters.page,
      }),
    placeholderData: keepPreviousData,
  });

  const activeCount = [filters.sector, filters.country, filters.kind, filters.deadline_within].filter(Boolean).length;

  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <div>
            <span className="eyebrow">Toutes les offres ouvertes</span>
            <h1 className="page-title">
              Explorer <span className="serif">les opportunités</span>
            </h1>
            <p className="lead">
              Appels d'offres, manifestations d'intérêt, financements, concours et programmes collectés chaque jour.
              Crée ton radar pour les voir triés selon ton profil.
            </p>
          </div>
        </div>

        <div className="explorer-bar card">
          <label className="search-field">
            <Search />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher : plateforme web, solaire, formation…"
              aria-label="Rechercher une offre"
            />
          </label>
          <Button variant="soft" className="filters-toggle" icon={<SlidersHorizontal />} onClick={() => setShowFilters((v) => !v)}>
            Filtres{activeCount ? ` (${activeCount})` : ""}
          </Button>
          <div className={`explorer-filters ${showFilters ? "is-open" : ""}`}>
            <Select value={filters.sector} onChange={(e) => update({ secteur: e.target.value })} aria-label="Secteur">
              <option value="">Tous les secteurs</option>
              {taxonomy?.sectors.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select value={filters.country} onChange={(e) => update({ pays: e.target.value })} aria-label="Pays">
              <option value="">Tous les pays</option>
              {taxonomy?.countries.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select value={filters.kind} onChange={(e) => update({ type: e.target.value })} aria-label="Type d'offre">
              <option value="">Tous les types</option>
              {taxonomy?.opportunity_kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
            <Select value={filters.deadline_within} onChange={(e) => update({ delai: e.target.value })} aria-label="Date limite">
              {DEADLINES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="results-head">
          <span className="muted">
            {query.data ? plural(query.data.total, "offre trouvée", "offres trouvées") : "Recherche…"}
          </span>
          <div className="row" style={{ gap: 10 }}>
            {activeCount > 0 && (
              <button type="button" className="link small" onClick={() => setParams(filters.q ? { q: filters.q } : {})}>
                Effacer les filtres
              </button>
            )}
            <Select value={filters.sort} onChange={(e) => update({ tri: e.target.value })} aria-label="Trier" className="sort-select">
              {SORTS.filter((s) => s.value !== "relevance" || filters.q).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="opp-list" aria-busy={query.isFetching}>
          {query.isLoading && Array.from({ length: 5 }, (_, i) => <OpportunitySkeleton key={i} />)}
          {query.data?.items.map((o) => <OpportunityCard key={o.id} opportunity={o} />)}
          {query.data && !query.data.items.length && (
            <div className="card">
              <EmptyState icon={<SearchX />} title="Aucune offre ne correspond">
                Essaie d'autres mots-clés ou retire un filtre. L'agent ajoute de nouvelles offres chaque matin.
              </EmptyState>
            </div>
          )}
          {query.isError && (
            <div className="card">
              <EmptyState title="Impossible de charger les offres" action={<Button onClick={() => query.refetch()}>Réessayer</Button>}>
                Vérifie ta connexion et réessaie.
              </EmptyState>
            </div>
          )}
        </div>
        {query.data && (
          <Pagination page={query.data.page} pages={query.data.pages} onChange={(p) => update({ page: String(p) })} />
        )}
      </div>
    </div>
  );
}
