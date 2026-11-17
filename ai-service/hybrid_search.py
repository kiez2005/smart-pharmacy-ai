import sqlite3
import threading
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import numpy as np
from rank_bm25 import BM25Okapi

from model_registry import model_registry


def normalize_vi(text: str) -> str:
    """Chuẩn hóa tiếng Việt không dấu nhưng giữ nguyên chữ số/hàm lượng để so khớp từ khóa ổn định."""
    if not text:
        return ""
    text = text.replace("đ", "d").replace("Đ", "D")
    nfkd = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return " ".join(stripped.lower().split())


def tokenize_vi(text: str) -> list[str]:
    norm = normalize_vi(text)
    tokens: list[str] = []
    cur = []
    for ch in norm:
        if ch.isalnum():
            cur.append(ch)
        else:
            if cur:
                tokens.append("".join(cur))
                cur = []
    if cur:
        tokens.append("".join(cur))
    return tokens


def _char_similarity(a: str, b_tokens: list[str]) -> float:
    """Bắt lỗi gõ sai chính tả kiểu 'paracetamon' ~ 'paracetamol' hoặc 'augmetin' ~ 'augmentin'."""
    if len(a) < 4 or not b_tokens:
        return 0.0
    best = 0.0
    for bt in b_tokens:
        if len(bt) < 4:
            continue
        ratio = SequenceMatcher(None, a, bt).ratio()
        if ratio > best:
            best = ratio
    return best if best >= 0.78 else 0.0


def _encode_texts(texts: list[str]) -> np.ndarray | None:
    if not texts or model_registry.embed_model is None or model_registry.embed_health.status != "READY":
        return None
    vecs = list(model_registry.embed_model.embed(texts))
    mat = np.asarray(vecs, dtype=np.float32)
    if mat.ndim == 1:
        mat = mat.reshape(1, -1)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return mat / norms


