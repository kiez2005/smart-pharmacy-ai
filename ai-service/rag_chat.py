import json
import re
import threading
import time
from typing import Any, Generator

import httpx
from fastapi import HTTPException
from loguru import logger

from config import (
    CHAT_PROVIDER,
    GEMINI_API_KEY,
    GEMINI_ENABLE_SEARCH_GROUNDING,
    GEMINI_MODEL,
    OLLAMA_BASE_URL,
    OLLAMA_KEEP_ALIVE,
    OLLAMA_NUM_CTX,
    OLLAMA_NUM_PREDICT,
    OLLAMA_TIMEOUT_SEC,
    QWEN_MODEL,
)
from hybrid_search import HybridSearchEngine, normalize_vi
from model_registry import AiModelRegistry

# Cache TTL cho câu hỏi đơn lượt (FAQ / Quick-Reply Chips) để tăng tốc phản hồi < 50ms
_CHAT_CACHE_LOCK = threading.Lock()
_CHAT_CACHE: dict[tuple[str, str, str], tuple[float, dict[str, Any]]] = {}
_CHAT_CACHE_TTL_SEC = 120.0
_CHAT_CACHE_MAX_ITEMS = 120

_GEMINI_CLIENT_LOCK = threading.Lock()
_GEMINI_CLIENT_SINGLETON: Any = None


def _get_gemini_client():
    global _GEMINI_CLIENT_SINGLETON
    if _GEMINI_CLIENT_SINGLETON is not None:
        return _GEMINI_CLIENT_SINGLETON
    with _GEMINI_CLIENT_LOCK:
        if _GEMINI_CLIENT_SINGLETON is None:
            from google import genai
            _GEMINI_CLIENT_SINGLETON = genai.Client(api_key=GEMINI_API_KEY)
        return _GEMINI_CLIENT_SINGLETON


def _cache_get(cache_key: tuple[str, str, str]) -> dict[str, Any] | None:
    now = time.monotonic()
    with _CHAT_CACHE_LOCK:
        hit = _CHAT_CACHE.get(cache_key)
        if not hit:
            return None
        expires_at, payload = hit
        if now > expires_at:
            _CHAT_CACHE.pop(cache_key, None)
            return None
        return dict(payload)


def _cache_set(cache_key: tuple[str, str, str], payload: dict[str, Any]) -> None:
    now = time.monotonic()
    with _CHAT_CACHE_LOCK:
        if len(_CHAT_CACHE) >= _CHAT_CACHE_MAX_ITEMS:
            oldest_key = min(_CHAT_CACHE.keys(), key=lambda k: _CHAT_CACHE[k][0])
            _CHAT_CACHE.pop(oldest_key, None)
        _CHAT_CACHE[cache_key] = (now + _CHAT_CACHE_TTL_SEC, dict(payload))

EMERGENCY_RED_FLAGS = [
    "khó thở",
    "kho tho",
    "đau ngực",
    "dau nguc",
    "tức ngực",
    "co giật",
    "co giat",
    "hôn mê",
    "hon me",
    "bất tỉnh",
    "nôn ra máu",
    "non ra mau",
    "đi ngoài ra máu",
    "sốc phản vệ",
    "soc phan ve",
    "phù mặt",
    "sưng môi",
    "liệt nửa người",
    "ngừng thở",
]

GREETING_FAST_RE = re.compile(
    r"^\s*(xin\s+chào|chào\s+bạn|chào\s+shop|chào\s+dược\s+sĩ|chào|hello|hi|alo|có\s+ai\s+không)\s*[!?.~]*\s*$",
    re.IGNORECASE,
)

THANKS_FAST_RE = re.compile(
    r"^\s*(cảm\s+ơn|cam\s+on|thank\s*you|thanks|ok\s+cảm\s+ơn|tạm\s+biệt)\s*[!?.~]*\s*$",
    re.IGNORECASE,
)

SYMPTOM_CUES = [
    "triệu chứng",
    "bị sốt",
    "sốt",
    "đau đầu",
    "đau bụng",
    "đau bao tử",
    "đau dạ dày",
    "ho ",
    "ho,",
    "sổ mũi",
    "nghẹt mũi",
    "tiêu chảy",
    "buồn nôn",
    "chóng mặt",
    "mất ngủ",
    "nổi mề đay",
    "rát họng",
    "đau họng",
    "nhức mỏi",
    "nhiệt miệng",
    "táo bón",
    "dị ứng",
    "mỏi mắt",
    "trào ngược",
    "tư vấn triệu chứng",
]

# Phát hiện tên mã thuốc lạ/bịa đặt dạng Prefix-9999XYZ hoặc mã có >= 3 chữ số đi kèm chữ cái
FAKE_BRAND_TOKEN_RE = re.compile(r"\b([a-zA-Z]{4,}-\d{3,}[a-zA-Z0-9]*)\b")
KNOWN_HYPHEN_TERMS = {"omega-3", "omega-6", "omega-9", "covid-19", "vitamin-d3", "vitamin-b12"}

# Từ khóa nhận biết ý định thuộc phạm vi y tế / nhà thuốc / mua sắm dược phẩm (không dấu)
HEALTH_AND_STORE_STEMS = [
    "dau", "sot", "ho", "ngua", "viem", "loet", "nhiet mieng", "lo mieng", "tieu chay",
    "tao bon", "mat ngu", "di ung", "me day", "cam", "cum", "thuoc", "vien", "uong",
    "boi", "nho", "xit", "lieu", "tre", "em be", "ba bau", "mang thai", "cho con bu",
    "tuong tac", "tac dung phu", "chong chi dinh", "huyet ap", "tieu duong", "da day",
    "bao tu", "gan", "than", "mat", "tai", "mui", "hong", "da", "rang", "loi", "nha chu",
    "vitamin", "khoang", "kem", "sat", "canxi", "omega", "men", "siro", "khang sinh",
    "ha sot", "giam dau", "chong mat", "buon non", "non", "rat", "sung", "bong",
    "vet thuong", "khop", "co", "lung", "vai gay", "hoat chat", "don thuoc", "ke don",
    "toa", "rx", "otc", "tpcn", "duoc si", "bac si", "benh", "trieu chung",
    "chuot rut", "bap chan", "bong gan", "bam tim", "mun", "nam", "cham", "vay nen",
    "thai ky", "tiet nieu", "phu khoa", "nam khoa", "xuong khop", "tim mach", "tieu hoa",
    "trao nguoc", "o chua", "day bung", "duong huyet", "mo mau", "dinh duong",
    "giao hang", "van chuyen", "ship", "freeship", "tra cuu", "don hang", "thanh toan",
    "cod", "vietqr", "bao gia", "nha thuoc", "mua thuoc", "suc khoe", "de khang",
    "paracetamol", "ibuprofen", "omeprazol", "amoxicillin", "augmentin", "azithromycin",
    "cefixim", "panadol", "hapacol", "efferalgan", "decolgen", "tiffy", "prospan",
    "acemuc", "strepsils", "otrivin", "smecta", "phosphalugel", "gaviscon", "enterogermina",
    "oresol", "berberin", "telfast", "loratadin", "vrohto", "bepanthen", "voltaren", "ginkgo",
]

