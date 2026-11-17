import re
import time
import unicodedata
from typing import Any

import cv2
import numpy as np
from fastapi import HTTPException

# Từ khóa dòng tiêu đề / hành chính bệnh viện (dùng cho chế độ fallback khi ảnh không có bảng "Thuốc điều trị")
NON_DRUG_HEADER_PATTERNS = [
    r"^\s*so\s*y\s*te\b",
    r"^\s*trung\s*tam\s*y\s*te\b",
    r"^\s*ma\s*don\s*thuoc\b",
    r"^\s*ma\s*so\s*the\s*bao\s*hiem",
    r"^\s*so\s*dinh\s*danh\s*ca\s*nhan",
    r"^\s*benh\s*vien",
    r"^\s*phong\s*kham",
    r"^\s*nha\s*thuoc",
    r"^\s*dia\s*chi",
    r"^\s*dien\s*thoai",
    r"^\s*ho\s*(?:va\s*)?ten",
    r"^\s*benh\s*nhan",
    r"^\s*ngay\s*sinh",
    r"^\s*can\s*nang",
    r"^\s*gioi\s*tinh",
    r"^\s*noi\s*thuong\s*tru",
    r"^\s*tuoi\s*[:\d]",
    r"^\s*chan\s*doan",
    r"^\s*don\s*thuoc\b",
    r"^\s*thuoc\s*dieu\s*tri\b",
    r"^\s*bac\s*s[iy]",
    r"^\s*y\s*s[iy]\s*kham",
    r"^\s*loi\s*dan",
    r"^\s*tai\s*kham",
    r"^\s*ngay\s*hen\s*kham",
    r"^\s*kham\s*benh\s*lai",
    r"^\s*so\s*dien\s*thoai\s*lien\s*he",
    r"^\s*ngay\s*\d{1,2}\s*thang",
    r"^\s*ky\s*ten",
    r"^\s*cong\s*khoan",
]

QUANTITY_UNIT_RE = re.compile(
    r"(?:(?:sl|s[oố]\s*l[uư][oợ]ng|x|\*)\s*[:.]?\s*)?(\d{1,4})\s*"
    r"(vi[eê]n|v|h[oộ]p|h|v[iỉ]|g[oó]i|chai|l[oọ]|tu[yý]p|[oố]ng|mi[eế]ng|c[aá]i|lo|cai|vien|hop|goi|ong|tuyp)?\b",
    re.IGNORECASE,
)

STRENGTH_RE = re.compile(
    r"\b(\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|ug|ml|iu|ui|%)(?:\s*(?:/|x)\s*\d+(?:[.,]\d+)?\s*(?:mg|g|ml|mcg|iu|ui))?)\b",
    re.IGNORECASE,
)

DOSAGE_START_RE = re.compile(
    r"^\s*(?:ti[eê]m(?:\s+d[uư][oớ]i\s+da)?|u[oố]ng|ng[aà]y|s[aá]ng|tr[uư]a|chi[eề]u|t[oố]i|b[oô]i|nh[oỏ]|x[iị]t|ng[aậ]m|b[oơ]m\.?|s[uú]c|r[uử]a|pha|h[oò]a|c[aá]ch\s+d[uù]ng)\b",
    re.IGNORECASE,
)

DOSAGE_INLINE_RE = re.compile(
    r"\b(?:u[oố]ng|ng[aà]y|s[aá]ng|tr[uư]a|chi[eề]u|t[oố]i|b[oô]i|nh[oỏ]|x[iị]t|c[aá]ch\s+d[uù]ng|ti[eê]m\s+d[uư][oớ]i)\b.*$",
    re.IGNORECASE,
)

UNIT_CANONICAL_MAP = {
    "v": "viên",
    "vien": "viên",
    "viên": "viên",
    "h": "hộp",
    "hop": "hộp",
    "hộp": "hộp",
    "vi": "vỉ",
    "vỉ": "vỉ",
    "goi": "gói",
    "gói": "gói",
    "lo": "lọ",
    "lọ": "lọ",
    "chai": "chai",
    "tuyp": "tuýp",
    "tuýp": "tuýp",
    "ong": "ống",
    "ống": "ống",
    "cai": "cái",
    "cái": "cái",
    "mieng": "miếng",
    "miếng": "miếng",
}

