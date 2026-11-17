import io
import json
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

import av
import numpy as np
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field
from pypdf import PdfReader

from config import AI_PORT, PHARMACY_DB_PATH, WHISPER_MODEL_SIZE
from hybrid_search import hybrid_search_engine
from model_registry import model_registry
from ocr_pipeline import run_real_ocr
from rag_chat import _prepare_rag_pipeline, run_qwen_rag_chat, stream_rag_chat_events


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Tải toàn bộ model AI local ĐÚNG MỘT LẦN khi khởi động service và nạp sẵn chỉ mục từ SQLite."""
    t0 = time.perf_counter()
    logger.info("Bắt đầu khởi tạo toàn bộ model AI local (tải 1 lần duy nhất lúc startup)...")
    model_registry.load_all_once()
    stats = hybrid_search_engine.bootstrap_from_sqlite(PHARMACY_DB_PATH)
    logger.info(
        f"Hoàn tất boot AI Service trong {time.perf_counter() - t0:.2f}s | "
        f"Index: {stats['products']} thuốc, {stats['knowledgeDocuments']} tài liệu Dược thư/HDSD"
    )
    yield
    logger.info("Đang tắt PharmaCore Local AI Service.")


app = FastAPI(title="PharmaCore Local AI Service (Real Models)", version="4.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessageItem(BaseModel):
    role: str
    content: str


class PatientContextModel(BaseModel):
    ageGroup: str = "ADULT"  # ADULT | CHILD | ELDERLY
    pregnantOrBreastfeeding: bool = False
    allergies: str = ""
    chronicConditions: str = ""


class RagChatRequest(BaseModel):
    message: str
    mode: Optional[str] = None  # DRUG_QA | SYMPTOM_CONSULTATION | None (auto)
    history: list[ChatMessageItem] = Field(default_factory=list)
    audience: str = "STAFF"  # STAFF | CUSTOMER
    onlyStorefrontPublished: bool = False
    interactionWarnings: list[str] = Field(default_factory=list)
    patientContext: Optional[PatientContextModel] = None


class SearchHybridRequest(BaseModel):
    query: str
    limit: int = 20
    onlyStorefrontPublished: bool = False
    includeTest: bool = False


class ReindexRequest(BaseModel):
    products: list[dict[str, Any]] = Field(default_factory=list)
    knowledgeDocuments: list[dict[str, Any]] = Field(default_factory=list)


def _decode_audio_to_16k_mono(audio_bytes: bytes) -> np.ndarray:
    """Giải mã âm thanh (webm/ogg/wav/mp3/m4a) thành float32 16kHz mono bằng PyAV (không phụ thuộc ffmpeg.exe)."""
    buf = io.BytesIO(audio_bytes)
    container = av.open(buf)
    audio_streams = [s for s in container.streams if s.type == "audio"]
    if not audio_streams:
        raise ValueError("File âm thanh không có luồng audio hợp lệ.")

    stream = audio_streams[0]
    resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
    chunks: list[np.ndarray] = []

    for frame in container.decode(stream):
        resampled_list = resampler.resample(frame)
        if not resampled_list:
            continue
        for rf in resampled_list:
            arr = rf.to_ndarray().astype(np.float32).reshape(-1)
            if arr.size > 0:
                chunks.append(arr)

    flushed = resampler.resample(None)
    if flushed:
        for rf in flushed:
            arr = rf.to_ndarray().astype(np.float32).reshape(-1)
            if arr.size > 0:
                chunks.append(arr)

    container.close()
    if not chunks:
        raise ValueError("Audio rỗng, không có dữ liệu sóng âm để nhận dạng.")
    return np.concatenate(chunks)


@app.get("/api/py-ai/health")
def health_check():
    return model_registry.get_health_report(
        indexed_products=len(hybrid_search_engine.products),
        indexed_docs=len(hybrid_search_engine.knowledge_docs),
    )


@app.post("/api/py-ai/ocr")
async def ocr_prescription_image(file: UploadFile = File(...)):
    """
    Nhận ảnh đơn thuốc thật -> OpenCV tiền xử lý -> RapidOCR (đã tải sẵn) -> trả về từng dòng + confidence.
    Tuyệt đối không dùng preset hoặc mock khi ảnh rỗng hoặc engine OCR lỗi.
    """
    ocr_engine = model_registry.ensure_ocr_ready()
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_FILE", "message": "File ảnh tải lên bị rỗng."},
        )
    return run_real_ocr(image_bytes, ocr_engine)


@app.post("/api/py-ai/stt")
async def speech_to_text(file: UploadFile = File(...), language: str = "vi"):
    """
    Nhận dạng giọng nói tiếng Việt local bằng Faster-Whisper (model đã tải sẵn lúc khởi động).
    Trả 503 nếu model STT chưa sẵn sàng; không dùng mock transcript.
    """
    stt_model = model_registry.ensure_stt_ready()
    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) < 256:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_AUDIO", "message": "Đoạn ghi âm quá ngắn hoặc không có dữ liệu."},
        )

    t0 = time.perf_counter()
    try:
        audio_np = _decode_audio_to_16k_mono(audio_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_AUDIO", "message": f"Không giải mã được định dạng âm thanh: {exc}"},
        ) from exc

    duration_sec = float(len(audio_np)) / 16000.0
    if duration_sec < 0.2:
        raise HTTPException(
            status_code=400,
            detail={"code": "AUDIO_TOO_SHORT", "message": "Thời lượng ghi âm dưới 0.2 giây, vui lòng nói lại."},
        )

    try:
        segments_iter, info = stt_model.transcribe(
            audio_np,
            language=language or "vi",
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400},
        )
        segments = []
        texts = []
        for seg in segments_iter:
            txt = seg.text.strip()
            if txt:
                texts.append(txt)
                segments.append({
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": txt,
                })
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_STT_RUNTIME_ERROR",
                "model": f"faster-whisper-{WHISPER_MODEL_SIZE}",
                "message": f"Lỗi khi suy luận Faster-Whisper: {exc}",
            },
        ) from exc

    transcript = " ".join(texts).strip()
    return {
        "modelUsed": f"faster-whisper-{WHISPER_MODEL_SIZE}",
        "language": getattr(info, "language", language),
        "languageProbability": round(float(getattr(info, "language_probability", 0.0)), 4),
        "audioDurationSec": round(duration_sec, 2),
        "processingTimeSec": round(time.perf_counter() - t0, 2),
        "text": transcript,
        "segments": segments,
    }


@app.post("/api/py-ai/reindex")
def reindex_catalog_and_knowledge(req: ReindexRequest):
    stats = hybrid_search_engine.reindex(req.products, req.knowledgeDocuments)
    return {"ok": True, **stats}


@app.post("/api/py-ai/search-hybrid")
def search_hybrid_endpoint(req: SearchHybridRequest):
    return hybrid_search_engine.search_products(
        query=req.query,
        limit=req.limit,
        only_storefront_published=req.onlyStorefrontPublished,
        include_test=req.includeTest,
    )


@app.post("/api/py-ai/chat-rag")
def chat_rag_endpoint(req: RagChatRequest):
    history_dicts = [{"role": h.role, "content": h.content} for h in req.history]
    patient_ctx = req.patientContext.model_dump() if req.patientContext else None
    return run_qwen_rag_chat(
        message=req.message,
        mode_hint=req.mode,
        history=history_dicts,
        registry=model_registry,
        hybrid_engine=hybrid_search_engine,
        audience="CUSTOMER" if req.audience == "CUSTOMER" else "STAFF",
        only_storefront_published=req.onlyStorefrontPublished,
        interaction_warnings=req.interactionWarnings,
        patient_context=patient_ctx,
    )


@app.post("/api/py-ai/chat-rag/stream")
def chat_rag_stream_endpoint(req: RagChatRequest):
    """Streaming SSE endpoint giúp phản hồi chữ tức thì ở cả Google AI Studio lẫn Local Ollama."""
    history_dicts = [{"role": h.role, "content": h.content} for h in req.history]
    audience = "CUSTOMER" if req.audience == "CUSTOMER" else "STAFF"
    patient_ctx = req.patientContext.model_dump() if req.patientContext else None

    # Chạy pre-flight kiểm tra model/embedding trước khi mở stream để vẫn trả HTTP 503/400 chuẩn
    prep_probe = _prepare_rag_pipeline(
        message=req.message,
        mode_hint=req.mode,
        registry=model_registry,
        hybrid_engine=hybrid_search_engine,
        audience=audience,
        only_storefront_published=req.onlyStorefrontPublished,
        interaction_warnings=req.interactionWarnings,
        patient_context=patient_ctx,
    )

    def _sse_generator():
        for event_name, payload in stream_rag_chat_events(
            message=req.message,
            mode_hint=req.mode,
            history=history_dicts,
            registry=model_registry,
            hybrid_engine=hybrid_search_engine,
            audience=audience,
            only_storefront_published=req.onlyStorefrontPublished,
            interaction_warnings=req.interactionWarnings,
            patient_context=patient_ctx,
            prepared=prep_probe,
        ):
            yield f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        _sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/py-ai/diagnose")
def legacy_diagnose_alias(req: dict[str, Any]):
    """Alias tương thích gọi chung vào pipeline Qwen RAG có nguồn (không dùng CLINICAL_PROTOCOLS cứng)."""
    msg = str(req.get("message") or req.get("symptoms") or "").strip()
    return run_qwen_rag_chat(
        message=msg,
        mode_hint=req.get("mode") or "SYMPTOM_CONSULTATION",
        history=req.get("history") or [],
        registry=model_registry,
        hybrid_engine=hybrid_search_engine,
    )


@app.post("/api/py-ai/extract-pdf")
async def extract_pdf_text(file: UploadFile = File(...)):
    """Trích xuất text từ file PDF tờ HDSD thuốc để nạp vào KnowledgeDocument."""
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail={"code": "EMPTY_FILE", "message": "File PDF rỗng."})
    try:
        reader = PdfReader(io.BytesIO(raw))
        pages = [(page.extract_text() or "").strip() for page in reader.pages]
        full_text = "\n\n".join(p for p in pages if p).strip()
        if not full_text:
            raise HTTPException(
                status_code=422,
                detail={"code": "PDF_NO_TEXT", "message": "File PDF không chứa text (có thể là PDF dạng ảnh scan)."},
            )
        return {"pages": len(reader.pages), "text": full_text}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PDF", "message": f"Không đọc được file PDF: {exc}"}) from exc


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=AI_PORT)