NON_MEDICAL_OFF_TOPIC_PATTERNS = [
    r"\bthu\s+do\s+nuoc\b",
    r"\blap\s+trinh\b",
    r"\bviet\s+code\b",
    r"\bpython\b",
    r"\bjavascript\b",
    r"\bbitcoin\b",
    r"\bcrypto\b",
    r"\bchung\s+khoan\b",
    r"\bxo\s+so\b",
    r"\bbong\s+da\b",
    r"\bthoi\s+tiet\b",
    r"\bgiai\s+phuong\s+trinh\b",
    r"\btinh\s+tich\s+phan\b",
]


def _detect_mode(message: str, mode_hint: str | None) -> str:
    if mode_hint in ("DRUG_QA", "SYMPTOM_CONSULTATION"):
        return mode_hint
    low = message.lower()
    if any(cue in low for cue in SYMPTOM_CUES):
        return "SYMPTOM_CONSULTATION"
    return "DRUG_QA"


def _has_health_or_store_intent(query: str) -> bool:
    norm = f" {normalize_vi(query)} "
    for stem in HEALTH_AND_STORE_STEMS:
        if f" {stem} " in norm or (len(stem) >= 5 and stem in norm):
            return True
    return False


def _is_non_medical_off_topic(query: str, rag: dict[str, Any]) -> bool:
    norm = normalize_vi(query)
    if any(re.search(pat, norm) for pat in NON_MEDICAL_OFF_TOPIC_PATTERNS):
        if rag["topDocSemantic"] < 0.25 and rag["topDocKeyword"] < 0.25:
            return True
    return False


def _is_fictional_drug_query(query: str, rag: dict[str, Any]) -> bool:
    m = FAKE_BRAND_TOKEN_RE.search(query)
    if not m:
        return False
    token_low = m.group(0).lower()
    if token_low in KNOWN_HYPHEN_TERMS:
        return False
    token_norm = normalize_vi(token_low)
    prefix = token_norm.split("-")[0]

    for d in rag.get("documents") or []:
        hay = normalize_vi(f"{d.get('Title', '')} {d.get('SourceRef', '')} {d.get('Content', '')}")
        if token_norm in hay or (len(prefix) >= 5 and prefix in hay):
            return False
    for p in rag.get("products") or []:
        pname = normalize_vi(p.get("ProductName", ""))
        if token_norm in pname or (len(prefix) >= 5 and prefix in pname):
            return False
    return True


def _classify_crag_grounding(
    query: str,
    is_emergency: bool,
    rag: dict[str, Any],
) -> str:
    """
    Corrective RAG (CRAG) phân loại 3 tầng minh bạch:
    - INSUFFICIENT: câu phi y tế, tên thuốc mã lạ không có trong hệ thống, hoặc vô nghĩa.
    - LOCAL_HDSD: khớp trực tiếp Kho HDSD / Dược thư nội bộ (`KnowledgeDocument`).
    - GENERAL_MEDICAL: câu hỏi sức khỏe / nhà thuốc tự viết hợp lệ ngoài 80 tài liệu sẵn có -> mở khóa trả lời chuẩn y khoa thay vì từ chối.
    """
    if not is_emergency and _is_fictional_drug_query(query, rag):
        return "INSUFFICIENT"
    if not is_emergency and _is_non_medical_off_topic(query, rag):
        return "INSUFFICIENT"

    has_strong_doc_hit = rag["topDocSemantic"] >= 0.27 or rag["topDocKeyword"] >= 0.25
    if has_strong_doc_hit and len(rag["documents"]) > 0:
        return "LOCAL_HDSD"

    if is_emergency or _has_health_or_store_intent(query) or rag["topDocSemantic"] >= 0.19 or len(rag["products"]) > 0:
        return "GENERAL_MEDICAL"

    return "INSUFFICIENT"


def _extract_json_object(raw_text: str) -> dict[str, Any]:
    text = (raw_text or "").strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

    # Fallback khi LLM bị cắt ngắn giữa chừng ở json_mode: bóc tách sạch trường "answer" thay vì làm lộ JSON thô
    ans_match = re.search(r'"answer"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)', text, re.DOTALL)
    if ans_match:
        raw_ans = ans_match.group(1)
        try:
            decoded_ans = json.loads(f'"{raw_ans}"')
        except Exception:
            decoded_ans = (
                raw_ans.replace('\\n', '\n')
                .replace('\\t', ' ')
                .replace('\\"', '"')
                .replace('\\\\', '\\')
            )
        cond_match = re.search(r'"suspectedCondition"\s*:\s*"([^"\\]*)"', text)
        doc_matches = re.search(r'"citedDocIds"\s*:\s*\[([^\]]*)\]', text)
        doc_ids: list[int] = []
        if doc_matches:
            for tok in re.findall(r'\d+', doc_matches.group(1)):
                doc_ids.append(int(tok))
        return {
            "answer": decoded_ans.strip(),
            "suspectedCondition": cond_match.group(1) if cond_match else "",
            "citedDocIds": doc_ids,
            "warnings": [],
            "suggestedProductIds": [],
        }

    raise ValueError("LLM không trả về JSON hợp lệ")


def _extract_inline_doc_ids(answer_text: str) -> list[int]:
    return [int(m.group(1)) for m in re.finditer(r"\[DOC-(\d+)\]", answer_text or "")]


def _format_citation(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "docId": d["DocID"],
        "productId": d.get("ProductID"),
        "docType": d.get("DocType", "LEAFLET"),
        "title": d["Title"],
        "section": d["Section"],
        "sourceName": d["SourceName"],
        "sourceRef": d.get("SourceRef"),
        "verifiedBy": d.get("VerifiedBy"),
        "snippet": str(d.get("Content") or "")[:320],
    }


def _format_suggested_product(prod: dict[str, Any]) -> dict[str, Any]:
    return {
        "ProductID": prod["ProductID"],
        "ProductName": prod["ProductName"],
        "ProductType": prod["ProductType"],
        "Unit": prod["Unit"],
        "Price": prod["Price"],
        "TotalStock": prod.get("TotalStock", 0),
        "IsRx": bool(prod.get("IsRx")),
        "requiresPrescription": bool(prod.get("IsRx")),
    }


