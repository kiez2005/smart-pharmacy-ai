import axios from 'axios';
import {
  OnlineOrderRecord,
  PatientTriageContext,
  Product,
  StorefrontChatResponse,
} from '../types';

const API_BASE = '/api';

export interface PublicCatalogSearchMeta {
  engine: 'hybrid-rrf' | 'bm25-keyword-only' | 'keyword-degraded' | 'sql-catalog';
  semanticAvailable: boolean;
  semanticDegraded: boolean;
  warning?: string;
}

export interface PublicCatalogResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  categories: string[];
  searchMeta?: PublicCatalogSearchMeta;
}

export const storeApi = {
  // Lấy danh mục sản phẩm công khai đã được ẩn lọc (Allowlisted DTO - A6, P1)
  async getProducts(params?: {
    search?: string;
    type?: string;
    rxFilter?: 'ALL' | 'OTC' | 'RX';
    symptom?: string;
    page?: number;
    limit?: number;
    inStockOnly?: boolean;
  }): Promise<PublicCatalogResponse> {
    const res = await axios.get(`${API_BASE}/online-orders/catalog`, { params });
    const data = res.data?.data || res.data;
    const items: Product[] = data.items || [];
    return {
      items,
      total: data.total ?? items.length,
      page: data.page ?? params?.page ?? 1,
      limit: data.limit ?? params?.limit ?? 12,
      totalPages: data.totalPages ?? 1,
      categories: data.categories || [],
      searchMeta: data.searchMeta,
    };
  },

  // Upload ảnh đơn thuốc riêng tư (multipart/form-data, tối đa 3MB JPEG/PNG/WEBP - A5)
  async uploadPrescriptionImage(file: File): Promise<{
    fileKey: string;
    mime: string;
    sizeBytes: number;
  }> {
    const formData = new FormData();
    formData.append('prescription', file);
    const res = await axios.post(`${API_BASE}/online-orders/prescriptions`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data;
  },

  // Khách đặt hàng bán lẻ trực tuyến (Giữ kho nguyên tử 15 phút - Pending Review - A1, S2)
  async createOnlineOrder(
    payload: {
      OrderType?: 'RETAIL';
      CustomerName: string;
      CustomerPhone: string;
      ShippingAddress: string;
      ShippingMethod?: 'EXPRESS_2H' | 'STANDARD';
      PaymentMethod?: 'COD' | 'VIETQR';
      PatientAllergies?: string;
      PrescriptionFileKey?: string;
      Note?: string;
      items: Array<{
        ProductID: number;
        Quantity: number;
        Unit?: string;
        DosageNote?: string;
      }>;
    },
    idempotencyKey?: string
  ): Promise<OnlineOrderRecord> {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await axios.post(
      `${API_BASE}/online-orders`,
      { ...payload, OrderType: 'RETAIL' },
      { headers }
    );
    return res.data?.data;
  },

  // Tra cứu đơn hàng bảo mật bằng OrderCode + header X-Tracking-Token (TRK-... - P1-08)
  async trackOrder(orderCode: string, trackingToken: string): Promise<OnlineOrderRecord> {
    const res = await axios.get(`${API_BASE}/online-orders/track`, {
      params: { orderCode: orderCode.trim() },
      headers: {
        'X-Tracking-Token': trackingToken.trim(),
      },
    });
    return res.data?.data;
  },

  // Khách tự hủy đơn khi đơn còn PENDING_REVIEW bằng header X-Tracking-Token (P1-08)
  async cancelOrder(
    orderId: number,
    trackingToken: string,
    reason?: string
  ): Promise<OnlineOrderRecord> {
    const res = await axios.post(
      `${API_BASE}/online-orders/${orderId}/customer-cancel`,
      { reason },
      {
        headers: {
          'X-Tracking-Token': trackingToken.trim(),
        },
      }
    );
    return res.data?.data;
  },

  // Khách gửi đơn thuốc / toa bác sĩ hoặc yêu cầu báo giá Sỉ B2B (Contact Form - A1)
  async uploadPrescriptionConsultation(payload: {
    fullName: string;
    phone: string;
    email?: string;
    prescriptionFileKey?: string;
    note: string;
    requestType?: 'RX' | 'B2B_QUOTE';
    companyName?: string;
    taxCode?: string;
  }): Promise<void> {
    const isB2B = payload.requestType === 'B2B_QUOTE';
    const subject = isB2B
      ? `[Yêu cầu Báo giá Sỉ B2B] ${payload.companyName || payload.fullName} (${payload.phone})`
      : `[Yêu cầu tư vấn Toa thuốc Rx] ${payload.fullName} (${payload.phone})`;
    const parts = [
      payload.companyName ? `Đơn vị/Phòng khám: ${payload.companyName}` : '',
      payload.taxCode ? `Mã số thuế: ${payload.taxCode}` : '',
      payload.prescriptionFileKey ? `Đính kèm đơn thuốc: ${payload.prescriptionFileKey}` : '',
      `Nội dung: ${payload.note}`,
    ].filter(Boolean);

    const customerEmail = payload.email?.trim() || (isB2B ? 'b2b.partner@pharmacore.vn' : 'patient.online@pharmacore.vn');

    await axios.post(`${API_BASE}/contacts`, {
      FullName: payload.fullName,
      Phone: payload.phone,
      Email: customerEmail,
      Subject: subject,
      Message: parts.join(' | '),
      Priority: 'HIGH',
      ...(payload.prescriptionFileKey ? { AttachmentFileKey: payload.prescriptionFileKey } : {}),
    });
  },

  // Gửi transcript tư vấn từ Chatbot Storefront sang Dược sĩ (Warm Handoff -> ERP Contacts)
  async submitChatWarmHandoff(payload: {
    fullName: string;
    phone: string;
    email?: string;
    prescriptionFileKey?: string;
    note?: string;
    transcriptSummary: string;
  }): Promise<void> {
    const parts = [
      payload.prescriptionFileKey ? `Đính kèm đơn thuốc: ${payload.prescriptionFileKey}` : '',
      payload.note?.trim() ? `Ghi chú khách: ${payload.note.trim()}` : '',
      `Lịch sử trao đổi tư vấn:\n${payload.transcriptSummary}`,
    ].filter(Boolean);

    await axios.post(`${API_BASE}/contacts`, {
      FullName: payload.fullName.trim(),
      Phone: payload.phone.trim(),
      Email: payload.email?.trim() || 'patient.chat@pharmacore.vn',
      Subject: `[Yêu cầu Dược sĩ tư vấn] ${payload.fullName.trim()} (${payload.phone.trim()})`,
      Message: parts.join(' | ').slice(0, 3500),
      Priority: 'HIGH',
      ...(payload.prescriptionFileKey ? { AttachmentFileKey: payload.prescriptionFileKey } : {}),
    });
  },

  // Nhận dạng giọng nói tiếng Việt trên Storefront (Faster-Whisper)
  async speechToText(
    audioBlob: Blob,
    fileName = 'voice-query.webm',
    language = 'vi'
  ): Promise<{ text: string; language: string; processingTimeSec: number; modelUsed: string }> {
    const fd = new FormData();
    fd.append('file', audioBlob, fileName);
    fd.append('language', language);
    const res = await axios.post<{
      success: boolean;
      data: { text: string; language: string; processingTimeSec: number; modelUsed: string };
    }>(`${API_BASE}/online-orders/assistant/speech-to-text`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return res.data.data;
  },

  // Storefront Public AI Chat (SSE Streaming - chữ chạy ngay & A6 DTO Allowlist)
  async chatWithAssistantStream(
    payload: {
      message: string;
      mode?: 'DRUG_QA' | 'SYMPTOM_CONSULTATION';
      productIdContext?: number;
      patientContext?: Partial<PatientTriageContext>;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
    handlers: {
      onMeta?: (meta: StorefrontChatResponse) => void;
      onDelta?: (chunk: string) => void;
      onDone?: (finalData: StorefrontChatResponse) => void;
      signal?: AbortSignal;
    }
  ): Promise<StorefrontChatResponse> {
    const resp = await fetch(`${API_BASE}/online-orders/assistant/chat-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: handlers.signal,
    });

    if (!resp.ok || !resp.body) {
      const errJson = await resp.json().catch(() => null);
      const err = new Error(errJson?.message || `HTTP ${resp.status}`) as Error & {
        status?: number;
        code?: string;
      };
      err.status = resp.status;
      err.code = errJson?.code;
      throw err;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalRes: StorefrontChatResponse | null = null;

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
        handlers.onMeta?.(parsed as StorefrontChatResponse);
      } else if (eventName === 'delta' && typeof parsed?.text === 'string') {
        handlers.onDelta?.(parsed.text);
      } else if (eventName === 'done') {
        finalRes = parsed as StorefrontChatResponse;
        handlers.onDone?.(finalRes);
      } else if (eventName === 'error') {
        const err = new Error(parsed?.message || 'Trợ lý AI gặp gián đoạn') as Error & {
          status?: number;
          code?: string;
        };
        err.status = 503;
        err.code = parsed?.code || 'AI_STREAM_ERROR';
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
      throw new Error('Phản hồi từ Trợ lý AI bị ngắt quãng.');
    }
    return finalRes;
  },
};
