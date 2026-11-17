import { Product } from './product';

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
  geminiConfigured?: boolean;
  activeLlmProvider?: string;
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

export interface OcrPrescriptionResponse {
  draftId: string;
  engine: string;
  sectionMode?: 'TREATMENT_TABLE' | 'FULL_FALLBACK' | string;
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

export interface VerifyOcrDraftResponse {
  draftId: string;
  status: string;
  allLinesConfirmed: boolean;
  confirmedLines: number;
  skippedLines: number;
  lines: OcrExtractedLine[];
  posItems: Array<{
    ProductID: number;
    ProductName: string;
    Price: number;
    Unit: string;
    Quantity: number;
    MaxQuantity: number;
    DosageNote: string;
    IsRx: boolean;
  }>;
}

export interface SpeechToTextResponse {
  modelUsed: string;
  language: string;
  languageProbability: number;
  audioDurationSec: number;
  processingTimeSec: number;
  text: string;
  segments: Array<{ start: number; end: number; text: string }>;
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

export interface RagChatResponse {
  engine: string;
  modelUsed: string;
  provider?: string;
  fallbackUsed?: boolean;
  mode: 'DRUG_QA' | 'SYMPTOM_CONSULTATION';
  groundingMode?: 'FAST_PATH' | 'LOCAL_HDSD' | 'GENERAL_MEDICAL' | 'INSUFFICIENT';
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

export interface KnowledgeDocumentRecord {
  DocID: number;
  ProductID: number | null;
  DocType: 'LEAFLET' | 'GUIDELINE' | 'FAQ' | string;
  Title: string;
  Section: string;
  Content: string;
  SourceName: string;
  SourceRef: string | null;
  VerifiedBy: string;
  VerifiedAt: string;
  IsActive: boolean;
  product?: Pick<Product, 'ProductID' | 'ProductName' | 'ProductType'> | null;
}

export interface KnowledgeDocListResponse {
  items: KnowledgeDocumentRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