def _filter_suggested_products(
    raw_products: list[dict[str, Any]],
    final_mode: str,
    grounding_mode: str,
    audience: str,
    patient_context: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    age_group = str((patient_context or {}).get("ageGroup") or "ADULT").upper()
    pregnant = bool((patient_context or {}).get("pregnantOrBreastfeeding"))
    allergy_norm = normalize_vi(str((patient_context or {}).get("allergies") or ""))
    allergy_tokens = [t for t in allergy_norm.split() if len(t) >= 4]

    suggested: list[dict[str, Any]] = []
    seen: set[int] = set()
    for prod in raw_products:
        pid = int(prod["ProductID"])
        if pid in seen or int(prod.get("TotalStock", 0)) <= 0:
            continue
        is_rx = bool(prod.get("IsRx"))
        # Khi tư vấn triệu chứng hoặc tư vấn phổ thông cho khách ngoài -> chặn gợi ý thuốc Kê đơn Rx tự mua
        if is_rx and (final_mode == "SYMPTOM_CONSULTATION" or (audience == "CUSTOMER" and grounding_mode == "GENERAL_MEDICAL")):
            continue

        pname_low = normalize_vi(str(prod.get("ProductName") or ""))
        pdesc_low = normalize_vi(str(prod.get("Description") or ""))
        full_text = f"{pname_low} {pdesc_low}"

        # Lọc an toàn theo hồ sơ người bệnh (dị ứng / trẻ em / thai kỳ)
        if allergy_tokens and any(tok in full_text for tok in allergy_tokens):
            continue
        if age_group == "CHILD":
            # Loại bỏ các chế phẩm hàm lượng người lớn / caffein / xịt mũi người lớn 0.1%
            if any(k in pname_low for k in ("extra", "caffein", "0.1%", "500mg", "650mg", "400mg", "nguoi lon")):
                continue
        if pregnant and any(k in full_text for k in ("ibuprofen", "aspirin", "otrivin", "xylometazolin", "caffein")):
            continue

        seen.add(pid)
        suggested.append(_format_suggested_product(prod))
        if len(suggested) >= 4:
            break
    return suggested


def _build_fast_path_greeting(query: str, mode: str, audience: str) -> dict[str, Any]:
    is_thanks = bool(THANKS_FAST_RE.match(query))
    if is_thanks:
        answer = (
            "Rất vui được hỗ trợ bạn! Nếu cần tra cứu công dụng thuốc, kiểm tra tương tác hoặc gặp Dược sĩ tư vấn thêm, bạn cứ nhắn bất cứ lúc nào."
            if audience == "CUSTOMER"
            else "Đã ghi nhận! Bạn có thể tiếp tục hỏi về HDSD [DOC-id], tương tác thuốc hoặc triệu chứng lâm sàng bất cứ lúc nào."
        )
    elif audience == "CUSTOMER":
        answer = (
            "Xin chào! Mình là **Trợ lý AI Nhà thuốc PharmaCore Direct**.\n\n"
            "Mình có thể hỗ trợ bạn ngay:\n"
            "- Tra cứu công dụng, liều dùng và chống chỉ định thuốc OTC/Rx.\n"
            "- Gợi ý chăm sóc triệu chứng nhẹ (sốt, ho, đau dạ dày, dị ứng, nhiệt miệng...).\n"
            "- Hướng dẫn gửi ảnh đơn thuốc bác sĩ, tra cứu đơn hàng hoặc giao nhanh 2H."
        )
    else:
        answer = (
            "Xin chào Dược sĩ! Hệ thống **Trợ lý Dược Lâm sàng PharmaCore** đã sẵn sàng.\n"
            "Bạn có thể hỏi nhanh liều dùng, chống chỉ định theo `[DOC-id]`, kiểm tra phối hợp thuốc hoặc triệu chứng OTC."
        )

    return {
        "modelUsed": "fast-path-router",
        "provider": "fast-path",
        "fallbackUsed": False,
        "mode": mode,
        "groundingMode": "FAST_PATH",
        "suspectedCondition": "Chào hỏi & Điều hướng tư vấn nhanh",
        "answer": answer,
        "citations": [],
        "suggestedProducts": [],
        "warnings": [],
        "shouldConsultPharmacist": False,
        "insufficientKnowledge": False,
        "emergencyAlert": False,
        "disclaimer": (
            "Thông tin AI hỗ trợ tra cứu nhanh; luôn đối chiếu Tờ HDSD và ý kiến chuyên môn của Dược sĩ khi dùng thuốc."
        ),
    }


def _build_insufficient_response(
    query: str,
    mode: str,
    audience: str,
    is_emergency: bool,
    provider_name: str,
    model_name: str,
) -> dict[str, Any]:
    if is_emergency:
        answer = (
            "**CẢNH BÁO DẤU HIỆU CẤP CỨU:** Triệu chứng bạn mô tả có thể nguy hiểm tính mạng. "
            "Vui lòng **gọi cấp cứu 115** hoặc đến ngay cơ sở y tế / bệnh viện gần nhất để được xử trí kịp thời."
        )
    elif audience == "CUSTOMER":
        answer = (
            "Câu hỏi của bạn nằm ngoài phạm vi thông tin thuốc/sức khỏe hoặc chưa khớp thuốc có trong danh mục nhà thuốc. "
            "Để bảo đảm an toàn, mình không phỏng đoán liều dùng khi không chắc chắn. "
            "Bạn có thể diễn đạt lại triệu chứng/tên hoạt chất hoặc bấm **Gặp Dược sĩ** bên dưới để được hỗ trợ trực tiếp miễn phí."
        )
    else:
        answer = (
            "Truy vấn nằm ngoài phạm vi tài liệu Dược thư / Tờ HDSD hiện có tại nhà thuốc hoặc mã thuốc không tồn tại trong danh mục. "
            "Để đảm bảo an toàn, hệ thống không đưa ra phỏng đoán. Vui lòng trao đổi Dược sĩ lâm sàng hoặc bổ sung tài liệu HDSD vào Kho tri thức."
        )

    warnings = (
        ["DẤU HIỆU CẤP CỨU: Gọi 115 hoặc tới bệnh viện gần nhất ngay lập tức."]
        if is_emergency
        else ["Hệ thống chặn suy đoán ngoài phạm vi y tế / thuốc không tồn tại trong dữ liệu."]
    )
    return {
        "modelUsed": model_name,
        "provider": provider_name,
        "fallbackUsed": False,
        "mode": mode,
        "groundingMode": "INSUFFICIENT",
        "suspectedCondition": "Cảnh báo an toàn y tế" if is_emergency else "Ngoài phạm vi dược khoa / danh mục nhà thuốc",
        "answer": answer,
        "citations": [],
        "suggestedProducts": [],
        "warnings": warnings,
        "shouldConsultPharmacist": True,
        "insufficientKnowledge": not is_emergency,
        "emergencyAlert": is_emergency,
        "disclaimer": "Không thay thế chẩn đoán của bác sĩ hay quyết định cấp phát thuốc của Dược sĩ.",
    }


def _parse_patient_context(patient_ctx: dict[str, Any] | None) -> tuple[str, str, list[str], bool]:
    """Chuẩn hóa hồ sơ sàng lọc bệnh nhân (tuổi, thai kỳ, dị ứng, bệnh nền) thành cache key, prompt và cảnh báo."""
    if not patient_ctx:
        return "DEFAULT", "", [], False

    age_group = str(patient_ctx.get("ageGroup") or "ADULT").upper()
    if age_group not in ("ADULT", "CHILD", "ELDERLY"):
        age_group = "ADULT"
    pregnant = bool(patient_ctx.get("pregnantOrBreastfeeding"))
    allergies = str(patient_ctx.get("allergies") or "").strip()[:150]
    chronic = str(patient_ctx.get("chronicConditions") or "").strip()[:150]

    if age_group == "ADULT" and not pregnant and not allergies and not chronic:
        return "DEFAULT", "", [], False

    sig = f"{age_group}|p={int(pregnant)}|a={normalize_vi(allergies)}|c={normalize_vi(chronic)}"
    lines: list[str] = []
    warnings: list[str] = []
    extra_caution = False

    if age_group == "CHILD":
        lines.append("- Đối tượng: TRẺ EM (nhấn mạnh hỏi/tính liều theo CÂN NẶNG kg và độ tuổi; KHÔNG gợi ý Aspirin/thuốc người lớn).")
        warnings.append("Đối tượng Trẻ em: Liều dùng bắt buộc điều chỉnh theo cân nặng và hướng dẫn Dược sĩ/Bác sĩ nhi.")
        extra_caution = True
    elif age_group == "ELDERLY":
        lines.append("- Đối tượng: NGƯỜI CAO TUỔI (thận trọng chức năng gan/thận, hạ huyết áp thế đứng, kích ứng dạ dày NSAID).")
        extra_caution = True
    else:
        lines.append("- Đối tượng: Người trưởng thành.")

    if pregnant:
        lines.append("- THAI KỲ / CHO CON BÚ: Thận trọng tối đa; ưu tiên chăm sóc không dùng thuốc hoặc hoạt chất an toàn cao, tránh Ibuprofen 3 tháng cuối/thuốc thông mũi co mạch.")
        warnings.append("Phụ nữ mang thai / cho con bú: Cần hỏi Dược sĩ lâm sàng hoặc Bác sĩ sản khoa trước khi dùng bất kỳ thuốc nào.")
        extra_caution = True

    if allergies:
        lines.append(f"- TIỀN SỬ DỊ ỨNG KHAI BÁO: {allergies} -> TUYỆT ĐỐI tránh thuốc cùng hoạt chất/nhóm dị ứng này.")
        warnings.append(f"Lưu ý dị ứng người bệnh đã khai báo: {allergies}.")
        extra_caution = True

    if chronic:
        lines.append(f"- BỆNH NỀN KHAI BÁO: {chronic} -> Lưu ý tương tác & chống chỉ định (ví dụ đau dạ dày tránh NSAID, cao huyết áp tránh Phenylephrine).")
        extra_caution = True

    return sig, "=== HỒ SƠ SÀNG LỌC BỆNH NHÂN ===\n" + "\n".join(lines), warnings, extra_caution


def _build_prompts(
    query: str,
    mode: str,
    grounding_mode: str,
    audience: str,
    is_emergency: bool,
    retrieved_docs: list[dict[str, Any]],
    retrieved_products: list[dict[str, Any]],
    interaction_warnings: list[str],
    output_json: bool,
    patient_context_block: str = "",
) -> tuple[str, str]:
    doc_context_lines = [
        f"[DOC-{d['DocID']}] ({d['DocType']} | {d['Title']} — {d['Section']} | Nguồn: {d['SourceName']}): {str(d['Content'])[:420]}"
        for d in retrieved_docs[:5]
    ]

    product_context_lines = []
    for p in retrieved_products[:5]:
        rx_label = "KÊ ĐƠN (Rx - KHÔNG gợi ý tự mua OTC)" if p.get("IsRx") else "KHÔNG KÊ ĐƠN (OTC)"
        stock_label = "Còn hàng" if int(p.get("TotalStock", 0)) > 0 else "Tạm hết hàng"
        if audience == "CUSTOMER":
            product_context_lines.append(
                f"[SP-{p['ProductID']}] {p['ProductName']} | {rx_label} | Giá: {int(p['Price']):,}đ/{p['Unit']} | {stock_label}"
            )
        else:
            product_context_lines.append(
                f"[SP-{p['ProductID']}] {p['ProductName']} | {rx_label} | Giá: {int(p['Price'])}đ/{p['Unit']} | Tồn: {p.get('TotalStock', 0)}"
            )

    ddi_block = ""
    if interaction_warnings:
        ddi_block = "\n=== CẢNH BÁO TƯƠNG TÁC / TRÙNG HOẠT CHẤT TỪ HỆ THỐNG GPP ===\n" + "\n".join(
            f"- {w}" for w in interaction_warnings
        )

    persona = (
        "Bạn là Trợ lý Tư vấn Sức khỏe & Dược phẩm thân thiện của Nhà thuốc trực tuyến PharmaCore Direct."
        if audience == "CUSTOMER"
        else "Bạn là Trợ lý Dược lâm sàng nội bộ PharmaCore."
    )

    if grounding_mode == "LOCAL_HDSD":
        grounding_rule = (
            "1. Ưu tiên bám sát các đoạn [DOC-<id>] bên dưới và gắn mã trích dẫn [DOC-<id>] ngay cuối câu/ý liên quan.\n"
            "2. Không tự ý bịa giá bán hay tên thuốc ngoài danh mục sản phẩm được cung cấp."
        )
    else:
        grounding_rule = (
            "1. Đây là câu hỏi sức khỏe/dược khoa ngoài tập tờ HDSD nội bộ vừa đủ: HÃY TRẢ LỜI RÕ RÀNG, HỮU ÍCH, CHÍNH XÁC theo kiến thức y dược chính thống (chăm sóc tại nhà, hướng dẫn xử trí không dùng thuốc, nhóm hoạt chất OTC phổ thông, dấu hiệu cần đi khám) thay vì từ chối.\n"
            "2. Nếu có đoạn [DOC-<id>] liên quan bên dưới thì gắn [DOC-<id>]; nếu dùng kiến thức y khoa phổ thông thì ghi ngắn cuối câu trả lời: *(Tham khảo y khoa tổng quát — không thay thế chỉ định bác sĩ/dược sĩ)*.\n"
            "3. Không tự bịa tên thuốc/giá bán đóng hộp riêng nếu không có trong danh mục tồn kho bên dưới."
        )

    rx_rule = (
        "4. QUY TẮC THUỐC KÊ ĐƠN (Rx): Tuyệt đối KHÔNG khuyên khách tự mua thuốc Kê đơn (Rx) khi tư vấn triệu chứng; nếu nhắc thuốc Rx, nhấn mạnh CHỈ bán khi có đơn bác sĩ / Dược sĩ thẩm định."
    )
    ddi_rule = (
        "5. Nếu có cảnh báo tương tác / trùng hoạt chất hoặc hồ sơ dị ứng/mang thai/trẻ em bên dưới, BẮT BUỘC ưu tiên kiểm tra chống chỉ định trước khi gợi ý chăm sóc."
    )
    if audience == "CUSTOMER":
        tone_rule = "6. Giọng văn lịch sự, dễ hiểu cho bệnh nhân/người mua lẻ (không lộ số lượng tồn kho thô, không dùng từ ngữ quản trị nội bộ)."
    else:
        tone_rule = "6. Trả lời cô đọng, chuẩn chuyên môn dược lâm sàng hỗ trợ Dược sĩ tra cứu nhanh."

    if output_json:
        format_rule = (
            "7. Trả về DUY NHẤT một JSON object hợp lệ (không bọc markdown), đúng schema:\n"
            '{"mode": "DRUG_QA | SYMPTOM_CONSULTATION", "suspectedCondition": "string", '
            '"answer": "string", "citedDocIds": [number], "suggestedProductIds": [number], '
            '"warnings": ["string"], "shouldConsultPharmacist": boolean, "insufficientKnowledge": false}'
        )
    elif audience == "CUSTOMER" and mode == "SYMPTOM_CONSULTATION":
        format_rule = (
            "7. Trình bày bằng tiếng Việt súc tích (90-170 từ), cấu trúc rõ ràng gồm 4 mục ngắn bằng Markdown:\n"
            "- **Định hướng sơ bộ:** *(mang tính sàng lọc tham khảo, không thay thế bác sĩ)*\n"
            "- **Chăm sóc & OTC gợi ý:** (cách xử trí tại nhà + nhóm hoạt chất OTC an toàn nếu phù hợp)\n"
            "- **Lưu ý an toàn:** (liên quan độ tuổi/dị ứng/bệnh nền nếu có)\n"
            "- **Cần đi khám ngay nếu:** (dấu hiệu cảnh báo nặng)\n"
            "Không tự viết mã [SP-...] hay số lượng tồn kho; trả lời TRỰC TIẾP nội dung văn bản (KHÔNG xuất JSON thô)."
        )
    else:
        format_rule = (
            "7. Trình bày bằng tiếng Việt súc tích, đi thẳng vào giải đáp trọng tâm (khoảng 70-150 từ, gạch đầu dòng rõ ràng, dễ đọc trên di động). "
            "Không tự viết mã [SP-...] hay số lượng tồn kho; trả lời TRỰC TIẾP nội dung văn bản (KHÔNG xuất JSON thô)."
        )

    system_prompt = "\n".join([persona, "QUY TẮC BẮT BUỘC:", grounding_rule, rx_rule, ddi_rule, tone_rule, format_rule])

    ctx_section = f"\n\n{patient_context_block}" if patient_context_block else ""
    user_prompt = (
        f"Chế độ: {mode} | Tầng tri thức: {grounding_mode}\n"
        f"{'CẢNH BÁO ĐỎ: Câu hỏi có dấu hiệu cấp cứu lâm sàng, ưu tiên cảnh báo gọi 115 / đi bệnh viện ngay!' if is_emergency else ''}\n\n"
        f"Câu hỏi: {query}{ctx_section}\n\n"
        f"=== TÀI LIỆU NHÀ THUỐC ([DOC-id]) ===\n" + ("\n".join(doc_context_lines) if doc_context_lines else "(Không có [DOC-id] khớp trực tiếp)") + "\n\n"
        f"=== DANH MỤC SẢN PHẨM KHẢ DỤNG ===\n" + ("\n".join(product_context_lines) if product_context_lines else "(Không có sản phẩm khớp trực tiếp)")
        + ddi_block
    )
    return system_prompt, user_prompt


def _select_primary_provider() -> tuple[str, str]:
    gemini_ready = bool(GEMINI_API_KEY) and CHAT_PROVIDER != "ollama"
    if gemini_ready:
        return "google-ai-studio", GEMINI_MODEL
    return "ollama", QWEN_MODEL


def _build_gemini_tool(hybrid_engine: HybridSearchEngine, only_storefront_published: bool, collected_products: list[dict[str, Any]]):
    def search_pharmacy_catalog(search_query: str) -> str:
        """Tra cứu thuốc/sản phẩm thực tế còn hàng trong danh mục nhà thuốc PharmaCore bằng từ khóa hoặc triệu chứng."""
        res = hybrid_engine.search_products(
            query=search_query,
            limit=4,
            only_storefront_published=only_storefront_published,
            include_test=False,
        )
        items = res.get("results") or []
        for it in items:
            if all(existing["ProductID"] != it["ProductID"] for existing in collected_products):
                collected_products.append(it)
        if not items:
            return "Không tìm thấy sản phẩm phù hợp trong danh mục nhà thuốc."
        return json.dumps(
            [
                {
                    "ProductID": it["ProductID"],
                    "ProductName": it["ProductName"],
                    "ProductType": it["ProductType"],
                    "Unit": it["Unit"],
                    "Price": it["Price"],
                    "IsRx": it["IsRx"],
                    "InStock": int(it.get("TotalStock", 0)) > 0,
                }
                for it in items
            ],
            ensure_ascii=False,
        )

    return search_pharmacy_catalog


def _build_gemini_request(
    system_prompt: str,
    user_prompt: str,
    history: list[dict[str, str]],
    grounding_mode: str,
    hybrid_engine: HybridSearchEngine,
    only_storefront_published: bool,
    collected_products: list[dict[str, Any]],
    json_mode: bool,
) -> tuple[Any, Any]:
    from google.genai import types

    contents: list[types.Content] = []
    for h in (history or [])[-4:]:
        txt = str(h.get("content") or "").strip()[:450]
        if not txt:
            continue
        role = "model" if h.get("role") == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=txt)]))
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_prompt)]))

    tools: list[Any] = []
    if not json_mode and grounding_mode == "GENERAL_MEDICAL" and GEMINI_ENABLE_SEARCH_GROUNDING:
        tools.append(types.Tool(google_search=types.GoogleSearch()))

    cfg_kwargs: dict[str, Any] = {
        "system_instruction": system_prompt,
        "temperature": 0.2 if json_mode else 0.25,
        "max_output_tokens": 1000 if json_mode else 400,
    }
    thinking_level_cls = getattr(types, "ThinkingLevel", None)
    if thinking_level_cls is not None and hasattr(types, "ThinkingConfig") and not json_mode:
        cfg_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=thinking_level_cls.MINIMAL)
    if json_mode:
        cfg_kwargs["response_mime_type"] = "application/json"
    if tools:
        cfg_kwargs["tools"] = tools

    return contents, types.GenerateContentConfig(**cfg_kwargs)


