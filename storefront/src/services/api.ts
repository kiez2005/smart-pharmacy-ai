import axios from 'axios';
import { OnlineOrderRecord, Product } from '../types';

const API_BASE = '/api';

export interface PublicCatalogResponse {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  categories: string[];
}

export const storeApi = {
  // Lấy danh mục sản phẩm công khai đã được ẩn lọc (Allowlisted DTO - A6, P1)
  async getProducts(params?: {
    search?: string;
    type?: string;
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
      payload.prescriptionFileKey ? `FileKey đơn thuốc bảo mật: ${payload.prescriptionFileKey}` : '',
      `Nội dung: ${payload.note}`,
    ].filter(Boolean);

    await axios.post(`${API_BASE}/contacts`, {
      FullName: payload.fullName,
      Phone: payload.phone,
      Email: isB2B ? 'b2b.partner@pharmacore.vn' : 'patient.online@pharmacore.vn',
      Subject: subject,
      Message: parts.join(' | '),
      Priority: 'HIGH',
    });
  },
};
