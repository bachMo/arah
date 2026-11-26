"""Constellation 3D : chaque offre est une étoile ; les offres qui se ressemblent sont proches.

Positions calculées par TF-IDF puis décomposition en valeurs singulières, groupes par k-moyennes.
Quand l'utilisateur est connecté, la distance au centre traduit son score : plus c'est proche, mieux c'est.
"""

from __future__ import annotations

import math
import time
import uuid
from collections import Counter
from typing import Any

import numpy as np

from app.core.db import utcnow
from app.core.text import tokens
from app.models import Opportunity
from app.taxonomy import sector_label

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
CACHE_SECONDS = 300


def _tfidf(docs: list[list[str]], max_terms: int = 1500) -> tuple[np.ndarray, list[str]]:
    df: Counter[str] = Counter()
    for doc in docs:
        df.update(set(doc))
    vocab = [t for t, n in df.most_common(max_terms) if n >= 2] or [t for t, _ in df.most_common(max_terms)]
    index = {t: i for i, t in enumerate(vocab)}
    matrix = np.zeros((len(docs), len(vocab)), dtype=np.float32)
    n_docs = len(docs)
    for row, doc in enumerate(docs):
        counts = Counter(t for t in doc if t in index)
        for term, tf in counts.items():
            matrix[row, index[term]] = (1 + math.log(tf)) * math.log((1 + n_docs) / (1 + df[term]) + 1)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return matrix / norms, vocab


def _kmeans(points: np.ndarray, k: int, iterations: int = 30, seed: int = 7) -> np.ndarray:
    rng = np.random.default_rng(seed)
    centers = [points[rng.integers(len(points))]]
    for _ in range(1, k):
        dist = np.min(((points[:, None, :] - np.array(centers)[None, :, :]) ** 2).sum(-1), axis=1)
        probs = dist / dist.sum() if dist.sum() > 0 else np.full(len(points), 1 / len(points))
        centers.append(points[rng.choice(len(points), p=probs)])
    centers_arr = np.array(centers)
    labels = np.zeros(len(points), dtype=int)
    for _ in range(iterations):
        labels = np.argmin(((points[:, None, :] - centers_arr[None, :, :]) ** 2).sum(-1), axis=1)
        new = np.array(
            [points[labels == i].mean(0) if np.any(labels == i) else centers_arr[i] for i in range(k)]
        )
        if np.allclose(new, centers_arr):
            break
        centers_arr = new
    return labels


def _urgency(opp: Opportunity) -> str:
    if opp.deadline_at is None:
        return "none"
    days = (opp.deadline_at - utcnow()).days
    return "high" if days <= 7 else "medium" if days <= 21 else "low"


def build(
    opportunities: list[Opportunity], scores: dict[uuid.UUID, int] | None = None, cache_key: str | None = None
) -> dict[str, Any]:
    if cache_key and cache_key in _CACHE and time.monotonic() - _CACHE[cache_key][0] < CACHE_SECONDS:
        return _CACHE[cache_key][1]
    if len(opportunities) < 3:
        return {"nodes": [], "clusters": [], "personal": bool(scores)}

    docs = [
        tokens(
            f"{o.title} {o.title} {o.summary} {' '.join(o.keywords or [])} {' '.join(o.sectors or [])}",
            min_len=4,
        )
        for o in opportunities
    ]
    matrix, vocab = _tfidf(docs)
    centered = matrix - matrix.mean(0)
    u, s, _ = np.linalg.svd(centered, full_matrices=False)
    dims = min(8, u.shape[1])
    embedding = u[:, :dims] * s[:dims]
    k = max(2, min(8, len(opportunities) // 6))
    labels = _kmeans(embedding, k)

    coords = (
        embedding[:, :3]
        if embedding.shape[1] >= 3
        else np.pad(embedding, ((0, 0), (0, 3 - embedding.shape[1])))
    )
    scale = np.abs(coords).max() or 1.0
    coords = coords / scale

    budgets = np.array([o.budget_xof or 0 for o in opportunities], dtype=np.float64)
    log_budget = np.log10(np.maximum(budgets, 1))
    top_budget = log_budget.max() or 1.0

    clusters: list[dict[str, Any]] = []
    used_labels: set[str] = set()
    for cid in range(k):
        members = [i for i, lab in enumerate(labels) if lab == cid]
        if not members:
            continue
        sector_counts = Counter(s for i in members for s in (opportunities[i].sectors or [])[:1])
        name = sector_label(sector_counts.most_common(1)[0][0]) if sector_counts else "Divers"
        if name in used_labels:
            weights = matrix[members].mean(0)
            term = vocab[int(np.argmax(weights))] if len(vocab) else ""
            name = f"{name} · {term}" if term else f"{name} ({cid + 1})"
        used_labels.add(name)
        clusters.append({"id": cid, "label": name, "size": len(members)})

    nodes: list[dict[str, Any]] = []
    for i, opp in enumerate(opportunities):
        direction = coords[i]
        if scores is not None:
            norm = float(np.linalg.norm(direction)) or 1.0
            score = scores.get(opp.id)
            radius = 1.6 + (100 - (score if score is not None else 15)) / 100 * 8.4
            position = direction / norm * radius
        else:
            position = direction * 9.0
            score = None
        nodes.append(
            {
                "id": str(opp.id),
                "title": opp.title,
                "issuer": opp.issuer,
                "x": round(float(position[0]), 3),
                "y": round(float(position[1]), 3),
                "z": round(float(position[2]), 3),
                "size": round(0.35 + 0.65 * float(log_budget[i] / top_budget), 3) if budgets[i] else 0.35,
                "urgency": _urgency(opp),
                "deadline": opp.deadline_at.isoformat() if opp.deadline_at else None,
                "cluster": int(labels[i]),
                "score": score,
                "sector": (opp.sectors or [None])[0],
                "kind": opp.kind.value,
            }
        )

    for cluster in clusters:
        members = [n for n in nodes if n["cluster"] == cluster["id"]]
        cluster["x"] = round(sum(n["x"] for n in members) / len(members), 3)
        cluster["y"] = round(sum(n["y"] for n in members) / len(members), 3)
        cluster["z"] = round(sum(n["z"] for n in members) / len(members), 3)

    payload = {"nodes": nodes, "clusters": clusters, "personal": scores is not None}
    if cache_key:
        _CACHE[cache_key] = (time.monotonic(), payload)
        if len(_CACHE) > 500:
            _CACHE.clear()
    return payload