def _build_ollama_payload(
    system_prompt: str,
    user_prompt: str,
    history: list[dict[str, str]],
    stream: bool,
    json_mode: bool,
) -> dict[str, Any]:
    history_trimmed = [
        {"role": "assistant" if h.get("role") == "assistant" else "user", "content": str(h.get("content", ""))[:450]}
        for h in (history or [])[-4:]
        if h.get("content")
    ]
    payload: dict[str, Any] = {
        "model": QWEN_MODEL,
        "stream": stream,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {"temperature": 0.2, "num_ctx": OLLAMA_NUM_CTX, "num_predict": OLLAMA_NUM_PREDICT},
        "messages": [{"role": "system", "content": system_prompt}, *history_trimmed, {"role": "user", "content": user_prompt}],
    }
    if json_mode:
        payload["format"] = "json"
    return payload


def _call_gemini_sync(
    system_prompt: str,
    user_prompt: str,
    history: list[dict[str, str]],
    grounding_mode: str,
    hybrid_engine: HybridSearchEngine,
    only_storefront_published: bool,
    collected_products: list[dict[str, Any]],
    json_mode: bool = True,
) -> str:
    client = _get_gemini_client()
    contents, cfg = _build_gemini_request(
        system_prompt, user_prompt, history, grounding_mode, hybrid_engine, only_storefront_published, collected_products, json_mode
    )
    resp = client.models.generate_content(model=GEMINI_MODEL, contents=contents, config=cfg)
    return (resp.text or "").strip()


