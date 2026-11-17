import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
# Tải dự phòng biến từ backend/.env (không ghi đè) để người dùng chỉ cần điền GEMINI_API_KEY ở 1 nơi
_backend_env = BASE_DIR.parent / "backend" / ".env"
if _backend_env.exists():
    load_dotenv(_backend_env, override=False)

AI_PORT = int(os.getenv("AI_PORT", "8000"))

# 1. LLM duy nhất local (Qwen qua Ollama) + Tùy chọn Google AI Studio (Gemini) cho tốc độ cao & kiến thức mở rộng
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen2.5:7b").strip()
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m").strip()
OLLAMA_TIMEOUT_SEC = float(os.getenv("OLLAMA_TIMEOUT_SEC", "90"))
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "2048"))
OLLAMA_NUM_PREDICT = int(os.getenv("OLLAMA_NUM_PREDICT", "480"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip()
GEMINI_ENABLE_SEARCH_GROUNDING = os.getenv("GEMINI_ENABLE_SEARCH_GROUNDING", "false").strip().lower() in (
    "1",
    "true",
    "yes",
)
CHAT_PROVIDER = os.getenv("CHAT_PROVIDER", "auto").strip().lower()  # auto | gemini | ollama

# 2. Nhận dạng giọng nói local (Faster-Whisper)
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "medium").strip()
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu").strip()
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8").strip()

# 3. Embedding đa ngôn ngữ ONNX cho Hybrid Search & RAG Retrieval
EMBED_MODEL_NAME = os.getenv(
    "EMBED_MODEL_NAME",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
).strip()

# 4. Đường dẫn mặc định tới SQLite DB để tự nạp chỉ mục ban đầu lúc boot
_raw_db_path = os.getenv("PHARMACY_DB_PATH", "../backend/prisma/pharmacy.db").strip()
PHARMACY_DB_PATH = str((BASE_DIR / _raw_db_path).resolve()) if not Path(_raw_db_path).is_absolute() else _raw_db_path
