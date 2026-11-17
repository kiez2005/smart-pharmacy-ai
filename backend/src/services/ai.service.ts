import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Response as ExpressResponse } from 'express';
import Fuse from 'fuse.js';
import { prisma } from '../config/prisma';
import {
  CLINICAL_ADVISORY_DISCLAIMER,
  CLINICAL_RULE_VERSION,
  evaluateClinicalSafetyServerSide,
} from './clinical-safety.service';
import {
  fetchSanitizedPublicProductsByIds,
  PublicCatalogProductDto,
} from '../utils/public-catalog.dto';

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export function getPythonAiBaseUrl(): string {
  return AI_SERVICE_URL;
}

export class AiServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly model?: string;

  constructor(statusCode: number, code: string, message: string, model?: string) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.model = model;
  }
}

export const SLIM_AI_PRODUCT_SELECT = {
  ProductID: true,
  ProductName: true,
  ProductType: true,
  Unit: true,
  Price: true,
  Quantity: true,
  Description: true,
} as const;

export type SlimAiProduct = {
  ProductID: number;
  ProductName: string;
  ProductType: string;
  Unit: string;
  Price: number;
  Quantity: number;
  Description: string;
  IsRx?: boolean;
};

export interface OcrProductCandidate {
  ProductID: number;
  ProductName: string;
  ProductType: string;
  Unit: string;
  Price: number;
  Quantity: number;
  IsRx: boolean;
  inStock: boolean;
  status: 'IN_STOCK' | 'OUT_OF_STOCK';
  matchScore: number;
  combinedConfidence: number;
}

export interface OcrExtractedLine {
  lineId: string;
  lineNumber: number;
  rawText: string;
  extractedDrugQuery: string;
  strengthTokens: string[];
  extractedQuantity: number;
  extractedUnit: string;
  extractedDosage: string;
  ocrConfidence: number;
  candidates: OcrProductCandidate[];
  suggestedProductId: number | null;
  selectedProductId: number | null;
  confirmed: boolean;
  skipped: boolean;
}

export interface OcrPrescriptionResult {
  draftId: string;
  engine: string;
  sectionMode?: string;
  elapsedSec?: number;
  requiresPharmacistVerification: true;
  allLinesConfirmed: boolean;
  averageConfidence: number;
  opencvPreprocessing: {
    steps: string[];
  };
  rawOcrText: string;
  lines: OcrExtractedLine[];
}

export interface RagCitation {
  docId: number;
  productId: number | null;
  docType: string;
  title: string;
  section: string;
  sourceName: string;
  sourceRef: string | null;
  verifiedBy: string | null;
  snippet: string;
}

export interface RagSuggestedProduct {
  ProductID: number;
  ProductName: string;
  ProductType: string;
  Unit: string;
  Price: number;
  TotalStock: number;
  IsRx: boolean;
  requiresPrescription: boolean;
}

export interface PatientTriageContext {
  ageGroup?: 'ADULT' | 'CHILD' | 'ELDERLY';
  pregnantOrBreastfeeding?: boolean;
  allergies?: string;
  chronicConditions?: string;
}

export interface AttachmentOcrSummary {
  sectionMode: string;
  lines: Array<{
    drug: string;
    strengthTokens: string[];
    quantity: number;
    unit: string;
    dosage: string;
    confidence: number;
  }>;
}

export interface RagChatResult {
  engine: string;
  modelUsed: string;
  provider?: string;
  fallbackUsed?: boolean;
  mode: 'DRUG_QA' | 'SYMPTOM_CONSULTATION';
  groundingMode?: 'FAST_PATH' | 'LOCAL_HDSD' | 'GENERAL_MEDICAL' | 'INSUFFICIENT';
  triageLevel?: 'RED_FLAG' | 'CAUTION' | 'SELF_CARE';
  suspectedCondition: string;
  answer: string;
  citations: RagCitation[];
  suggestedProducts: RagSuggestedProduct[];
  warnings: string[];
  shouldConsultPharmacist: boolean;
  insufficientKnowledge: boolean;
  emergencyAlert: boolean;
  isAdvisoryOnly: true;
  disclaimer: string;
  ruleVersion: string;
}

export interface StorefrontRagChatResult extends Omit<RagChatResult, 'suggestedProducts'> {
  suggestedProducts: PublicCatalogProductDto[];
}

export interface SpeechToTextResult {
  modelUsed: string;
  language: string;
  languageProbability: number;
  audioDurationSec: number;
  processingTimeSec: number;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
}