def _stream_gemini_chunks(
    system_prompt: str,
    user_prompt: str,
    history: list[dict[str, str]],
    grounding_mode: str,
    hybrid_engine: HybridSearchEngine,
    only_storefront_published: bool,
    collected_products: list[dict[str, Any]],
) -> Generator[str, None, None]:
    client = _get_gemini_client()
    contents, cfg = _build_gemini_request(
        system_prompt, user_prompt, history, grounding_mode, hybrid_engine, only_storefront_published, collected_products, json_mode=False
    )
    for chunk in client.models.generate_content_stream(model=GEMINI_MODEL, contents=contents, config=cfg):
        text_piece = getattr(chunk, "text", None)
        if text_piece:
            yield text_piece


def _call_ollama_sync(
    system_prompt: str,
    user_prompt: str,
    history: list[dict[str, str]],
    registry: AiModelRegistry,
    json_mode: bool = True,
) -> str:
    registry.ensure_llm_ready()
    ollama_payload = _build_ollama_payload(system_prompt, user_prompt, history, stream=False, json_mode=json_mode)

    try:
        with httpx.Client(timeout=OLLAMA_TIMEOUT_SEC) as client:
            resp = client.post(f"{OLLAMA_BASE_URL}/api/chat", json=ollama_payload)
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail={
                        "code": "AI_LLM_MODEL_DOWN",
                        "model": QWEN_MODEL,
                        "message": f"Ollama trả lỗi HTTP {resp.status_code} cho model '{QWEN_MODEL}': {resp.text[:200]}",
                    },
                )
            data = resp.json()
            return str((data.get("message") or {}).get("content") or "").strip()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AI_LLM_MODEL_DOWN",
                "model": QWEN_MODEL,
                "message": f"Model Qwen '{QWEN_MODEL}' không phản hồi khi suy luận: {exc}",
            },
        ) from exc


