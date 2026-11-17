import threading
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from config import (
    CHAT_PROVIDER,
    EMBED_MODEL_NAME,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    OLLAMA_BASE_URL,
    OLLAMA_KEEP_ALIVE,
    QWEN_MODEL,
    WHISPER_COMPUTE_TYPE,
    WHISPER_DEVICE,
    WHISPER_MODEL_SIZE,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class ComponentHealth:
    name: str
    provider: str
    model: str
    status: str  # READY | DOWN | LOADING
    device: str
    loadTimeSec: float = 0.0
    loadedAt: Optional[str] = None
    loadedInMemory: bool = False
    error: Optional[str] = None


class AiModelRegistry:
    """
    Quản lý toàn bộ model AI local trong vòng đời duy nhất của FastAPI (lifespan).
    Tất cả model nặng được tải một lần lúc khởi động, không tải lại mỗi request.
    Nếu một model chết hoặc chưa tải thành công, health check và endpoint liên quan báo lỗi 503 rõ ràng.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.booted_at: Optional[str] = None
        self.startup_load_count: int = 0

        self.ocr_engine: Any = None
        self.stt_model: Any = None
        self.embed_model: Any = None

        self.ocr_health = ComponentHealth(
            name="ocr",
            provider="rapidocr-onnxruntime",
            model="PP-OCRv4 (ONNX)",
            status="LOADING",
            device="cpu",
        )
        self.stt_health = ComponentHealth(
            name="stt",
            provider="faster-whisper",
            model=f"faster-whisper-{WHISPER_MODEL_SIZE}",
            status="LOADING",
            device=f"{WHISPER_DEVICE} ({WHISPER_COMPUTE_TYPE})",
        )
        self.embed_health = ComponentHealth(
            name="embeddings",
            provider="fastembed-onnx",
            model=EMBED_MODEL_NAME,
            status="LOADING",
            device="cpu (onnx)",
        )
        self.llm_health = ComponentHealth(
            name="llm",
            provider="ollama",
            model=QWEN_MODEL,
            status="LOADING",
            device="ollama-gpu/cpu",
        )

    def load_all_once(self) -> None:
        with self._lock:
            if self.startup_load_count > 0:
                return
            self.startup_load_count += 1
            self.booted_at = _utc_now_iso()

            self._load_ocr()
            self._load_embeddings()
            self._load_stt()
            self._warmup_llm()

    def _load_ocr(self) -> None:
        t0 = time.perf_counter()
        try:
            from rapidocr_onnxruntime import RapidOCR

            self.ocr_engine = RapidOCR()
            self.ocr_health = ComponentHealth(
                name="ocr",
                provider="rapidocr-onnxruntime",
                model="PP-OCRv4 (ONNX)",
                status="READY",
                device="cpu",
                loadTimeSec=round(time.perf_counter() - t0, 2),
                loadedAt=_utc_now_iso(),
                loadedInMemory=True,
                error=None,
            )
            print(f"[AI-Registry] OCR (RapidOCR) READY in {self.ocr_health.loadTimeSec}s")
        except Exception as exc:
            self.ocr_engine = None
            self.ocr_health = ComponentHealth(
                name="ocr",
                provider="rapidocr-onnxruntime",
                model="PP-OCRv4 (ONNX)",
                status="DOWN",
                device="cpu",
                loadTimeSec=round(time.perf_counter() - t0, 2),
                error=f"Lỗi khởi tạo RapidOCR: {exc}",
            )
            print(f"[AI-Registry] OCR FAILED: {exc}")

    def _load_embeddings(self) -> None:
        t0 = time.perf_counter()
        try:
            from fastembed import TextEmbedding

            try:
                self.embed_model = TextEmbedding(
                    model_name=EMBED_MODEL_NAME,
                    local_files_only=True,
                )
            except Exception:
                self.embed_model = TextEmbedding(model_name=EMBED_MODEL_NAME)

            self.embed_health = ComponentHealth(
                name="embeddings",
                provider="fastembed-onnx",
                model=EMBED_MODEL_NAME,
                status="READY",
                device="cpu (onnx)",
                loadTimeSec=round(time.perf_counter() - t0, 2),
                loadedAt=_utc_now_iso(),
                loadedInMemory=True,
                error=None,
            )
            print(f"[AI-Registry] Embeddings ({EMBED_MODEL_NAME}) READY in {self.embed_health.loadTimeSec}s")
        except Exception as exc:
            self.embed_model = None
            self.embed_health = ComponentHealth(
                name="embeddings",
                provider="fastembed-onnx",
                model=EMBED_MODEL_NAME,
                status="DOWN",
                device="cpu (onnx)",
                loadTimeSec=round(time.perf_counter() - t0, 2),
                error=f"Lỗi khởi tạo Embedding model ({EMBED_MODEL_NAME}): {exc}",
            )
            print(f"[AI-Registry] Embeddings FAILED: {exc}")

    def _load_stt(self) -> None:
        t0 = time.perf_counter()
        try:
            from faster_whisper import WhisperModel

            try:
                self.stt_model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device=WHISPER_DEVICE,
                    compute_type=WHISPER_COMPUTE_TYPE,
                    local_files_only=True,
                )
            except Exception:
                self.stt_model = WhisperModel(
                    WHISPER_MODEL_SIZE,
                    device=WHISPER_DEVICE,
                    compute_type=WHISPER_COMPUTE_TYPE,
                )

            self.stt_health = ComponentHealth(
                name="stt",
                provider="faster-whisper",
                model=f"faster-whisper-{WHISPER_MODEL_SIZE}",
                status="READY",
                device=f"{WHISPER_DEVICE} ({WHISPER_COMPUTE_TYPE})",
                loadTimeSec=round(time.perf_counter() - t0, 2),
                loadedAt=_utc_now_iso(),
                loadedInMemory=True,
                error=None,
            )
            print(f"[AI-Registry] STT (faster-whisper-{WHISPER_MODEL_SIZE}) READY in {self.stt_health.loadTimeSec}s")
        except Exception as exc:
            self.stt_model = None
            self.stt_health = ComponentHealth(
                name="stt",
                provider="faster-whisper",
                model=f"faster-whisper-{WHISPER_MODEL_SIZE}",
                status="DOWN",
                device=f"{WHISPER_DEVICE} ({WHISPER_COMPUTE_TYPE})",
                loadTimeSec=round(time.perf_counter() - t0, 2),
                error=f"Lỗi khởi tạo Whisper ({WHISPER_MODEL_SIZE}): {exc}",
            )
            print(f"[AI-Registry] STT FAILED: {exc}")

    def _warmup_llm(self) -> None:
        t0 = time.perf_counter()
        status = self.probe_llm_live(warmup_if_unloaded=True)
        status.loadTimeSec = round(time.perf_counter() - t0, 2)
        self.llm_health = status
        if status.status == "READY":
            print(f"[AI-Registry] LLM ({QWEN_MODEL} via Ollama) READY in {status.loadTimeSec}s")
        else:
            print(f"[AI-Registry] LLM ({QWEN_MODEL}) DOWN: {status.error}")

    def probe_llm_live(self, warmup_if_unloaded: bool = False) -> ComponentHealth:
        """
        Kiểm tra trực tiếp Ollama (/api/tags & /api/ps) để xác định model Qwen duy nhất có thực sự sống hay không.
        """
        try:
            with httpx.Client(timeout=3.0) as client:
                tags_resp = client.get(f"{OLLAMA_BASE_URL}/api/tags")
                tags_resp.raise_for_status()
                models_list = tags_resp.json().get("models", [])
                available_names = [m.get("name", "") for m in models_list]

                matched_tag = any(
                    name == QWEN_MODEL or name.startswith(f"{QWEN_MODEL}:")
                    for name in available_names
                )
                if not matched_tag:
                    return ComponentHealth(
                        name="llm",
                        provider="ollama",
                        model=QWEN_MODEL,
                        status="DOWN",
                        device="ollama",
                        loadedInMemory=False,
                        error=f"Ollama đang chạy nhưng chưa có model '{QWEN_MODEL}'. Models hiện có: {', '.join(available_names) or 'trống'}.",
                    )

                ps_resp = client.get(f"{OLLAMA_BASE_URL}/api/ps")
                running_names: list[str] = []
                if ps_resp.status_code == 200:
                    running_names = [m.get("name", "") for m in ps_resp.json().get("models", [])]

                is_running = any(
                    name == QWEN_MODEL or name.startswith(f"{QWEN_MODEL}:")
                    for name in running_names
                )

                if warmup_if_unloaded and not is_running:
                    with httpx.Client(timeout=60.0) as warm_client:
                        warm_resp = warm_client.post(
                            f"{OLLAMA_BASE_URL}/api/generate",
                            json={
                                "model": QWEN_MODEL,
                                "prompt": "",
                                "stream": False,
                                "keep_alive": OLLAMA_KEEP_ALIVE,
                            },
                        )
                        if warm_resp.status_code == 200:
                            is_running = True

                return ComponentHealth(
                    name="llm",
                    provider="ollama",
                    model=QWEN_MODEL,
                    status="READY",
                    device="ollama (gpu+ram)",
                    loadedAt=self.llm_health.loadedAt or _utc_now_iso(),
                    loadedInMemory=is_running,
                    error=None,
                )
        except Exception as exc:
            return ComponentHealth(
                name="llm",
                provider="ollama",
                model=QWEN_MODEL,
                status="DOWN",
                device="ollama",
                loadedInMemory=False,
                error=f"Không kết nối được Ollama tại {OLLAMA_BASE_URL} cho model '{QWEN_MODEL}': {exc}",
            )

    def ensure_ocr_ready(self) -> Any:
        if self.ocr_engine is None or self.ocr_health.status != "READY":
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "AI_OCR_MODEL_DOWN",
                    "model": self.ocr_health.model,
                    "message": self.ocr_health.error or "Engine OCR (RapidOCR) chưa sẵn sàng.",
                },
            )
        return self.ocr_engine

    def ensure_stt_ready(self) -> Any:
        if self.stt_model is None or self.stt_health.status != "READY":
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "AI_STT_MODEL_DOWN",
                    "model": self.stt_health.model,
                    "message": self.stt_health.error or "Model nhận dạng giọng nói Faster-Whisper chưa sẵn sàng.",
                },
            )
        return self.stt_model

    def ensure_embed_ready(self) -> Any:
        if self.embed_model is None or self.embed_health.status != "READY":
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "AI_EMBEDDING_MODEL_DOWN",
                    "model": self.embed_health.model,
                    "message": self.embed_health.error or "Model Embedding ngữ nghĩa chưa sẵn sàng.",
                },
            )
        return self.embed_model

    def ensure_llm_ready(self) -> ComponentHealth:
        live = self.probe_llm_live(warmup_if_unloaded=False)
        self.llm_health = live
        if live.status != "READY":
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "AI_LLM_MODEL_DOWN",
                    "model": QWEN_MODEL,
                    "message": live.error or f"Model LLM '{QWEN_MODEL}' không phản hồi.",
                },
            )
        return live

    def get_health_report(self, indexed_products: int = 0, indexed_docs: int = 0) -> dict:
        live_ollama = self.probe_llm_live(warmup_if_unloaded=False)
        gemini_enabled = bool(GEMINI_API_KEY) and CHAT_PROVIDER != "ollama"

        if gemini_enabled:
            primary_llm = ComponentHealth(
                name="llm",
                provider="google-ai-studio",
                model=GEMINI_MODEL,
                status="READY",
                device="cloud-sse",
                loadedAt=self.booted_at,
                loadedInMemory=True,
                error=None,
            )
            active_provider = "google-ai-studio"
            active_model = GEMINI_MODEL
        else:
            primary_llm = live_ollama
            active_provider = "ollama"
            active_model = QWEN_MODEL

        self.llm_health = primary_llm
        components = {
            "llm": asdict(primary_llm),
            "ocr": asdict(self.ocr_health),
            "stt": asdict(self.stt_health),
            "embeddings": asdict(self.embed_health),
        }
        statuses = [c["status"] for c in components.values()]
        if all(s == "READY" for s in statuses):
            overall = "OK"
        elif any(s == "READY" for s in statuses):
            overall = "DEGRADED"
        else:
            overall = "DOWN"

        dead_models = [
            f"{comp['name']} ({comp['model']}): {comp['error'] or 'DOWN'}"
            for comp in components.values()
            if comp["status"] != "READY"
        ]

        return {
            "status": overall,
            "engine": (
                f"PharmaCore Hybrid AI ({active_provider} {active_model} + RapidOCR + Faster-Whisper + FastEmbed ONNX)"
            ),
            "bootedAt": self.booted_at,
            "startupLoadCount": self.startup_load_count,
            "singleLlmSharedPolicy": True,
            "geminiConfigured": bool(GEMINI_API_KEY),
            "chatProvider": CHAT_PROVIDER,
            "activeLlmProvider": active_provider,
            "activeLlmModel": active_model,
            "localFallbackLlm": asdict(live_ollama),
            "indexStats": {
                "products": indexed_products,
                "knowledgeDocuments": indexed_docs,
            },
            "deadModels": dead_models,
            "models": components,
        }


model_registry = AiModelRegistry()
