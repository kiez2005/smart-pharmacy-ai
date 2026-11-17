import { apiClient as http } from './apiClient';
import {
  AiModelsHealthReport,
  KnowledgeDocListResponse,
  KnowledgeDocumentRecord,
  OcrPrescriptionResponse,
  RagChatResponse,
  SpeechToTextResponse,
  VerifyOcrDraftResponse,
} from '../types/ai';

export type {
  AiModelsHealthReport,
  KnowledgeDocListResponse,
  KnowledgeDocumentRecord,
  OcrPrescriptionResponse,
  RagChatResponse,
  SpeechToTextResponse,
  VerifyOcrDraftResponse,
};

export function extractAiErrorMessage(error: unknown, fallback = 'Lỗi dịch vụ AI local'): string {
  const errObj = error as {
    response?: { status?: number; data?: { message?: string; model?: string; code?: string } };
    message?: string;
  };
  const data = errObj?.response?.data;
  if (data?.message) {
    return data.model ? `[${data.model}] ${data.message}` : data.message;
  }
  return errObj?.message || fallback;
}

export const aiApi = {
  async getHealth(): Promise<AiModelsHealthReport> {
    const res = await http.get<{ success: boolean; data: AiModelsHealthReport }>('/ai/health');
    return res.data.data;
  },

  async scanPrescription(file: File): Promise<OcrPrescriptionResponse> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await http.post<{ success: boolean; data: OcrPrescriptionResponse }>(
      '/ai/ocr-prescription',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data.data;
  },

  async verifyOcrDraft(
    draftId: string,
    lines: Array<{
      lineId: string;
      selectedProductId: number | null;
      quantity: number;
      dosage?: string;
      confirmed: boolean;
      skipped?: boolean;
    }>
  ): Promise<VerifyOcrDraftResponse> {
    const res = await http.post<{ success: boolean; data: VerifyOcrDraftResponse }>(
      `/ai/ocr-drafts/${encodeURIComponent(draftId)}/verify`,
      { lines }
    );
    return res.data.data;
  },

  async speechToText(
    audioBlob: Blob,
    filename = 'voice-recording.webm',
    language = 'vi'
  ): Promise<SpeechToTextResponse> {
    const formData = new FormData();
    formData.append('file', audioBlob, filename);
    formData.append('language', language);
    const res = await http.post<{ success: boolean; data: SpeechToTextResponse }>(
      '/ai/speech-to-text',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data.data;
  },

  async chatRag(payload: {
    message: string;
    mode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION';
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  }): Promise<RagChatResponse> {
    const res = await http.post<{ success: boolean; data: RagChatResponse }>('/ai/chat-rag', payload);
    return res.data.data;
  },

  async chatRagStream(
    payload: {
      message: string;
      mode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION';
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
    handlers: {
      onMeta?: (meta: RagChatResponse) => void;
      onDelta?: (textChunk: string) => void;
      onDone?: (finalData: RagChatResponse) => void;
      signal?: AbortSignal;
    }
  ): Promise<RagChatResponse> {
    const baseUrl = String(http.defaults.baseURL || 'http://localhost:5000/api').replace(/\/$/, '');
    const token = localStorage.getItem('pharmacore_token');
    const resp = await fetch(`${baseUrl}/ai/chat-rag/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: handlers.signal,
    });

    if (!resp.ok || !resp.body) {
      const errJson = await resp.json().catch(() => null);
      const err = new Error(errJson?.message || `Lỗi kết nối AI Stream (HTTP ${resp.status})`);
      (err as unknown as { response?: { status: number; data: unknown } }).response = {
        status: resp.status,
        data: errJson,
      };
      throw err;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalRes: RagChatResponse | null = null;

    const processFrame = (frame: string) => {
      if (!frame.trim()) return;
      let eventName = 'message';
      const dataLines: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) return;
      const parsed = JSON.parse(dataLines.join('\n'));
      if (eventName === 'meta') {
        handlers.onMeta?.(parsed as RagChatResponse);
      } else if (eventName === 'delta' && typeof parsed?.text === 'string') {
        handlers.onDelta?.(parsed.text);
      } else if (eventName === 'done') {
        finalRes = parsed as RagChatResponse;
        handlers.onDone?.(finalRes);
      } else if (eventName === 'error') {
        const err = new Error(parsed?.message || 'Lỗi khi streaming câu trả lời AI');
        (err as unknown as { response?: { status: number; data: unknown } }).response = {
          status: 503,
          data: parsed,
        };
        throw err;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const frame = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        processFrame(frame);
        sepIdx = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) {
      processFrame(buffer);
    }

    if (!finalRes) {
      throw new Error('Luồng phản hồi AI kết thúc sớm trước khi nhận kết quả hoàn chỉnh.');
    }
    return finalRes;
  },

  async diagnoseSymptoms(message: string): Promise<RagChatResponse> {
    return this.chatRag({ message, mode: 'SYMPTOM_CONSULTATION' });
  },

  async listKnowledge(params?: {
    search?: string;
    docType?: string;
    productId?: number;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<KnowledgeDocListResponse> {
    const res = await http.get<{ success: boolean; data: KnowledgeDocListResponse }>('/ai/knowledge', {
      params,
    });
    return res.data.data;
  },

  async createKnowledge(payload: {
    ProductID?: number | null;
    DocType?: 'LEAFLET' | 'GUIDELINE' | 'FAQ';
    Title: string;
    Section: string;
    Content: string;
    SourceName: string;
    SourceRef?: string | null;
    VerifiedBy?: string;
  }): Promise<{ document: KnowledgeDocumentRecord }> {
    const res = await http.post<{ success: boolean; data: { document: KnowledgeDocumentRecord } }>(
      '/ai/knowledge',
      payload
    );
    return res.data.data;
  },

  async uploadKnowledgeFile(
    file: File,
    meta: {
      ProductID?: number | null;
      DocType?: 'LEAFLET' | 'GUIDELINE' | 'FAQ';
      Title?: string;
      Section?: string;
      SourceName?: string;
      SourceRef?: string;
    }
  ): Promise<{ createdCount: number; documents: KnowledgeDocumentRecord[] }> {
    const formData = new FormData();
    formData.append('file', file);
    if (meta.ProductID) formData.append('ProductID', String(meta.ProductID));
    if (meta.DocType) formData.append('DocType', meta.DocType);
    if (meta.Title) formData.append('Title', meta.Title);
    if (meta.Section) formData.append('Section', meta.Section);
    if (meta.SourceName) formData.append('SourceName', meta.SourceName);
    if (meta.SourceRef) formData.append('SourceRef', meta.SourceRef);
    const res = await http.post<{
      success: boolean;
      data: { createdCount: number; documents: KnowledgeDocumentRecord[] };
    }>('/ai/knowledge/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  async toggleKnowledge(docId: number, isActive: boolean): Promise<void> {
    await http.patch(`/ai/knowledge/${docId}/toggle`, { isActive });
  },
};