def _stream_ollama_chunks(
    system_prompt: str,
    user_prompt: str,
    history: list[dict[str, str]],
    registry: AiModelRegistry,
) -> Generator[str, None, None]:
    registry.ensure_llm_ready()
    ollama_payload = _build_ollama_payload(system_prompt, user_prompt, history, stream=True, json_mode=False)
    with httpx.Client(timeout=OLLAMA_TIMEOUT_SEC) as client:
        with client.stream("POST", f"{OLLAMA_BASE_URL}/api/chat", json=ollama_payload) as resp:
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=503,
                    detail={
                        "code": "AI_LLM_MODEL_DOWN",
                        "model": QWEN_MODEL,
                        "message": f"Ollama trả lỗi HTTP {resp.status_code} cho model '{QWEN_MODEL}'",
                    },
                )
            for line in resp.iter_lines():
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                piece = str((obj.get("message") or {}).get("content") or "")
                if piece:
                    yield piece


def _prepare_rag_pipeline(
    message: str,
    mode_hint: str | None,
    registry: AiModelRegistry,
    hybrid_engine: HybridSearchEngine,
    audience: str,
    only_storefront_published: bool,
    interaction_warnings: list[str],
    patient_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    registry.ensure_embed_ready()

    query = (message or "").strip()
    if len(query) < 2:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_QUERY", "message": "Vui lòng nhập câu hỏi về thuốc hoặc triệu chứng cần tư vấn."},
        )

    mode = _detect_mode(query, mode_hint)
    if GREETING_FAST_RE.match(query) or THANKS_FAST_RE.match(query):
        return {"fastResult": _build_fast_path_greeting(query, mode, audience)}

    low_q = query.lower()
    is_emergency = any(flag in low_q for flag in EMERGENCY_RED_FLAGS)

    rag = hybrid_engine.retrieve_rag_context(
        query,
        doc_limit=5,
        product_limit=5,
        only_storefront_published=only_storefront_published,
    )
    retrieved_docs = rag["documents"]
    retrieved_products = rag["products"]

    grounding_mode = _classify_crag_grounding(query, is_emergency, rag)
    provider_name, model_name = _select_primary_provider()

    if grounding_mode == "INSUFFICIENT":
        return {
            "fastResult": _build_insufficient_response(
                query=query,
                mode=mode,
                audience=audience,
                is_emergency=is_emergency,
                provider_name=provider_name,
                model_name=model_name,
            )
        }

    # Pre-flight check model sẵn sàng trước khi stream để vẫn trả 503 rõ ràng nếu cả Cloud & Local đều tắt
    if provider_name == "ollama":
        registry.ensure_llm_ready()

    patient_sig, patient_block, patient_warnings, extra_caution = _parse_patient_context(patient_context)
    triage_level = (
        "RED_FLAG"
        if is_emergency
        else ("CAUTION" if (extra_caution or interaction_warnings) else "SELF_CARE")
    )

    return {
        "fastResult": None,
        "query": query,
        "mode": mode,
        "groundingMode": grounding_mode,
        "audience": audience,
        "onlyStorefrontPublished": only_storefront_published,
        "isEmergency": is_emergency,
        "retrievedDocs": retrieved_docs,
        "retrievedProducts": retrieved_products,
        "interactionWarnings": list(interaction_warnings or []),
        "patientContext": patient_context,
        "patientContextSig": patient_sig,
        "patientContextBlock": patient_block,
        "patientWarnings": patient_warnings,
        "extraCaution": extra_caution,
        "triageLevel": triage_level,
        "providerName": provider_name,
        "modelName": model_name,
    }