class HybridSearchEngine:
    """
    Chỉ mục Hybrid trong RAM kết hợp:
    - BM25 + fuzzy keyword matching (chữ không dấu & sửa lỗi chính tả nhẹ)
    - Dense Semantic Embedding (FastEmbed paraphrase-multilingual-MiniLM-L12-v2)
    - Reciprocal Rank Fusion (RRF) dùng chung cho Tìm kiếm Danh mục & RAG Retrieval
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.products: list[dict[str, Any]] = []
        self.product_tokens: list[list[str]] = []
        self.product_norm_names: list[str] = []
        self.product_lower_texts: list[str] = []
        self.product_bm25: BM25Okapi | None = None
        self.product_embeddings: np.ndarray | None = None

        self.knowledge_docs: list[dict[str, Any]] = []
        self.doc_tokens: list[list[str]] = []
        self.doc_bm25: BM25Okapi | None = None
        self.doc_embeddings: np.ndarray | None = None

    def reindex(self, products: list[dict[str, Any]], knowledge_docs: list[dict[str, Any]]) -> dict[str, int]:
        active_docs = [d for d in knowledge_docs if d.get("IsActive", True)]
        docs_by_pid: dict[int, list[str]] = {}
        for d in active_docs:
            pid = d.get("ProductID")
            if pid is not None:
                try:
                    pid_int = int(pid)
                    sec = str(d.get("Section") or "").strip()
                    cnt = str(d.get("Content") or "").strip()
                    if cnt:
                        docs_by_pid.setdefault(pid_int, []).append(f"{sec}: {cnt}" if sec else cnt)
                except (TypeError, ValueError):
                    pass

        prod_texts: list[str] = []
        prod_tokens: list[list[str]] = []
        prod_norm_names: list[str] = []
        prod_lower_texts: list[str] = []

        for p in products:
            pid = int(p.get("ProductID") or 0)
            p_name = str(p.get("ProductName") or "")
            p_type = str(p.get("ProductType") or "")
            p_desc = str(p.get("Description") or "")
            p_uses = str(p.get("UsesShort") or "")
            hdsd_snippet = " ".join(docs_by_pid.get(pid, []))[:700]
            combined = f"{p_name}. Nhóm: {p_type}. {p_desc} {p_uses} {hdsd_snippet}".strip()
            prod_texts.append(combined)
            prod_tokens.append(tokenize_vi(combined) or ["empty"])
            prod_norm_names.append(normalize_vi(p_name))
            prod_lower_texts.append(" ".join(combined.lower().split()))

        doc_texts: list[str] = []
        doc_tokens: list[list[str]] = []
        for d in active_docs:
            title = str(d.get("Title") or "")
            section = str(d.get("Section") or "")
            content = str(d.get("Content") or "")
            source = str(d.get("SourceName") or "")
            combined = f"{title} - {section}: {content} (Nguồn: {source})".strip()
            doc_texts.append(combined)
            doc_tokens.append(tokenize_vi(combined) or ["empty"])

        prod_bm25 = BM25Okapi(prod_tokens) if prod_tokens else None
        doc_bm25 = BM25Okapi(doc_tokens) if doc_tokens else None

        prod_emb = _encode_texts(prod_texts)
        doc_emb = _encode_texts(doc_texts)

        with self._lock:
            self.products = list(products)
            self.product_tokens = prod_tokens
            self.product_norm_names = prod_norm_names
            self.product_lower_texts = prod_lower_texts
            self.product_bm25 = prod_bm25
            self.product_embeddings = prod_emb

            self.knowledge_docs = active_docs
            self.doc_tokens = doc_tokens
            self.doc_bm25 = doc_bm25
            self.doc_embeddings = doc_emb

        return {
            "products": len(products),
            "knowledgeDocuments": len(active_docs),
            "embeddingsReady": prod_emb is not None or (len(products) == 0 and model_registry.embed_health.status == "READY"),
        }

    def bootstrap_from_sqlite(self, db_path: str) -> dict[str, int]:
        path = Path(db_path)
        if not path.exists():
            return {"products": 0, "knowledgeDocuments": 0}

        conn = sqlite3.connect(str(path))
        conn.row_factory = sqlite3.Row
        try:
            product_rows = conn.execute(
                """
                SELECT
                  p.ProductID,
                  p.ProductName,
                  p.ProductType,
                  p.Unit,
                  p.Price,
                  p.Description,
                  COALESCE((
                    SELECT SUM(sl.RemainingQuantity) FROM StockLot sl
                    WHERE sl.ProductID = p.ProductID
                      AND sl.Status = 'ACTIVE'
                      AND sl.RemainingQuantity > 0
                  ), p.Quantity, 0) AS TotalStock,
                  COALESCE(pk.IsRx, 0) AS IsRx,
                  COALESCE(pk.IsPublished, 1) AS IsPublished,
                  COALESCE(pk.IsTestOnly, 0) AS IsTestOnly
                FROM Product p
                LEFT JOIN ProductPackaging pk ON pk.ProductID = p.ProductID
                ORDER BY p.ProductID ASC
                """
            ).fetchall()

            products = [
                {
                    "ProductID": int(r["ProductID"]),
                    "ProductName": r["ProductName"],
                    "ProductType": r["ProductType"],
                    "Unit": r["Unit"],
                    "Price": float(r["Price"]),
                    "Description": r["Description"],
                    "TotalStock": int(r["TotalStock"] or 0),
                    "IsRx": bool(r["IsRx"]),
                    "IsPublished": bool(r["IsPublished"]),
                    "IsTestOnly": bool(r["IsTestOnly"]),
                }
                for r in product_rows
            ]

            table_exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='KnowledgeDocument'"
            ).fetchone()
            docs: list[dict[str, Any]] = []
            if table_exists:
                doc_rows = conn.execute(
                    """
                    SELECT DocID, ProductID, DocType, Title, Section, Content, SourceName, SourceRef, VerifiedBy, IsActive
                    FROM KnowledgeDocument
                    WHERE IsActive = 1
                    ORDER BY DocID ASC
                    """
                ).fetchall()
                docs = [
                    {
                        "DocID": int(r["DocID"]),
                        "ProductID": int(r["ProductID"]) if r["ProductID"] is not None else None,
                        "DocType": r["DocType"],
                        "Title": r["Title"],
                        "Section": r["Section"],
                        "Content": r["Content"],
                        "SourceName": r["SourceName"],
                        "SourceRef": r["SourceRef"],
                        "VerifiedBy": r["VerifiedBy"],
                        "IsActive": bool(r["IsActive"]),
                    }
                    for r in doc_rows
                ]

            return self.reindex(products, docs)
        finally:
            conn.close()

    def search_products(
        self,
        query: str,
        limit: int = 20,
        only_storefront_published: bool = False,
        include_test: bool = False,
        semantic_min_score: float = 0.40,
    ) -> dict[str, Any]:
        q_norm = normalize_vi(query)
        q_tokens = tokenize_vi(query)
        q_lower = " ".join(query.lower().split())
        q_lower_words = [w for w in q_lower.split() if len(w) >= 2]
        q_lower_bigrams = [f"{q_lower_words[i]} {q_lower_words[i + 1]}" for i in range(len(q_lower_words) - 1)]
        if not q_tokens:
            return {"query": query, "results": [], "semanticAvailable": model_registry.embed_health.status == "READY", "engine": "hybrid-rrf"}

        with self._lock:
            products = self.products
            p_tokens = self.product_tokens
            p_names = self.product_norm_names
            p_lowers = self.product_lower_texts
            bm25 = self.product_bm25
            p_emb = self.product_embeddings

        if not products:
            return {"query": query, "results": [], "semanticAvailable": False, "engine": "hybrid-rrf"}

        eligible = []
        for idx, p in enumerate(products):
            if not include_test and p.get("IsTestOnly"):
                continue
            if only_storefront_published and not p.get("IsPublished", True):
                continue
            eligible.append(idx)

        if not eligible:
            return {"query": query, "results": [], "semanticAvailable": p_emb is not None, "engine": "hybrid-rrf"}

        bm25_raw = bm25.get_scores(q_tokens) if bm25 is not None else np.zeros(len(products), dtype=np.float32)

        kw_scores: dict[int, float] = {}
        for idx in eligible:
            score = max(0.0, float(bm25_raw[idx]))
            name_norm = p_names[idx]
            low_text = p_lowers[idx] if idx < len(p_lowers) else ""
            if q_norm in name_norm:
                score += 4.5
            # Accented Vietnamese phrase/word bonus prevents homograph drift ("tử" vs "từ")
            phrase_bonus = 0.0
            if len(q_lower) >= 4 and q_lower in low_text:
                phrase_bonus += 5.0
            for bg in q_lower_bigrams:
                if bg in low_text:
                    phrase_bonus += 2.5
            # Fuzzy typo rescue (e.g. paracetamon -> paracetamol)
            fuzzy_bonus = 0.0
            for qt in q_tokens:
                sim = _char_similarity(qt, p_tokens[idx])
                if sim > 0:
                    fuzzy_bonus += sim * 2.5
            total_kw = score + phrase_bonus + fuzzy_bonus
            if total_kw > 0.25:
                kw_scores[idx] = total_kw

        sem_scores: dict[int, float] = {}
        semantic_available = False
        q_vec = _encode_texts([query])
        if q_vec is not None and p_emb is not None and len(p_emb) == len(products):
            semantic_available = True
            cos_all = np.dot(p_emb, q_vec[0])
            for idx in eligible:
                c = float(cos_all[idx])
                if c >= semantic_min_score or idx in kw_scores:
                    sem_scores[idx] = c

        kw_ranked = sorted(kw_scores.keys(), key=lambda i: kw_scores[i], reverse=True)
        sem_ranked = sorted(sem_scores.keys(), key=lambda i: sem_scores[i], reverse=True)

        kw_rank_map = {idx: rank + 1 for rank, idx in enumerate(kw_ranked)}
        sem_rank_map = {idx: rank + 1 for rank, idx in enumerate(sem_ranked)}

        rrf_k = 60.0
        candidate_ids = set(kw_rank_map.keys()) | {i for i in sem_rank_map.keys() if sem_scores[i] >= semantic_min_score}

        scored_items = []
        for idx in candidate_ids:
            rrf = 0.0
            if idx in kw_rank_map:
                rrf += 1.0 / (rrf_k + kw_rank_map[idx])
            if idx in sem_rank_map and sem_scores.get(idx, 0.0) >= semantic_min_score:
                rrf += 1.0 / (rrf_k + sem_rank_map[idx])

            p = products[idx]
            scored_items.append({
                "ProductID": p["ProductID"],
                "ProductName": p["ProductName"],
                "ProductType": p["ProductType"],
                "Unit": p["Unit"],
                "Price": p["Price"],
                "TotalStock": p.get("TotalStock", 0),
                "IsRx": bool(p.get("IsRx", False)),
                "rrfScore": round(rrf, 6),
                "keywordScore": round(kw_scores.get(idx, 0.0), 4),
                "semanticScore": round(sem_scores.get(idx, 0.0), 4),
            })

        scored_items.sort(key=lambda item: (item["rrfScore"], item["keywordScore"], item["semanticScore"]), reverse=True)

        return {
            "query": query,
            "semanticAvailable": semantic_available,
            "engine": "hybrid-bm25-fastembed-rrf" if semantic_available else "bm25-keyword-only",
            "results": scored_items[: max(1, min(100, limit))],
        }

    def retrieve_rag_context(
        self,
        query: str,
        doc_limit: int = 6,
        product_limit: int = 5,
        only_storefront_published: bool = False,
    ) -> dict[str, Any]:
        q_tokens = tokenize_vi(query)
        with self._lock:
            docs = self.knowledge_docs
            d_bm25 = self.doc_bm25
            d_emb = self.doc_embeddings
            published_pids = {
                int(p["ProductID"])
                for p in self.products
                if p.get("IsPublished", True) and not p.get("IsTestOnly")
            }

        doc_results: list[dict[str, Any]] = []
        top_doc_semantic = 0.0
        top_doc_keyword = 0.0

        if docs and q_tokens:
            bm25_raw = d_bm25.get_scores(q_tokens) if d_bm25 is not None else np.zeros(len(docs), dtype=np.float32)
            q_vec = _encode_texts([query])
            cos_all = (
                np.dot(d_emb, q_vec[0])
                if q_vec is not None and d_emb is not None and len(d_emb) == len(docs)
                else np.zeros(len(docs), dtype=np.float32)
            )

            eligible_doc_indices = [
                i
                for i, d in enumerate(docs)
                if not only_storefront_published
                or d.get("ProductID") is None
                or int(d["ProductID"]) in published_pids
            ]

            kw_ranked = sorted(eligible_doc_indices, key=lambda i: float(bm25_raw[i]), reverse=True)
            sem_ranked = sorted(eligible_doc_indices, key=lambda i: float(cos_all[i]), reverse=True)
            kw_rank = {idx: r + 1 for r, idx in enumerate(kw_ranked) if float(bm25_raw[idx]) > 0.1}
            sem_rank = {idx: r + 1 for r, idx in enumerate(sem_ranked) if float(cos_all[idx]) >= 0.20}

            rrf_k = 60.0
            candidates = set(kw_rank.keys()) | set(sem_rank.keys())
            if not candidates and eligible_doc_indices:
                candidates = set(sem_ranked[:3])

            scored_docs = []
            for idx in candidates:
                sem_val = max(0.0, float(cos_all[idx]))
                kw_val = max(0.0, float(bm25_raw[idx]))
                rrf = (1.0 / (rrf_k + kw_rank[idx]) if idx in kw_rank else 0.0) + (
                    1.0 / (rrf_k + sem_rank[idx]) if idx in sem_rank else 0.0
                )
                d = docs[idx]
                top_doc_semantic = max(top_doc_semantic, sem_val)
                top_doc_keyword = max(top_doc_keyword, kw_val)
                scored_docs.append({
                    "DocID": d["DocID"],
                    "ProductID": d.get("ProductID"),
                    "DocType": d.get("DocType", "LEAFLET"),
                    "Title": d.get("Title", ""),
                    "Section": d.get("Section", "Tổng quan"),
                    "Content": d.get("Content", ""),
                    "SourceName": d.get("SourceName", "Tài liệu Nhà thuốc"),
                    "SourceRef": d.get("SourceRef"),
                    "VerifiedBy": d.get("VerifiedBy"),
                    "rrfScore": round(rrf, 6),
                    "semanticScore": round(sem_val, 4),
                    "keywordScore": round(kw_val, 4),
                })

            scored_docs.sort(
                key=lambda item: (item["rrfScore"], item["semanticScore"], item["keywordScore"]),
                reverse=True,
            )
            doc_results = scored_docs[:doc_limit]

        product_search = self.search_products(
            query=query,
            limit=product_limit,
            only_storefront_published=only_storefront_published,
            include_test=False,
            semantic_min_score=0.32,
        )

        return {
            "documents": doc_results,
            "products": product_search["results"],
            "totalIndexedDocs": len(docs),
            "topDocSemantic": round(top_doc_semantic, 4),
            "topDocKeyword": round(top_doc_keyword, 4),
        }


hybrid_search_engine = HybridSearchEngine()