KNOWN_UNIT_WORDS = set(UNIT_CANONICAL_MAP.keys()) - {"v", "h"}


def _ascii_lower(text: str) -> str:
    raw = (text or "").strip().replace("đ", "d").replace("Đ", "D")
    nfkd = unicodedata.normalize("NFKD", raw)
    return "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower()


def _normalize_ocr_typos(text: str) -> str:
    cleaned = text.replace("（", "(").replace("）", ")").replace("：", ":")
    cleaned = re.sub(r"(\d)[oO](?=\d|\s*(?:mg|ml|mcg|g|%)\b)", r"\g<1>0", cleaned)
    # Sửa lỗi RapidOCR hay đọc 40IU -> 401U hoặc 10 UI -> 10Un / 10 Ul
    cleaned = re.sub(r"(\d+)\s*[1Il]U\b", r"\g<1>IU", cleaned)
    cleaned = re.sub(r"(\d+)\s*U[nl]\b", r"\g<1> UI", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _normalize_unit(unit_raw: str) -> str:
    key = _ascii_lower(unit_raw)
    return UNIT_CANONICAL_MAP.get(key, unit_raw.strip())


def _extract_dosage_and_strip(text: str) -> tuple[str, str]:
    match = DOSAGE_INLINE_RE.search(text)
    if not match:
        return text, ""
    idx = match.start()
    if idx >= 4:
        return text[:idx].strip(" ,;-:"), match.group(0).strip()
    return text, ""


def _extract_quantity_and_unit(text: str) -> tuple[str, int, str]:
    pattern = re.compile(
        r"(?:(?:sl|s[oố]\s*l[uư][oợ]ng|x|\*)\s*[:.]?\s*)(\d{1,4})\s*"
        r"(vi[eê]n|v|h[oộ]p|h|v[iỉ]|g[oó]i|chai|l[oọ]|tu[yý]p|[oố]ng|mi[eế]ng|c[aá]i|lo|cai|vien|hop)?\b",
        re.IGNORECASE,
    )
    matches = list(pattern.finditer(text))
    if not matches:
        return text, 1, ""
    last = matches[-1]
    qty = max(1, min(999, int(last.group(1))))
    unit = _normalize_unit(last.group(2) or "")
    stripped = (text[: last.start()] + " " + text[last.end() :]).strip(" ,;-:")
    return stripped, qty, unit


def _is_non_drug_header(line_text: str) -> bool:
    low = _ascii_lower(line_text)
    if len(low) <= 2:
        return True
    for pat in NON_DRUG_HEADER_PATTERNS:
        if re.search(pat, low, re.IGNORECASE):
            return True
    return False


def _preprocess_fast(image_bytes: bytes) -> tuple[np.ndarray, list[str], tuple[int, int]]:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_IMAGE", "message": "File tải lên không phải ảnh hợp lệ (PNG/JPG/WEBP)."},
        )

    h, w = img.shape[:2]
    if h < 20 or w < 20:
        raise HTTPException(
            status_code=400,
            detail={"code": "IMAGE_TOO_SMALL", "message": "Kích thước ảnh quá nhỏ để nhận dạng chữ."},
        )

    steps = []
    max_dim = max(h, w)
    # Tối ưu kích thước cạnh dài về [1000..1360] để RapidOCR chạy nhanh gấp 2-3 lần vẫn giữ nét chữ hàm lượng nhỏ
    if max_dim < 960:
        scale = min(2.2, 1120.0 / float(max_dim))
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        steps.append(f"upscale({scale:.2f}x)")
    elif max_dim > 1360:
        scale = 1360.0 / float(max_dim)
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        steps.append(f"downscale({scale:.2f}x)")

    steps.append(f"single_pass({img.shape[1]}x{img.shape[0]})")
    return img, steps, (img.shape[1], img.shape[0])