def _finalize_payload(
    answer: str,
    prep: dict[str, Any],
    used_provider: str,
    used_model: str,
    fallback_used: bool,
    extra_products: list[dict[str, Any]],
    cited_doc_ids_override: list[int] | None = None,
) -> dict[str, Any]:
    docs_by_id = {int(d["DocID"]): d for d in prep["retrievedDocs"]}
    inline_cited = _extract_inline_doc_ids(answer)
    raw_cited = cited_doc_ids_override or []

    valid_cited_ids: list[int] = []
    for doc_id in [*raw_cited, *inline_cited]:
        try:
            did = int(doc_id)
        except Exception:
            continue
        if did in docs_by_id and did not in valid_cited_ids:
            valid_cited_ids.append(did)

    grounding_mode = prep["groundingMode"]
    # Trong LOCAL_HDSD nếu có doc khớp nhưng LLM quên gõ [DOC-id] trong câu, tự gắn nguồn tham khảo top docs để minh bạch
    if grounding_mode == "LOCAL_HDSD" and not valid_cited_ids and prep["retrievedDocs"]:
        valid_cited_ids = [int(d["DocID"]) for d in prep["retrievedDocs"][:2]]
        tags = " ".join(f"[DOC-{did}]" for did in valid_cited_ids)
        answer = f"{answer.strip()}\n\n(Nguồn trích dẫn kiểm chứng: {tags})"
    elif grounding_mode == "LOCAL_HDSD" and valid_cited_ids and not inline_cited:
        tags = " ".join(f"[DOC-{did}]" for did in valid_cited_ids)
        answer = f"{answer.strip()}\n\n(Nguồn trích dẫn kiểm chứng: {tags})"

    citations = [_format_citation(docs_by_id[did]) for did in valid_cited_ids]

    all_candidate_products = [*prep["retrievedProducts"], *extra_products]
    suggested_products = _filter_suggested_products(
        all_candidate_products,
        final_mode=prep["mode"],
        grounding_mode=grounding_mode,
        audience=prep["audience"],
        patient_context=prep.get("patientContext"),
    )

    warnings = [*prep.get("patientWarnings", []), *prep["interactionWarnings"]]
    if prep["isEmergency"]:
        warnings.insert(0, "DẤU HIỆU CẤP CỨU: Vui lòng gọi 115 hoặc đến cơ sở y tế gần nhất ngay lập tức.")
    if grounding_mode == "GENERAL_MEDICAL":
        warnings.append("Thông tin sức khỏe tham khảo tổng quát (nội dung ngoài tập tờ HDSD nội bộ nhà thuốc).")

    suspected = (
        "Tư vấn triệu chứng & chăm sóc sức khỏe"
        if prep["mode"] == "SYMPTOM_CONSULTATION"
        else "Giải đáp thông tin thuốc & nhà thuốc"
    )
    if prep["isEmergency"]:
        suspected = "Cảnh báo dấu hiệu cấp cứu lâm sàng"

    return {
        "modelUsed": used_model,
        "provider": used_provider,
        "fallbackUsed": fallback_used,
        "mode": prep["mode"],
        "groundingMode": grounding_mode,
        "triageLevel": prep.get("triageLevel", "SELF_CARE"),
        "suspectedCondition": suspected,
        "answer": answer.strip(),
        "citations": citations,
        "suggestedProducts": suggested_products,
        "warnings": warnings,
        "shouldConsultPharmacist": bool(prep["isEmergency"] or prep["mode"] == "SYMPTOM_CONSULTATION" or prep.get("extraCaution")),
        "insufficientKnowledge": False,
        "emergencyAlert": prep["isEmergency"],
        "disclaimer": (
            f"Nguồn AI: {used_model} ({'Google AI Studio' if used_provider == 'google-ai-studio' else 'Local Ollama'}) "
            "kết hợp RAG Tờ HDSD Nhà thuốc. Thông tin chỉ mang tính tham khảo, không thay thế bác sĩ hay Dược sĩ."
        ),
    }