export interface AiComponentHealth {
  name: string;
  provider: string;
  model: string;
  status: 'READY' | 'DOWN' | 'LOADING';
  device: string;
  loadTimeSec?: number;
  loadedAt?: string | null;
  loadedInMemory?: boolean;
  error?: string | null;
}

export interface AiModelsHealthReport {
  status: 'OK' | 'DEGRADED' | 'DOWN';
  pythonReachable: boolean;
  engine: string;
  bootedAt?: string | null;
  startupLoadCount?: number;
  singleLlmSharedPolicy: boolean;
  activeLlmModel: string;
  indexStats: {
    products: number;
    knowledgeDocuments: number;
  };
  deadModels: string[];
  models: {
    llm: AiComponentHealth;
    ocr: AiComponentHealth;
    stt: AiComponentHealth;
    embeddings: AiComponentHealth;
  };
}

function normalizeViText(text: string): string {
  return String(text || '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export async function loadSlimSearchCandidates(
  query: string,
  options: { inStockOnly?: boolean; limit?: number } = {}
): Promise<SlimAiProduct[]> {
  const limit = Math.min(250, Math.max(10, Number(options.limit || 150)));
  const clean = query.trim();
  const tokens = Array.from(
    new Set(
      clean
        .split(/[\s,;:/().\-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  ).slice(0, 6);

  const baseWhere: Record<string, unknown> = {
    OR: [{ packaging: { is: null } }, { packaging: { is: { IsTestOnly: false } } }],
  };
  if (options.inStockOnly) {
    baseWhere.Quantity = { gt: 0 };
  }

  const textFilters =
    tokens.length > 0
      ? tokens.flatMap((token) => [
          { ProductName: { contains: token } },
          { Description: { contains: token } },
          { ProductType: { contains: token } },
          ...(token.length >= 4 ? [{ ProductName: { contains: token.slice(0, 3) } }] : []),
        ])
      : [];

  const selectFields = {
    ...SLIM_AI_PRODUCT_SELECT,
    packaging: { select: { IsRx: true } },
  };

  let matched = textFilters.length
    ? await prisma.product.findMany({
        where: { AND: [baseWhere, { OR: textFilters }] },
        select: selectFields,
        take: limit,
        orderBy: { ProductID: 'asc' },
      })
    : [];

  if (matched.length < Math.min(40, limit)) {
    const excludeIds = matched.map((m) => m.ProductID);
    const supplement = await prisma.product.findMany({
      where: {
        AND: [baseWhere, ...(excludeIds.length > 0 ? [{ ProductID: { notIn: excludeIds } }] : [])],
      },
      select: selectFields,
      take: limit - matched.length,
      orderBy: { ProductID: 'asc' },
    });
    matched = [...matched, ...supplement];
  }

  return matched.map((row) => ({
    ProductID: row.ProductID,
    ProductName: row.ProductName,
    ProductType: row.ProductType,
    Unit: row.Unit,
    Price: row.Price,
    Quantity: row.Quantity,
    Description: row.Description,
    IsRx: Boolean(row.packaging?.IsRx),
  }));
}

function parsePyErrorDetail(errJson: unknown, fallbackStatus: number, fallbackModel: string, defaultMessage: string): AiServiceError {
  const detail = (errJson as { detail?: unknown })?.detail;
  if (detail && typeof detail === 'object') {
    const obj = detail as { code?: string; model?: string; message?: string };
    return new AiServiceError(
      fallbackStatus,
      obj.code || 'AI_SERVICE_ERROR',
      obj.message || defaultMessage,
      obj.model || fallbackModel
    );
  }
  if (typeof detail === 'string') {
    return new AiServiceError(fallbackStatus, 'AI_SERVICE_ERROR', detail, fallbackModel);
  }
  return new AiServiceError(fallbackStatus, 'AI_SERVICE_ERROR', defaultMessage, fallbackModel);
}

function scoreProductCandidate(
  line: {
    extractedDrugQuery: string;
    strengthTokens: string[];
    ocrConfidence: number;
  },
  product: SlimAiProduct,
  fuseSimilarity: number,
  hybridRrfScore: number
): OcrProductCandidate {
  const normProductName = normalizeViText(product.ProductName);
  const normQuery = normalizeViText(line.extractedDrugQuery);
  const queryWords = normQuery.split(/\s+/).filter((w) => w.length >= 3);

  let tokenHits = 0;
  for (const w of queryWords) {
    if (normProductName.includes(w)) {
      tokenHits += 1;
    }
  }
  const tokenCoverage = queryWords.length > 0 ? tokenHits / queryWords.length : 0;

  // Điểm thưởng/phạt theo hàm lượng (VD: 500mg vs 250mg, 625mg)
  let strengthAdjust = 0;
  for (const st of line.strengthTokens) {
    const cleanSt = st.toLowerCase().replace(/\s+/g, '');
    if (normProductName.replace(/\s+/g, '').includes(cleanSt)) {
      strengthAdjust += 0.2;
    } else if (/\d+(?:mg|g|ml|mcg)/.test(normProductName)) {
      strengthAdjust -= 0.08;
    }
  }

  const hybridBoost = hybridRrfScore > 0 ? Math.min(0.25, hybridRrfScore * 7.5) : 0;
  const rawMatchScore = Math.max(
    0,
    Math.min(1, fuseSimilarity * 0.45 + tokenCoverage * 0.35 + hybridBoost + strengthAdjust)
  );
  const matchScore = Number(rawMatchScore.toFixed(4));
  const combinedConfidence = Number((0.45 * line.ocrConfidence + 0.55 * matchScore).toFixed(4));

  return {
    ProductID: product.ProductID,
    ProductName: product.ProductName,
    ProductType: product.ProductType,
    Unit: product.Unit,
    Price: product.Price,
    Quantity: product.Quantity,
    IsRx: Boolean(product.IsRx),
    inStock: product.Quantity > 0,
    status: product.Quantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
    matchScore,
    combinedConfidence,
  };
}

class AiGatewayService {
  /**
   * 0. Health check thật từ Python AI Service — báo từng model đang READY / DOWN và lý do lỗi.
   */
  public async getModelsHealth(): Promise<AiModelsHealthReport> {
    try {
      const resp = await fetch(`${AI_SERVICE_URL}/api/py-ai/health`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) {
        throw new Error(`Python AI /health HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as Omit<AiModelsHealthReport, 'pythonReachable'>;
      return {
        ...data,
        pythonReachable: true,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Không kết nối được Python AI Service';
      const downModel = (name: string, provider: string, model: string): AiComponentHealth => ({
        name,
        provider,
        model,
        status: 'DOWN',
        device: 'unavailable',
        loadedInMemory: false,
        error: `Python AI Service (${AI_SERVICE_URL}) không phản hồi: ${errMsg}`,
      });
      return {
        status: 'DOWN',
        pythonReachable: false,
        engine: 'Python AI Service Offline',
        singleLlmSharedPolicy: true,
        activeLlmModel: 'qwen2.5:7b',
        indexStats: { products: 0, knowledgeDocuments: 0 },
        deadModels: [`python-ai-service (${AI_SERVICE_URL}): ${errMsg}`],
        models: {
          llm: downModel('llm', 'ollama', 'qwen2.5:7b'),
          ocr: downModel('ocr', 'rapidocr-onnxruntime', 'PP-OCRv4 (ONNX)'),
          stt: downModel('stt', 'faster-whisper', 'faster-whisper-medium'),
          embeddings: downModel('embeddings', 'fastembed-onnx', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'),
        },
      };
    }
  }

  /**
   * 1. OCR đơn thuốc thật bằng Python OpenCV + RapidOCR -> trả Top-K ứng viên + độ tin cậy
   *    Lưu OcrDraft trạng thái PENDING_REVIEW; mọi dòng mặc định confirmed = false.
   */
  private async callPythonOcrRaw(fileBuffer: Buffer, originalName: string) {
    if (!fileBuffer || fileBuffer.length < 100) {
      throw new AiServiceError(
        400,
        'INVALID_IMAGE',
        'Tệp hình ảnh rỗng hoặc bị hỏng, không thể đọc đơn thuốc.'
      );
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'image/png' });
    formData.append('file', blob, originalName || 'prescription.png');

    let response: Response;
    try {
      response = await fetch(`${AI_SERVICE_URL}/api/py-ai/ocr`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(25000),
      });
    } catch (err) {
      throw new AiServiceError(
        503,
        'AI_OCR_SERVICE_DOWN',
        `Dịch vụ AI OCR Python (${AI_SERVICE_URL}) hiện đang tắt hoặc không phản hồi: ${err instanceof Error ? err.message : 'Timeout'}`,
        'PP-OCRv4 (RapidOCR)'
      );
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      throw parsePyErrorDetail(
        errJson,
        response.status,
        'PP-OCRv4 (RapidOCR)',
        `Lỗi OCR từ Python AI (HTTP ${response.status})`
      );
    }

    return (await response.json()) as {
      engine: string;
      sectionMode?: string;
      elapsed_sec?: number;
      opencv_preprocessing: string[];
      raw_ocr_text: string;
      average_confidence: number;
      lines: Array<{
        lineId: string;
        lineNumber: number;
        rawText: string;
        extractedDrugQuery: string;
        strengthTokens: string[];
        extractedQuantity: number;
        extractedUnit: string;
        extractedDosage: string;
        ocrConfidence: number;
      }>;
    };
  }

  public async scanAttachmentOcrSummary(filePath: string): Promise<AttachmentOcrSummary | null> {
    try {
      if (!fs.existsSync(filePath)) return null;
      const buf = fs.readFileSync(filePath);
      const pyData = await this.callPythonOcrRaw(buf, path.basename(filePath));
      if (!pyData.lines || pyData.lines.length === 0) return null;
      return {
        sectionMode: pyData.sectionMode || 'FULL_FALLBACK',
        lines: pyData.lines.slice(0, 10).map((l) => ({
          drug: l.extractedDrugQuery || l.rawText,
          strengthTokens: l.strengthTokens || [],
          quantity: Number(l.extractedQuantity || 1),
          unit: l.extractedUnit || '',
          dosage: l.extractedDosage || '',
          confidence: Number(l.ocrConfidence || 0),
        })),
      };
    } catch {
      // Nếu ảnh không phải đơn thuốc (ví dụ ảnh vết phát ban/triệu chứng) hoặc OCR trả 422 -> bỏ qua an toàn
      return null;
    }
  }

  public async processPrescriptionOcr(
    fileBuffer: Buffer,
    originalName: string,
    createdByUserId?: number
  ): Promise<OcrPrescriptionResult> {
    const pyData = await this.callPythonOcrRaw(fileBuffer, originalName);

    const allCatalogProducts = await loadSlimSearchCandidates('', { limit: 250 });
    const fuse = new Fuse(allCatalogProducts, {
      keys: [
        { name: 'ProductName', weight: 0.7 },
        { name: 'Description', weight: 0.2 },
        { name: 'ProductType', weight: 0.1 },
      ],
      threshold: 0.55,
      ignoreLocation: true,
      includeScore: true,
    });
    const productById = new Map(allCatalogProducts.map((p) => [p.ProductID, p]));

    const lines: OcrExtractedLine[] = await Promise.all(
      (pyData.lines || []).map(async (line) => {
        const fuseHits = fuse.search(line.extractedDrugQuery || line.rawText).slice(0, 12);
        const hybridMap = new Map<number, number>();

        try {
          const hybResp = await fetch(`${AI_SERVICE_URL}/api/py-ai/search-hybrid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: line.extractedDrugQuery || line.rawText,
              limit: 8,
              onlyStorefrontPublished: false,
              includeTest: false,
            }),
            signal: AbortSignal.timeout(2500),
          });
          if (hybResp.ok) {
            const hybJson = (await hybResp.json()) as { results?: Array<{ ProductID: number; rrfScore: number }> };
            for (const r of hybJson.results || []) {
              hybridMap.set(Number(r.ProductID), Number(r.rrfScore || 0));
            }
          }
        } catch {
          // Best-effort semantic boost; Fuse + token coverage vẫn chấm điểm ứng viên chính xác
        }

        const candidatePoolIds = new Set<number>();
        const fuseSimMap = new Map<number, number>();
        for (const h of fuseHits) {
          candidatePoolIds.add(h.item.ProductID);
          fuseSimMap.set(h.item.ProductID, Math.max(0, 1 - Number(h.score ?? 1)));
        }
        for (const pid of hybridMap.keys()) {
          if (productById.has(pid)) {
            candidatePoolIds.add(pid);
          }
        }

        const candidates = Array.from(candidatePoolIds)
          .map((pid) => productById.get(pid))
          .filter((p): p is SlimAiProduct => Boolean(p))
          .map((p) =>
            scoreProductCandidate(
              line,
              p,
              fuseSimMap.get(p.ProductID) ?? 0.25,
              hybridMap.get(p.ProductID) ?? 0
            )
          )
          .filter((c) => c.matchScore >= 0.22)
          .sort((a, b) => b.combinedConfidence - a.combinedConfidence)
          .slice(0, 5);

        return {
          lineId: line.lineId,
          lineNumber: line.lineNumber,
          rawText: line.rawText,
          extractedDrugQuery: line.extractedDrugQuery,
          strengthTokens: line.strengthTokens || [],
          extractedQuantity: Math.max(1, Number(line.extractedQuantity || 1)),
          extractedUnit: line.extractedUnit || '',
          extractedDosage: line.extractedDosage || '',
          ocrConfidence: line.ocrConfidence,
          candidates,
          suggestedProductId: candidates[0]?.ProductID ?? null,
          // BẮT BUỘC: Luôn khởi tạo chưa chọn/chưa xác nhận để Dược sĩ kiểm duyệt từng dòng
          selectedProductId: null,
          confirmed: false,
          skipped: false,
        };
      })
    );

    const draftId = randomUUID();
    await prisma.ocrDraft.create({
      data: {
        DraftID: draftId,
        CreatedByUserID: createdByUserId ?? null,
        OriginalFilename: originalName || 'prescription.png',
        RawOcrText: pyData.raw_ocr_text || '',
        LinesJson: JSON.stringify(lines),
        Status: 'PENDING_REVIEW',
      },
    });

    return {
      draftId,
      engine: pyData.engine,
      sectionMode: pyData.sectionMode,
      elapsedSec: pyData.elapsed_sec,
      requiresPharmacistVerification: true,
      allLinesConfirmed: false,
      averageConfidence: pyData.average_confidence,
      opencvPreprocessing: {
        steps: pyData.opencv_preprocessing || [],
      },
      rawOcrText: pyData.raw_ocr_text,
      lines,
    };
  }

  /**
   * 1b. Xác nhận từng dòng thuốc đã bóc tách bởi Dược sĩ trước khi chuyển POS / xuất hóa đơn.
   */
  public async verifyOcrDraftLines(
    draftId: string,
    verifiedLines: Array<{
      lineId: string;
      selectedProductId: number | null;
      quantity: number;
      dosage?: string;
      confirmed: boolean;
      skipped?: boolean;
    }>
  ) {
    const draft = await prisma.ocrDraft.findUnique({ where: { DraftID: draftId } });
    if (!draft) {
      throw new AiServiceError(404, 'OCR_DRAFT_NOT_FOUND', `Không tìm thấy phiên OCR nháp ${draftId}`);
    }

    const originalLines = JSON.parse(draft.LinesJson) as OcrExtractedLine[];
    const inputMap = new Map(verifiedLines.map((l) => [l.lineId, l]));

    const updatedLines: OcrExtractedLine[] = originalLines.map((orig) => {
      const submitted = inputMap.get(orig.lineId);
      if (!submitted) return orig;
      return {
        ...orig,
        selectedProductId: submitted.skipped ? null : submitted.selectedProductId,
        extractedQuantity: Math.max(1, Number(submitted.quantity || orig.extractedQuantity || 1)),
        extractedDosage: submitted.dosage !== undefined ? submitted.dosage : orig.extractedDosage,
        confirmed: Boolean(submitted.confirmed && !submitted.skipped && submitted.selectedProductId),
        skipped: Boolean(submitted.skipped),
      };
    });

    const activeLines = updatedLines.filter((l) => !l.skipped);
    const unconfirmedActive = activeLines.filter((l) => !l.confirmed || !l.selectedProductId);
    if (activeLines.length === 0) {
      throw new AiServiceError(
        400,
        'OCR_NO_ACTIVE_ITEMS',
        'Phải xác nhận ít nhất 1 dòng thuốc khớp danh mục trước khi chuyển sang POS.'
      );
    }
    if (unconfirmedActive.length > 0) {
      throw new AiServiceError(
        400,
        'OCR_ITEMS_UNCONFIRMED',
        `Vẫn còn ${unconfirmedActive.length} dòng thuốc OCR chưa được Dược sĩ chọn sản phẩm và xác nhận.`
      );
    }

    const selectedIds = Array.from(
      new Set(activeLines.map((l) => l.selectedProductId).filter((id): id is number => Boolean(id)))
    );
    const products = await prisma.product.findMany({
      where: { ProductID: { in: selectedIds } },
      select: {
        ...SLIM_AI_PRODUCT_SELECT,
        packaging: { select: { IsRx: true } },
      },
    });
    const prodMap = new Map(products.map((p) => [p.ProductID, p]));

    for (const line of activeLines) {
      if (!line.selectedProductId || !prodMap.has(line.selectedProductId)) {
        throw new AiServiceError(
          400,
          'OCR_INVALID_PRODUCT_SELECTION',
          `Sản phẩm được chọn cho dòng "${line.extractedDrugQuery}" không tồn tại trong kho.`
        );
      }
    }

    const updated = await prisma.ocrDraft.update({
      where: { DraftID: draftId },
      data: {
        LinesJson: JSON.stringify(updatedLines),
        Status: 'CONFIRMED',
      },
    });

    return {
      draftId: updated.DraftID,
      status: updated.Status,
      allLinesConfirmed: true,
      confirmedLines: activeLines.length,
      skippedLines: updatedLines.length - activeLines.length,
      lines: updatedLines,
      posItems: activeLines.map((l) => {
        const p = prodMap.get(l.selectedProductId!)!;
        return {
          ProductID: p.ProductID,
          ProductName: p.ProductName,
          Price: p.Price,
          Unit: p.Unit,
          Quantity: l.extractedQuantity,
          MaxQuantity: p.Quantity,
          DosageNote: l.extractedDosage || 'Theo chỉ định của bác sĩ / Dược sĩ',
          IsRx: Boolean(p.packaging?.IsRx),
        };
      }),
    };
  }

  /**
   * 2. Nhận dạng giọng nói local bằng Faster-Whisper
   */
  public async speechToText(
    audioBuffer: Buffer,
    originalname: string,
    mimeType = 'audio/webm',
    language = 'vi'
  ): Promise<SpeechToTextResult> {
    if (!audioBuffer || audioBuffer.length < 256) {
      throw new AiServiceError(400, 'EMPTY_AUDIO', 'Dữ liệu ghi âm rỗng hoặc quá ngắn.');
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType || 'audio/webm' });
    formData.append('file', blob, originalname || 'recording.webm');

    let response: Response;
    try {
      response = await fetch(`${AI_SERVICE_URL}/api/py-ai/stt?language=${encodeURIComponent(language)}`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(45000),
      });
    } catch (err) {
      throw new AiServiceError(
        503,
        'AI_STT_SERVICE_DOWN',
        `Dịch vụ nhận dạng giọng nói Faster-Whisper (${AI_SERVICE_URL}) không phản hồi: ${err instanceof Error ? err.message : 'Timeout'}`,
        'faster-whisper'
      );
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      throw parsePyErrorDetail(
        errJson,
        response.status,
        'faster-whisper',
        `Lỗi nhận dạng giọng nói STT (HTTP ${response.status})`
      );
    }

    return (await response.json()) as SpeechToTextResult;
  }

  /**
   * 3. Chatbot Dược lâm sàng & Storefront RAG (Google AI Studio Gemini / Local Qwen fallback) + Tool DDI thực tế
   */
  private async preparePyChatPayload(params: {
    message: string;
    mode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION';
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    audience?: 'STAFF' | 'CUSTOMER';
    onlyStorefrontPublished?: boolean;
    productIdContext?: number;
    patientContext?: PatientTriageContext;
  }) {
    let enrichedMessage = params.message.trim();
    const audience = params.audience === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
    const onlyPublished = Boolean(params.onlyStorefrontPublished || audience === 'CUSTOMER');

    if (params.productIdContext) {
      const ctxProd = await prisma.product.findFirst({
        where: {
          ProductID: params.productIdContext,
          ...(onlyPublished ? { packaging: { is: { IsPublished: true, IsTestOnly: false } } } : {}),
        },
        select: { ProductID: true, ProductName: true },
      });
      if (ctxProd && !normalizeViText(enrichedMessage).includes(normalizeViText(ctxProd.ProductName))) {
        enrichedMessage = `[Đang xem sản phẩm: ${ctxProd.ProductName}] ${enrichedMessage}`;
      }
    }

    const candidates = await loadSlimSearchCandidates(enrichedMessage, { inStockOnly: false, limit: 25 });
    const normMsg = normalizeViText(enrichedMessage);
    const mentionedIds: number[] = [];
    for (const cand of candidates) {
      const words = normalizeViText(cand.ProductName)
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !/^\d+(mg|ml|mcg|g)$/i.test(w));
      if (words.length > 0 && words.some((w) => normMsg.includes(w))) {
        mentionedIds.push(cand.ProductID);
      }
    }

    let interactionWarnings: string[] = [];
    if (mentionedIds.length >= 2) {
      try {
        const safety = await evaluateClinicalSafetyServerSide({ productIds: mentionedIds.slice(0, 6) });
        if (safety.warnings.length > 0) {
          interactionWarnings = safety.warnings.map(
            (w) => `[${w.ruleId}] ${w.title} (${w.severity}): ${w.recommendation}`
          );
        }
      } catch {
        // Bỏ qua lỗi DDI cục bộ nếu thiếu rule; AI vẫn trả lời bình thường
      }
    }

    const sanitizedPatientContext = params.patientContext
      ? {
          ageGroup: params.patientContext.ageGroup || 'ADULT',
          pregnantOrBreastfeeding: Boolean(params.patientContext.pregnantOrBreastfeeding),
          allergies: String(params.patientContext.allergies || '').trim().slice(0, 150),
          chronicConditions: String(params.patientContext.chronicConditions || '').trim().slice(0, 150),
        }
      : null;

    return {
      message: enrichedMessage,
      mode: params.mode || null,
      history: (params.history || []).slice(-4).map((h) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        content: String(h.content || '').slice(0, 450),
      })),
      audience,
      onlyStorefrontPublished: onlyPublished,
      interactionWarnings,
      patientContext: sanitizedPatientContext,
    };
  }

  private enrichChatMetadata<T extends Record<string, unknown>>(raw: T): T & {
    engine: string;
    isAdvisoryOnly: true;
    disclaimer: string;
    ruleVersion: string;
  } {
    const provider = String(raw.provider || 'ollama');
    const model = String(raw.modelUsed || 'qwen2.5:7b');
    return {
      ...raw,
      engine: provider === 'google-ai-studio' ? `google-ai-studio (${model})` : `ollama-qwen-rag (${model})`,
      isAdvisoryOnly: true,
      disclaimer: String(raw.disclaimer || CLINICAL_ADVISORY_DISCLAIMER),
      ruleVersion: CLINICAL_RULE_VERSION,
    };
  }

  public async chatWithSources(
    message: string,
    mode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION',
    history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    options?: {
      audience?: 'STAFF' | 'CUSTOMER';
      onlyStorefrontPublished?: boolean;
      productIdContext?: number;
      patientContext?: PatientTriageContext;
    }
  ): Promise<RagChatResult> {
    const pyBody = await this.preparePyChatPayload({
      message,
      mode,
      history,
      audience: options?.audience,
      onlyStorefrontPublished: options?.onlyStorefrontPublished,
      productIdContext: options?.productIdContext,
      patientContext: options?.patientContext,
    });

    let response: Response;
    try {
      response = await fetch(`${AI_SERVICE_URL}/api/py-ai/chat-rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pyBody),
        signal: AbortSignal.timeout(90000),
      });
    } catch (err) {
      throw new AiServiceError(
        503,
        'AI_LLM_SERVICE_DOWN',
        `Dịch vụ AI Chatbot (${AI_SERVICE_URL}) hiện không phản hồi: ${err instanceof Error ? err.message : 'Timeout'}`,
        'llm'
      );
    }

    if (!response.ok) {
      const errJson = await response.json().catch(() => null);
      throw parsePyErrorDetail(
        errJson,
        response.status,
        'llm',
        `Mô hình AI / RAG chưa sẵn sàng (HTTP ${response.status})`
      );
    }

    const pyRes = (await response.json()) as Omit<
      RagChatResult,
      'engine' | 'isAdvisoryOnly' | 'ruleVersion'
    >;

    return this.enrichChatMetadata(pyRes) as RagChatResult;
  }

  public async chatForStorefront(params: {
    message: string;
    mode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION';
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    productIdContext?: number;
    patientContext?: PatientTriageContext;
  }): Promise<StorefrontRagChatResult> {
    const res = await this.chatWithSources(params.message, params.mode, params.history || [], {
      audience: 'CUSTOMER',
      onlyStorefrontPublished: true,
      productIdContext: params.productIdContext,
      patientContext: params.patientContext,
    });

    const sanitizedProducts =
      res.suggestedProducts.length > 0
        ? await fetchSanitizedPublicProductsByIds(
            res.suggestedProducts.map((p) => p.ProductID),
            true
          )
        : [];

    return {
      ...res,
      suggestedProducts: sanitizedProducts,
    };
  }

  public async streamChatToExpressRes(
    params: {
      message: string;
      mode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION';
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      audience?: 'STAFF' | 'CUSTOMER';
      onlyStorefrontPublished?: boolean;
      productIdContext?: number;
      patientContext?: PatientTriageContext;
    },
    res: ExpressResponse
  ): Promise<void> {
    const isCustomer = params.audience === 'CUSTOMER';
    const pyBody = await this.preparePyChatPayload(params);

    let pyResp: Response;
    try {
      pyResp = await fetch(`${AI_SERVICE_URL}/api/py-ai/chat-rag/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pyBody),
        signal: AbortSignal.timeout(95000),
      });
    } catch (err) {
      throw new AiServiceError(
        503,
        'AI_LLM_SERVICE_DOWN',
        `Dịch vụ AI Chatbot (${AI_SERVICE_URL}) hiện không phản hồi: ${err instanceof Error ? err.message : 'Timeout'}`,
        'llm'
      );
    }

    if (!pyResp.ok || !pyResp.body) {
      const errJson = await pyResp.json().catch(() => null);
      throw parsePyErrorDetail(
        errJson,
        pyResp.status,
        'llm',
        `Mô hình AI / RAG chưa sẵn sàng (HTTP ${pyResp.status})`
      );
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const decoder = new TextDecoder('utf-8');
    const reader = pyResp.body.getReader();
    let buffer = '';

    const sanitizeEventPayload = async (eventName: string, dataObj: Record<string, unknown>) => {
      if (eventName !== 'meta' && eventName !== 'done') {
        return dataObj;
      }
      const enriched = this.enrichChatMetadata(dataObj);
      if (isCustomer && Array.isArray(enriched.suggestedProducts) && enriched.suggestedProducts.length > 0) {
        const ids = (enriched.suggestedProducts as Array<{ ProductID?: number }>)
          .map((p) => Number(p.ProductID))
          .filter((id) => Number.isInteger(id) && id > 0);
        enriched.suggestedProducts = await fetchSanitizedPublicProductsByIds(ids, true);
      }
      return enriched;
    };

    const forwardSseFrame = async (frame: string) => {
      if (!frame.trim()) return;
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (dataLines.length === 0) return;
      const rawJson = dataLines.join('\n');
      try {
        const parsed = JSON.parse(rawJson) as Record<string, unknown>;
        const outObj = await sanitizeEventPayload(eventName, parsed);
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(outObj)}\n\n`);
      } catch {
        res.write(`event: ${eventName}\ndata: ${rawJson}\n\n`);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIdx = buffer.indexOf('\n\n');
        while (sepIdx !== -1) {
          const frame = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          await forwardSseFrame(frame);
          sepIdx = buffer.indexOf('\n\n');
        }
      }
      if (buffer.trim()) {
        await forwardSseFrame(buffer);
      }
    } finally {
      reader.releaseLock();
      res.end();
    }
  }

  public async diagnoseAndRecommend(
    message: string,
    mode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION',
    history: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<RagChatResult> {
    return this.chatWithSources(message, mode, history);
  }

  /**
   * 4. Tìm kiếm Hybrid (BM25 + FastEmbed Semantic RRF) cho Storefront & ERP
   *    Luồng tìm kiếm thương mại cho phép graceful fallback về từ khóa kèm cảnh báo semanticDegraded.
   */
  public async searchHybrid(
    query: string,
    options: { limit?: number; onlyStorefrontPublished?: boolean; includeTest?: boolean } = {}
  ): Promise<{
    available: boolean;
    engine: 'hybrid-rrf' | 'bm25-keyword-only' | 'unavailable';
    semanticAvailable: boolean;
    results: Array<{ ProductID: number; rrfScore: number; keywordScore: number; semanticScore: number }>;
  }> {
    try {
      const resp = await fetch(`${AI_SERVICE_URL}/api/py-ai/search-hybrid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit: options.limit ?? 50,
          onlyStorefrontPublished: Boolean(options.onlyStorefrontPublished),
          includeTest: Boolean(options.includeTest),
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!resp.ok) {
        return { available: false, engine: 'unavailable', semanticAvailable: false, results: [] };
      }
      const data = (await resp.json()) as {
        semanticAvailable?: boolean;
        results?: Array<{ ProductID: number; rrfScore: number; keywordScore: number; semanticScore: number }>;
      };
      const semAvail = Boolean(data.semanticAvailable);
      return {
        available: true,
        engine: semAvail ? 'hybrid-rrf' : 'bm25-keyword-only',
        semanticAvailable: semAvail,
        results: data.results || [],
      };
    } catch {
      return { available: false, engine: 'unavailable', semanticAvailable: false, results: [] };
    }
  }
}

export const aiGatewayService = new AiGatewayService();
