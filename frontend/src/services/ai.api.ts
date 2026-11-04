import axios from 'axios';
import { DiagnoseChatResponse, OcrPrescriptionResponse } from '../types/ai';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export const aiApi = {
  // Gợi ý AI #1: Quét ảnh Đơn thuốc bằng OpenCV + OCR
  async scanPrescription(file: File | null, presetHint = ''): Promise<OcrPrescriptionResponse> {
    const formData = new FormData();
    if (file) {
      formData.append('file', file);
    }
    if (presetHint) {
      formData.append('presetHint', presetHint);
    }
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
