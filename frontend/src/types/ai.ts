import { Product } from './product';

export interface MatchedPrescriptionItem {
  keyword: string;
  quantity: number;
  dosage: string;
  matchedProduct: Product | null;
  inStock?: boolean;
  status?: 'IN_STOCK' | 'OUT_OF_STOCK' | 'NOT_FOUND';
}

export interface OcrPrescriptionResponse {
  engine: 'python-opencv-ocr' | 'node-fallback-ocr';
  opencvPreprocessing: {
    processedBase64: string | null;
    dimensions: string;
    sharpnessScore: number;
    steps: string[];
  };
  rawOcrText: string;
  items: MatchedPrescriptionItem[];
}

export interface RecommendedDrugItem {
  ProductID: number;
  ProductName: string;
  ProductType: string;
  Price: number;
  Unit: string;
  Quantity: number;
  Description: string;
  similarityScore: number;
}

export interface DiagnoseChatResponse {
  engine: 'python-sklearn-tfidf-rag' | 'node-clinical-rag-fallback';
  preliminaryDiagnosis: string;
  clinicalAdvice: string;
  contraindicationWarning: string;
  recommendedProducts: RecommendedDrugItem[];
}
