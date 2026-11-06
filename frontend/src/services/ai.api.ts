import { apiClient as http } from './apiClient';
import { DiagnoseChatResponse, OcrPrescriptionResponse } from '../types/ai';
export type { DiagnoseChatResponse, OcrPrescriptionResponse };

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const aiApi = {
  // Gợi ý AI #1: Quét ảnh Đơn thuốc bằng OpenCV + OCR
  async scanPrescription(file: File | null, presetHint = '', isDemo = false): Promise<OcrPrescriptionResponse> {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    if (presetHint) {
      formData.append('presetHint', presetHint);
    }
    formData.append('isDemo', isDemo ? 'true' : 'false');
    const res = await http.post<{ success: boolean; data: OcrPrescriptionResponse }>(
      '/ai/ocr-prescription',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data.data;
  },

  // Gợi ý AI #2, #3, #5: Chẩn đoán sơ bộ triệu chứng & Tư vấn thuốc (Scikit-learn TF-IDF)
  async diagnoseSymptoms(message: string): Promise<DiagnoseChatResponse> {
    const res = await http.post<{ success: boolean; data: DiagnoseChatResponse }>(
      '/ai/diagnose-chat',
      { message }
    );
    return res.data.data;
  },
};
