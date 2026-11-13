import axios from 'axios';
import { OnlineOrderRecord, Product } from '../types';

const API_BASE = '/api';

export const storeApi = {
  // Lấy danh mục sản phẩm công khai (Không yêu cầu JWT nhân viên)
  async getProducts(params?: {
    search?: string;
    type?: string;
  }): Promise<{ items: Product[]; total: number }> {
    const res = await axios.get(`${API_BASE}/online-orders/catalog`, { params });
    const data = res.data?.data || res.data;
    return {
      items: data.items || [],
      total: data.total || data.items?.length || 0,
    };
  },

  // Khách đặt hàng trực tuyến (Giữ kho nguyên tử 15 phút - Pending Review)
  async createOnlineOrder(
    payload: {
      OrderType?: 'RETAIL' | 'WHOLESALE';
      CustomerName: string;
      CustomerPhone: string;
      ShippingAddress: string;
      ShippingMethod?: 'EXPRESS_2H' | 'STANDARD' | 'GDP_TRUCK';
      PaymentMethod?: 'COD' | 'VIETQR' | 'CREDIT';
      PatientAllergies?: string;
      PrescriptionImage?: string;
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
    const res = await axios.post(`${API_BASE}/online-orders`, payload, { headers });
    return res.data?.data;
  },

  // Tra cứu đơn hàng độc lập (OrderCode + Phone hoặc TrackingToken)
  async trackOrder(orderCode: string, phoneOrToken: string): Promise<OnlineOrderRecord> {
    const res = await axios.get(`${API_BASE}/online-orders/track`, {
      params: { orderCode, phoneOrToken },
    });
    return res.data?.data;
  },

  // Khách tự hủy đơn khi đơn còn PENDING_REVIEW
  async cancelOrder(
    orderId: number,
    phoneOrToken: string,
    reason?: string
  ): Promise<OnlineOrderRecord> {
    const res = await axios.post(`${API_BASE}/online-orders/${orderId}/customer-cancel`, {
      phoneOrToken,
      reason,
    });
    return res.data?.data;
  },

  // Khách gửi đơn thuốc / toa bác sĩ để Dược sĩ liên hệ tư vấn
  async uploadPrescriptionConsultation(payload: {
    fullName: string;
    phone: string;
    prescriptionImage: string;
    note: string;
  }): Promise<void> {
    await axios.post(`${API_BASE}/contacts`, {
      FullName: payload.fullName,
      Phone: payload.phone,
      Email: 'patient.online@pharmacore.vn',
      Subject: `[Yêu cầu tư vấn Toa thuốc] Khách hàng ${payload.fullName} (${payload.phone})`,
      Message: `Ảnh toa thuốc đính kèm: ${payload.prescriptionImage}. Ghi chú bệnh nhân: ${payload.note}`,
      Priority: 'HIGH',
    });
  },
};