def run_qwen_rag_chat(
    message: str,
    mode_hint: str | None,
    history: list[dict[str, str]],
    registry: AiModelRegistry,
    hybrid_engine: HybridSearchEngine,
    audience: str = "STAFF",
    only_storefront_published: bool = False,
    interaction_warnings: list[str] | None = None,
    patient_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Endpoint đồng bộ (JSON) dùng Corrective RAG + Google AI Studio Gemini (nếu có GEMINI_API_KEY)
    với fallback tự động sang Local Qwen 2.5 7B.
    """
    patient_sig, _, _, _ = _parse_patient_context(patient_context)
    can_use_cache = not history and not interaction_warnings
    cache_key = ("json", audience, f"{mode_hint or 'AUTO'}::{patient_sig}::{normalize_vi(message)}")
    if can_use_cache:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    prep = _prepare_rag_pipeline(
        message=message,
        mode_hint=mode_hint,
        registry=registry,
        hybrid_engine=hybrid_engine,
        audience=audience,
        only_storefront_published=only_storefront_published,
        interaction_warnings=interaction_warnings or [],
        patient_context=patient_context,
    )
    if prep.get("fastResult") is not None:
        return prep["fastResult"]

    sys_p, user_p = _build_prompts(
        query=prep["query"],
        mode=prep["mode"],
        grounding_mode=prep["groundingMode"],
        audience=audience,
        is_emergency=prep["isEmergency"],
        retrieved_docs=prep["retrievedDocs"],
        retrieved_products=prep["retrievedProducts"],
        interaction_warnings=prep["interactionWarnings"],
        output_json=True,
        patient_context_block=prep.get("patientContextBlock", ""),
    )

    used_provider = prep["providerName"]
    used_model = prep["modelName"]
    fallback_used = False
    collected_products: list[dict[str, Any]] = []

    raw_text = ""
    if used_provider == "google-ai-studio":
        try:
            raw_text = _call_gemini_sync(
                sys_p,
                user_p,
                history,
                prep["groundingMode"],
                hybrid_engine,
                only_storefront_published,
                collected_products,
                json_mode=True,
            )
        except Exception as exc:
            logger.warning(f"Gemini API lỗi ({exc}); chuyển fallback sang local {QWEN_MODEL}...")
            if CHAT_PROVIDER == "gemini":
                raise HTTPException(
                    status_code=503,
                    detail={"code": "AI_GEMINI_UNAVAILABLE", "model": GEMINI_MODEL, "message": f"Google AI Studio lỗi: {exc}"},
                ) from exc
            used_provider = "ollama"
            used_model = QWEN_MODEL
            fallback_used = True

    if used_provider == "ollama":
        raw_text = _call_ollama_sync(sys_p, user_p, history, registry, json_mode=True)

    parsed: dict[str, Any]
    try:
        parsed = _extract_json_object(raw_text)
    except ValueError:
        parsed = {"answer": raw_text, "citedDocIds": [], "warnings": [], "suggestedProductIds": []}

    final_mode = str(parsed.get("mode") or prep["mode"])
    if final_mode not in ("DRUG_QA", "SYMPTOM_CONSULTATION"):
        final_mode = prep["mode"]
    prep["mode"] = final_mode

    answer = str(parsed.get("answer") or "").strip() or "Xin lỗi, hiện chưa thể tổng hợp câu trả lời phù hợp."
    res = _finalize_payload(
        answer=answer,
        prep=prep,
        used_provider=used_provider,
        used_model=used_model,
        fallback_used=fallback_used,
        extra_products=collected_products,
        cited_doc_ids_override=parsed.get("citedDocIds") or [],
    )
    if parsed.get("suspectedCondition"):
        res["suspectedCondition"] = str(parsed["suspectedCondition"])
    llm_warnings = [str(w).strip() for w in (parsed.get("warnings") or []) if str(w).strip()]
    for w in llm_warnings:
        if w not in res["warnings"]:
            res["warnings"].append(w)
    if parsed.get("shouldConsultPharmacist") is True:
        res["shouldConsultPharmacist"] = True
    if can_use_cache and not res.get("fallbackUsed"):
        _cache_set(cache_key, res)
    return res


def stream_rag_chat_events(
    message: str,
    mode_hint: str | None,
    history: list[dict[str, str]],
    registry: AiModelRegistry,
    hybrid_engine: HybridSearchEngine,
    audience: str = "STAFF",
    only_storefront_published: bool = False,
    interaction_warnings: list[str] | None = None,
    patient_context: dict[str, Any] | None = None,
    prepared: dict[str, Any] | None = None,
) -> Generator[tuple[str, dict[str, Any]], None, None]:
    """
    Generator trả các cặp (event_name, json_dict) cho Server-Sent Events (SSE):
    - Stream trực tiếp văn bản Markdown (không bọc JSON) giúp phản hồi nhanh gấp 2-3 lần ở cả Gemini lẫn Ollama.
    """
    prep = prepared or _prepare_rag_pipeline(
        message=message,
        mode_hint=mode_hint,
        registry=registry,
        hybrid_engine=hybrid_engine,
        audience=audience,
        only_storefront_published=only_storefront_published,
        interaction_warnings=interaction_warnings or [],
        patient_context=patient_context,
    )

    if prep.get("fastResult") is not None:
        fast = prep["fastResult"]
        yield ("meta", fast)
        yield ("delta", {"text": fast["answer"]})
        yield ("done", fast)
        return

    can_use_cache = not history and not prep["interactionWarnings"]
    cache_key = ("stream", audience, f"{mode_hint or 'AUTO'}::{prep.get('patientContextSig', 'DEFAULT')}::{normalize_vi(prep['query'])}")
    if can_use_cache:
        cached_stream = _cache_get(cache_key)
        if cached_stream is not None:
            yield ("meta", cached_stream)
            yield ("delta", {"text": cached_stream["answer"]})
            yield ("done", cached_stream)
            return

    preliminary_citations = (
        [_format_citation(d) for d in prep["retrievedDocs"][:3]]
        if prep["groundingMode"] == "LOCAL_HDSD"
        else []
    )
    preliminary_products = _filter_suggested_products(
        prep["retrievedProducts"],
        final_mode=prep["mode"],
        grounding_mode=prep["groundingMode"],
        audience=audience,
        patient_context=prep.get("patientContext"),
    )
    preliminary_warnings = [*prep.get("patientWarnings", []), *prep["interactionWarnings"]]
    if prep["isEmergency"]:
        preliminary_warnings.insert(0, "DẤU HIỆU CẤP CỨU: Vui lòng gọi 115 hoặc đến cơ sở y tế gần nhất ngay lập tức.")

    yield (
        "meta",
        {
            "modelUsed": prep["modelName"],
            "provider": prep["providerName"],
            "fallbackUsed": False,
            "mode": prep["mode"],
            "groundingMode": prep["groundingMode"],
            "triageLevel": prep.get("triageLevel", "SELF_CARE"),
            "suspectedCondition": (
                "Cảnh báo dấu hiệu cấp cứu lâm sàng"
                if prep["isEmergency"]
                else (
                    "Tư vấn triệu chứng & chăm sóc sức khỏe"
                    if prep["mode"] == "SYMPTOM_CONSULTATION"
                    else "Giải đáp thông tin thuốc & nhà thuốc"
                )
            ),
            "citations": preliminary_citations,
            "suggestedProducts": preliminary_products,
            "warnings": preliminary_warnings,
            "shouldConsultPharmacist": bool(prep["isEmergency"] or prep["mode"] == "SYMPTOM_CONSULTATION" or prep.get("extraCaution")),
            "insufficientKnowledge": False,
            "emergencyAlert": prep["isEmergency"],
        },
    )

    sys_p, user_p = _build_prompts(
        query=prep["query"],
        mode=prep["mode"],
        grounding_mode=prep["groundingMode"],
        audience=audience,
        is_emergency=prep["isEmergency"],
        retrieved_docs=prep["retrievedDocs"],
        retrieved_products=prep["retrievedProducts"],
        interaction_warnings=prep["interactionWarnings"],
        output_json=False,
        patient_context_block=prep.get("patientContextBlock", ""),
    )

    used_provider = prep["providerName"]
    used_model = prep["modelName"]
    fallback_used = False
    collected_products: list[dict[str, Any]] = []
    chunks: list[str] = []

    if used_provider == "google-ai-studio":
        try:
            for piece in _stream_gemini_chunks(
                sys_p,
                user_p,
                history,
                prep["groundingMode"],
                hybrid_engine,
                only_storefront_published,
                collected_products,
            ):
                chunks.append(piece)
                yield ("delta", {"text": piece})
        except Exception as exc:
            logger.warning(f"Gemini stream lỗi ({exc}); fallback sang Ollama {QWEN_MODEL}...")
            if CHAT_PROVIDER == "gemini":
                yield ("error", {"code": "AI_GEMINI_UNAVAILABLE", "model": GEMINI_MODEL, "message": str(exc)})
                return
            used_provider = "ollama"
            used_model = QWEN_MODEL
            fallback_used = True
            chunks.clear()

    if used_provider == "ollama" and not chunks:
        try:
            for piece in _stream_ollama_chunks(sys_p, user_p, history, registry):
                chunks.append(piece)
                yield ("delta", {"text": piece})
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            yield ("error", {"code": detail.get("code", "AI_LLM_MODEL_DOWN"), "model": QWEN_MODEL, "message": detail.get("message", "Lỗi Ollama")})
            return

    full_answer = "".join(chunks).strip()
    final_payload = _finalize_payload(
        answer=full_answer or "Xin lỗi, hiện chưa thể tạo nội dung phản hồi. Vui lòng trao đổi với Dược sĩ.",
        prep=prep,
        used_provider=used_provider,
        used_model=used_model,
        fallback_used=fallback_used,
        extra_products=collected_products,
    )
    if can_use_cache and not fallback_used and full_answer:
        _cache_set(cache_key, final_payload)
    yield ("done", final_payload)