def _make_clahe_bgr(resized_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(resized_bgr, cv2.COLOR_BGR2GRAY)
    denoised = cv2.bilateralFilter(gray, 5, 35, 35)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    return cv2.cvtColor(clahe.apply(denoised), cv2.COLOR_GRAY2BGR)


def _build_deskewed_boxes(raw_results: list[Any], img_w: int) -> list[dict[str, Any]]:
    """
    Tính độ nghiêng tờ đơn từ góc box RapidOCR và hiệu chỉnh tọa độ y_flat
    để ảnh chụp hơi nghiêng cũng không làm lệch cột ĐVT/SL sang hàng khác.
    """
    slopes = []
    temp_boxes = []
    for entry in raw_results or []:
        if not entry or len(entry) < 3:
            continue
        box, text, score = entry[0], str(entry[1]).strip(), float(entry[2])
        if not text:
            continue
        xs = [float(pt[0]) for pt in box]
        ys = [float(pt[1]) for pt in box]
        x_left, x_right = min(xs), max(xs)
        y_top, y_bottom = min(ys), max(ys)
        width = max(1.0, x_right - x_left)
        # Chiều cao thực tế dọc theo cạnh chữ (tránh bị phình khi dòng dài nằm nghiêng góc nhỏ)
        edge_h = float(np.hypot(float(box[3][0]) - float(box[0][0]), float(box[3][1]) - float(box[0][1])))
        height = max(8.0, min(y_bottom - y_top, edge_h * 1.15) if edge_h >= 6.0 else (y_bottom - y_top))
        if width >= max(45.0, height * 2.5):
            dx = float(box[1][0]) - float(box[0][0])
            dy = float(box[1][1]) - float(box[0][1])
            if abs(dx) > 20.0:
                sl = dy / dx
                if abs(sl) <= 0.25:
                    slopes.append(sl)
        temp_boxes.append({
            "box": box,
            "text": _normalize_ocr_typos(text),
            "score": score,
            "x_left": x_left,
            "x_right": x_right,
            "x_mid": (x_left + x_right) / 2.0,
            "y_top": y_top,
            "y_bottom": y_bottom,
            "y_mid": (y_top + y_bottom) / 2.0,
            "height": height,
        })

    median_slope = float(np.median(slopes)) if slopes else 0.0
    anchor_x = img_w * 0.5
    for b in temp_boxes:
        offset = median_slope * (b["x_mid"] - anchor_x)
        b["y_flat"] = b["y_mid"] - offset
        b["y_flat_top"] = b["y_top"] - offset
        b["y_flat_bottom"] = b["y_bottom"] - offset
    return temp_boxes


def _cluster_boxes_to_lines(boxes: list[dict[str, Any]], use_y_flat: bool = True) -> list[dict[str, Any]]:
    if not boxes:
        return []
    key_y = "y_flat" if use_y_flat else "y_mid"
    ordered = sorted(boxes, key=lambda b: (b[key_y], b["x_left"]))
    rows: list[list[dict[str, Any]]] = []
    for item in ordered:
        placed = False
        for row in rows:
            avg_y = sum(r[key_y] for r in row) / len(row)
            avg_h = sum(r["height"] for r in row) / len(row)
            # Nếu hai box chồng lấn theo trục X thì chúng nằm ở 2 dòng xếp chồng dọc chứ không cùng 1 dòng ngang
            x_overlaps = any(
                min(item["x_right"], r["x_right"]) - max(item["x_left"], r["x_left"]) > 18.0
                for r in row
            )
            tol = min(13.0, avg_h * 0.45) if x_overlaps else max(12.0, avg_h * 0.58)
            if abs(item[key_y] - avg_y) <= tol:
                row.append(item)
                placed = True
                break
        if not placed:
            rows.append([item])

    merged = []
    for row in rows:
        row.sort(key=lambda r: r["x_left"])
        merged.append({
            "text": _normalize_ocr_typos(" ".join(r["text"] for r in row)),
            "ascii": _ascii_lower(" ".join(r["text"] for r in row)),
            "confidence": round(max(0.0, min(1.0, sum(r["score"] for r in row) / len(row))), 4),
            "y_flat": sum(r[key_y] for r in row) / len(row),
            "y_flat_top": min(r["y_flat_top"] for r in row),
            "y_flat_bottom": max(r["y_flat_bottom"] for r in row),
            "x_left": min(r["x_left"] for r in row),
            "boxes": row,
        })
    return merged


def _is_footer_box(b: dict[str, Any], img_w: int) -> bool:
    txt = _ascii_lower(b["text"])
    if re.search(r"ngay\s*\d{1,2}\s*thang\s*\d{1,2}\s*nam", txt):
        return True
    if b["x_left"] >= img_w * 0.42 and any(k in txt for k in ("bac si", "bac sy", "y si", "y sy", "kham benh", "ky ten")):
        return True
    return False


def _slice_treatment_section(
    boxes: list[dict[str, Any]],
    img_w: int,
) -> tuple[list[dict[str, Any]], str, float, float]:
    """
    Cắt riêng phần bảng/danh sách 'Thuốc điều trị' ra khỏi phần hành chính (Sở Y tế, CCCD, BHYT, Chẩn đoán)
    và phần lời dặn/hẹn tái khám bên dưới.
    """
    lines = _cluster_boxes_to_lines(boxes, use_y_flat=True)

    anchor_idx: int | None = None
    for idx, line in enumerate(lines):
        low = line["ascii"]
        has_header_cols = ("ten thuoc" in low) and any(k in low for k in ("dvt", "sl", "ham luong", "nong do", "stt"))
        if "thuoc dieu tri" in low or "thuoc dieu trj" in low or "chi dinh dung thuoc" in low or has_header_cols:
            anchor_idx = idx
            break

    if anchor_idx is None:
        return boxes, "FULL_FALLBACK", img_w * 0.12, img_w * 0.74

    # Xác định đáy phần tiêu đề bảng ("Thuốc điều trị" + "STT | Tên thuốc | ĐVT | SL")
    header_end_idx = anchor_idx
    if anchor_idx + 1 < len(lines):
        next_low = lines[anchor_idx + 1]["ascii"]
        if any(k in next_low for k in ("ten thuoc", "ham luong", "nong do", "dvt", "stt", "sl")):
            header_end_idx = anchor_idx + 1

    col_stt_xmax = img_w * 0.12
    col_right_xmin = img_w * 0.74
    header_boxes = []
    for i in range(anchor_idx, min(len(lines), header_end_idx + 2)):
        for b in lines[i]["boxes"]:
            t = _ascii_lower(b["text"])
            if t in ("stt", "tt"):
                col_stt_xmax = max(col_stt_xmax, b["x_right"] + 16.0)
                header_boxes.append(b)
            elif any(k in t for k in ("dvt", "don vi")):
                col_right_xmin = min(col_right_xmin, b["x_left"] - 14.0)
                header_boxes.append(b)
            elif t in ("sl", "so luong"):
                col_right_xmin = min(col_right_xmin, b["x_left"] - 40.0)
                header_boxes.append(b)
            elif "ten thuoc" in t or "thuoc dieu tr" in t:
                header_boxes.append(b)

    y_start = lines[header_end_idx]["y_flat_bottom"] - 2.0
    # Trường hợp chữ "STT" nằm lệch nhẹ xuống hàng dưới tiêu đề -> bỏ box STT nhưng không đẩy y_start vượt qua thuốc 1
    if header_end_idx > anchor_idx:
        non_stt_bottoms = [
            b["y_flat_bottom"]
            for b in lines[header_end_idx]["boxes"]
            if _ascii_lower(b["text"]) not in ("stt", "tt")
        ]
        if non_stt_bottoms:
            y_start = max(non_stt_bottoms) - 2.0

    y_end = float("inf")
    for idx in range(header_end_idx + 1, len(lines)):
        low = lines[idx]["ascii"]
        is_left_footer = lines[idx]["x_left"] < img_w * 0.55 and any(
            k in low
            for k in (
                "loi dan",
                "cong khoan",
                "ngay hen kham",
                "kham benh lai",
                "so dien thoai lien he",
                "ho va ten nguoi dua",
                "nguoi dua tre",
                "bac si kham",
                "bac sy",
            )
        )
        if is_left_footer:
            y_end = lines[idx]["y_flat_top"] - 2.0
            break

    header_box_ids = {id(b) for b in header_boxes}
    sliced = [
        b
        for b in boxes
        if id(b) not in header_box_ids
        and b["y_flat"] > y_start
        and b["y_flat"] < y_end
        and not _is_footer_box(b, img_w)
        and _ascii_lower(b["text"]) not in ("stt", "dvt", "sl")
    ]
    return sliced, "TREATMENT_TABLE", col_stt_xmax, col_right_xmin


def _parse_right_qty_unit(right_boxes: list[dict[str, Any]]) -> tuple[int, str]:
    qty = 1
    unit = ""
    sorted_r = sorted(right_boxes, key=lambda b: b["x_left"])
    for b in sorted_r:
        tok = b["text"].strip()
        tok_low = _ascii_lower(tok)
        if tok_low in KNOWN_UNIT_WORDS:
            unit = _normalize_unit(tok)
        elif re.fullmatch(r"\d{1,4}", tok):
            qty = max(1, min(999, int(tok)))
        else:
            _, q_found, u_found = _extract_quantity_and_unit(tok)
            if u_found:
                unit = u_found
            if q_found > 1 or re.search(r"\b0\d\b", tok):
                qty = q_found
    return qty, unit


def _reconstruct_table_drug_rows(
    section_boxes: list[dict[str, Any]],
    col_stt_xmax: float,
    col_right_xmin: float,
) -> list[dict[str, Any]]:
    if not section_boxes:
        return []

    right_boxes = [b for b in section_boxes if b["x_left"] >= col_right_xmin]
    raw_main_boxes = [b for b in section_boxes if b["x_left"] < col_right_xmin]

    # Tách riêng các box STT đứng lẻ ở mép trái (thường căn giữa theo chiều dọc nên rơi xuống giữa hàng 1)
    main_boxes = []
    stt_markers: list[tuple[int, float]] = []
    for b in raw_main_boxes:
        txt = b["text"].strip()
        if b["x_right"] <= col_stt_xmax + 15.0 and re.fullmatch(r"\d{1,2}[.)]?", txt):
            num = int(re.sub(r"\D", "", txt))
            stt_markers.append((num, b["y_flat"]))
        else:
            main_boxes.append(b)

    main_lines = _cluster_boxes_to_lines(main_boxes, use_y_flat=True)
    if not main_lines:
        return []

    # Gom nhóm các dòng thành từng thuốc điều trị theo trạng thái (Row state machine):
    # - Dòng đầu tiên (không phải dosage) bắt đầu Thuốc 1
    # - Dòng dosage (Tiêm/Uống/Ngày/Bôi/Bơm...) luôn gắn vào thuốc hiện tại
    # - Thuốc mới bắt đầu khi gặp số thứ tự đầu dòng (2., 2 (...) ) HOẶC ngay sau dòng dosage của thuốc trước
    #   HOẶC khi vượt qua tọa độ y của STT kế tiếp
    groups: list[list[dict[str, Any]]] = []
    seen_dosage_in_current = False

    for line in main_lines:
        txt = line["text"].strip()
        if re.fullmatch(r"\d{1,2}[.)]?", txt):
            continue

        is_dosage = bool(DOSAGE_START_RE.match(txt))
        has_leading_idx = bool(re.match(r"^\s*\d{1,2}\s*(?:[.)/\-:]|\s+(?=[A-Za-zÀ-ỹ(]))", txt))
        crossed_next_stt = (
            len(groups) < len(stt_markers)
            and line["y_flat"] >= stt_markers[len(groups)][1] - 10.0
            and not is_dosage
            and seen_dosage_in_current
        )

        if not groups or (not is_dosage and (has_leading_idx or seen_dosage_in_current or crossed_next_stt)):
            groups.append([line])
            seen_dosage_in_current = is_dosage
        else:
            groups[-1].append(line)
            if is_dosage:
                seen_dosage_in_current = True

    parsed_items: list[dict[str, Any]] = []
    for g_idx, row_lines in enumerate(groups):
        y_row_top = row_lines[0]["y_flat_top"] - 14.0
        y_row_bottom = (
            groups[g_idx + 1][0]["y_flat_top"] - 6.0
            if g_idx + 1 < len(groups)
            else row_lines[-1]["y_flat_bottom"] + 28.0
        )
        matched_right = [rb for rb in right_boxes if y_row_top <= rb["y_flat"] < y_row_bottom]
        qty_col, unit_col = _parse_right_qty_unit(matched_right)

        name_parts: list[str] = []
        dosage_parts: list[str] = []
        raw_parts: list[str] = []
        confs: list[float] = []

        for l in row_lines:
            txt = l["text"].strip()
            cleaned_line = re.sub(r"^\s*\d{1,2}\s*(?:[.)/\-:]|\s+(?=[A-Za-zÀ-ỹ(]))\s*", "", txt).strip()
            if not cleaned_line:
                continue
            raw_parts.append(txt)
            confs.append(l["confidence"])
            if DOSAGE_START_RE.match(cleaned_line):
                dosage_parts.append(cleaned_line)
            else:
                if name_parts and cleaned_line in name_parts[0]:
                    continue
                # Bỏ cặp ngoặc bọc ngoài nếu toàn bộ tên nằm trong ngoặc (vd "(Bơm tiêm Insulin 1ml)")
                if cleaned_line.startswith("(") and cleaned_line.endswith(")") and cleaned_line.count("(") == 1:
                    cleaned_line = cleaned_line[1:-1].strip()
                name_parts.append(cleaned_line)

        drug_title = " ".join(name_parts).strip() or " ".join(dosage_parts).strip()
        drug_title = re.sub(r"\s+", " ", drug_title).strip(" ,;-:")
        dosage_str = " ".join(dosage_parts).strip()
        if not dosage_str:
            drug_title, dosage_str = _extract_dosage_and_strip(drug_title)

        if qty_col == 1 and not unit_col:
            drug_title, qty_col, unit_col = _extract_quantity_and_unit(drug_title)

        strengths = [m.group(1).replace(" ", "") for m in STRENGTH_RE.finditer(drug_title)]
        avg_conf = sum(confs) / len(confs) if confs else 0.9

        parsed_items.append({
            "lineId": f"line-{len(parsed_items) + 1}",
            "lineNumber": len(parsed_items) + 1,
            "rawText": " | ".join(raw_parts + ([f"{qty_col} {unit_col}".strip()] if (unit_col or qty_col > 1) else [])),
            "extractedDrugQuery": drug_title,
            "strengthTokens": strengths,
            "extractedQuantity": qty_col,
            "extractedUnit": unit_col,
            "extractedDosage": dosage_str,
            "ocrConfidence": round(avg_conf, 4),
        })

    return parsed_items


def run_real_ocr(image_bytes: bytes, ocr_engine: Any) -> dict[str, Any]:
    """
    Chạy pipeline OCR tối ưu tốc độ:
    - Single-pass RapidOCR trên ảnh thu gọn thông minh (chỉ chạy pass 2 CLAHE nếu ảnh quá mờ)
    - Tự hiệu chỉnh độ nghiêng từ đa giác box RapidOCR
    - Tự động cắt đúng vùng 'Thuốc điều trị' & tách chuẩn bảng cột (STT | Tên thuốc | ĐVT | SL)
    """
    t0 = time.perf_counter()
    resized_bgr, steps, (proc_w, proc_h) = _preprocess_fast(image_bytes)

    res_orig, _ = ocr_engine(resized_bgr)
    chosen_raw = res_orig or []
    used_variant = "single_pass_bgr"

    avg_pass1_conf = (
        sum(float(r[2]) for r in chosen_raw) / len(chosen_raw)
        if chosen_raw
        else 0.0
    )
    if len(chosen_raw) < 4 or avg_pass1_conf < 0.72:
        clahe_bgr = _make_clahe_bgr(resized_bgr)
        res_clahe, _ = ocr_engine(clahe_bgr)
        steps.append("fallback_clahe")
        if res_clahe and (len(res_clahe) > len(chosen_raw) or avg_pass1_conf < 0.65):
            chosen_raw = res_clahe
            used_variant = "clahe_fallback"

    boxes = _build_deskewed_boxes(chosen_raw, proc_w)
    if not boxes:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "OCR_NO_TEXT_EXTRACTED",
                "message": "Không đọc được dòng chữ nào từ ảnh đơn thuốc (ảnh trắng, quá mờ hoặc thiếu ánh sáng).",
            },
        )

    section_boxes, section_mode, col_stt_xmax, col_right_xmin = _slice_treatment_section(boxes, proc_w)

    if section_mode == "TREATMENT_TABLE" and section_boxes:
        steps.append("anchor_slice:thuoc_dieu_tri")
        parsed_lines = _reconstruct_table_drug_rows(section_boxes, col_stt_xmax, col_right_xmin)
        raw_section_lines = _cluster_boxes_to_lines(section_boxes, use_y_flat=True)
        raw_ocr_text = "\n".join(line["text"] for line in raw_section_lines)
        avg_ocr_confidence = round(
            sum(l["ocrConfidence"] for l in parsed_lines) / len(parsed_lines), 4
        ) if parsed_lines else round(avg_pass1_conf, 4)
    else:
        clustered = _cluster_boxes_to_lines(boxes, use_y_flat=True)
        raw_ocr_text = "\n".join(line["text"] for line in clustered)
        avg_ocr_confidence = round(
            sum(line["confidence"] for line in clustered) / len(clustered),
            4,
        )
        candidate_lines = [line for line in clustered if not _is_non_drug_header(line["text"])]
        if not candidate_lines:
            candidate_lines = clustered

        parsed_lines = []
        for idx, line in enumerate(candidate_lines, start=1):
            raw_text = line["text"]
            body = re.sub(r"^\s*(?:\d{1,2}\s*[.)/\-:]|[-*•+])\s*", "", raw_text).strip() or raw_text
            no_dosage, extracted_dosage = _extract_dosage_and_strip(body)
            cleaned_drug, qty, unit = _extract_quantity_and_unit(no_dosage)
            strengths = [m.group(1).replace(" ", "") for m in STRENGTH_RE.finditer(cleaned_drug or body)]
            drug_query = re.sub(r"^\d+\s*[.)/\-:]\s*", "", (cleaned_drug if len(cleaned_drug) >= 2 else no_dosage)).strip(" ,;-:")
            parsed_lines.append({
                "lineId": f"line-{idx}",
                "lineNumber": idx,
                "rawText": raw_text,
                "extractedDrugQuery": drug_query or raw_text,
                "strengthTokens": strengths,
                "extractedQuantity": qty,
                "extractedUnit": unit,
                "extractedDosage": extracted_dosage,
                "ocrConfidence": line["confidence"],
            })

    if not parsed_lines:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "OCR_NO_TEXT_EXTRACTED",
                "message": "Không tách được dòng thuốc điều trị nào từ ảnh đơn thuốc.",
            },
        )

    return {
        "engine": f"RapidOCR ONNX + OpenCV ({used_variant})",
        "sectionMode": section_mode,
        "opencv_preprocessing": steps + [f"selected:{used_variant}", f"size:{proc_w}x{proc_h}"],
        "raw_ocr_text": raw_ocr_text,
        "average_confidence": avg_ocr_confidence,
        "elapsed_sec": round(time.perf_counter() - t0, 3),
        "lines": parsed_lines,
    }
