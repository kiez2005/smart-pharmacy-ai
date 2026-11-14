import { apiClient as http } from './apiClient';
import {
  ContactRecord,
  CreateInvoicePayload,
  CreateOnlineOrderPayload,
  InvoiceRecord,
  OnlineOrderRecord,
  UserProfile,
} from '../types/forms';

export const CLINICAL_OVERRIDE_REASONS = [
  {
    code: 'DOCTOR_CONFIRMED',
    label: 'Bác sĩ điều trị đã xác nhận giữ đơn và theo dõi sát',
  },
  {
    code: 'PATIENT_TOLERANT',
    label: 'Bệnh nhân xác nhận đã dung nạp an toàn hoạt chất này trước đây',
  },
  {
    code: 'FALSE_POSITIVE_MATCH',
    label: 'Dị ứng khai báo không trùng hoạt chất thực tế của chế phẩm',
  },
  {
    code: 'STAGGERED_DOSING',
    label: 'Đã tư vấn bệnh nhân uống giãn cách tối thiểu 2-4 giờ',
  },
] as const;

export const formsApi = {
  // Form Đăng nhập & Đăng ký
  async login(Email: string, Password: string): Promise<{ token: string; user: UserProfile }> {
    const res = await http.post<{
      success: boolean;
      data: { token: string; user: UserProfile };
    }>('/auth/login', { Email, Password });

    if (res.data.data.token) {
      localStorage.setItem('pharmacore_token', res.data.data.token);
      localStorage.setItem('pharmacore_user', JSON.stringify(res.data.data.user));
    }
    return res.data.data;
  },

  async register(payload: {
    FullName: string;
    Email: string;
    Password: string;
    Phone: string;
  }): Promise<{ message: string; user: UserProfile }> {
    const res = await http.post<{
      success: boolean;
      message: string;
      data: { user: UserProfile };
    }>('/auth/register', payload);
    return {
      message: res.data.message,
      user: res.data.data.user,
    };
  },

  async logout(): Promise<void> {
    try {
      await http.post('/auth/logout');
    } catch {
      // Vẫn xóa phiên cục bộ nếu token đã hết hạn trên server
    } finally {
      localStorage.removeItem('pharmacore_token');
      localStorage.removeItem('pharmacore_user');
    }
  },

  async getMe(): Promise<UserProfile> {
    const res = await http.get<{ success: boolean; data: UserProfile }>('/auth/me');
    return res.data.data;
  },

  // Form Hóa đơn & Thanh toán
  async listInvoices(): Promise<InvoiceRecord[]> {
    const res = await http.get<{ success: boolean; data: InvoiceRecord[] }>('/invoices');
    return res.data.data;
  },

  async createInvoice(payload: CreateInvoicePayload, idempotencyKey?: string): Promise<InvoiceRecord> {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await http.post<{ success: boolean; data: InvoiceRecord }>('/invoices', payload, {
      headers,
    });
    return res.data.data;
  },

  async uploadInvoicePrescription(
    file: File
  ): Promise<{ fileKey: string; mime: string; sizeBytes: number }> {
    const formData = new FormData();
    formData.append('prescription', file);
    const res = await http.post<{
      success: boolean;
      data: { fileKey: string; mime: string; sizeBytes: number };
    }>('/invoices/prescriptions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data.data;
  },

  async fetchInvoicePrescriptionBlobUrl(fileKey: string): Promise<string> {
    const res = await http.get<Blob>(`/invoices/prescriptions/${encodeURIComponent(fileKey)}`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(res.data);
  },

  async cancelInvoice(
    invoiceId: number,
    cancelReason?: string,
    idempotencyKey?: string
  ): Promise<InvoiceRecord> {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await http.post<{ success: boolean; data: InvoiceRecord }>(
      `/invoices/${invoiceId}/cancel`,
      { cancelReason },
      { headers }
    );
    return res.data.data;
  },

  async updateFulfillmentStatus(
    invoiceId: number,
    fulfillmentStatus: string
  ): Promise<InvoiceRecord> {
    const res = await http.patch<{ success: boolean; data: InvoiceRecord }>(
      `/invoices/${invoiceId}/fulfillment`,
      { fulfillmentStatus }
    );
    return res.data.data;
  },

  async collectDebt(
    invoiceId: number,
    amount: number,
    paymentMethod: string = 'CASH',
    idempotencyKey?: string
  ): Promise<InvoiceRecord> {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await http.post<{ success: boolean; data: InvoiceRecord }>(
      `/invoices/${invoiceId}/pay-debt`,
      { amount, paymentMethod },
      { headers }
    );
    return res.data.data;
  },

  // ============================================================================
  // CUSTOMER PUBLIC ONLINE ORDER (Issue 1, 2, 8)
  // ============================================================================
  async listPublicCatalog(): Promise<{ items: any[]; total: number }> {
    const res = await http.get<{ success: boolean; data: { items: any[]; total: number } }>(
      '/online-orders/catalog'
    );
    return res.data.data;
  },

  async createOnlineOrder(
    payload: CreateOnlineOrderPayload,
    idempotencyKey?: string
  ): Promise<OnlineOrderRecord> {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await http.post<{ success: boolean; data: OnlineOrderRecord }>(
      '/online-orders',
      payload,
      { headers }
    );
    return res.data.data;
  },

  async trackOnlineOrder(orderCode: string, phoneOrToken: string): Promise<OnlineOrderRecord> {
    const res = await http.get<{ success: boolean; data: OnlineOrderRecord }>(
      '/online-orders/track',
      {
        params: { orderCode, phoneOrToken },
      }
    );
    return res.data.data;
  },

  async customerCancelOnlineOrder(
    orderId: number,
    phoneOrToken: string,
    reason?: string
  ): Promise<OnlineOrderRecord> {
    const res = await http.post<{ success: boolean; data: OnlineOrderRecord }>(
      `/online-orders/${orderId}/customer-cancel`,
      { phoneOrToken, reason }
    );
    return res.data.data;
  },

  // ============================================================================
  // STAFF RBAC ONLINE ORDER FULFILLMENT & REVIEW (Issue 3, 4, 7, 10, 16)
  // ============================================================================
  async listStaffOnlineOrders(params?: {
    status?: string;
    channel?: string;
    page?: number;
    limit?: number;
  }): Promise<OnlineOrderRecord[]> {
    const res = await http.get<{ success: boolean; data: OnlineOrderRecord[] }>('/online-orders', {
      params,
    });
    return res.data.data;
  },

  async listStaffOnlineOrdersPaged(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: OnlineOrderRecord[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const res = await http.get<{
      success: boolean;
      data: OnlineOrderRecord[];
      pagination?: { page: number; limit: number; total: number; totalPages: number };
    }>('/online-orders', { params });
    return {
      items: res.data.data,
      pagination: res.data.pagination || {
        page: params?.page || 1,
        limit: params?.limit || res.data.data.length || 40,
        total: res.data.data.length,
        totalPages: 1,
      },
    };
  },

  async reviewOnlineOrder(
    orderId: number,
    payload: {
      action: 'APPROVE' | 'REJECT';
      clinicalReviewNote?: string;
      clinicalOverrideCode?: string;
      rejectReason?: string;
    },
    idempotencyKey?: string
  ): Promise<{ order: OnlineOrderRecord; invoice?: InvoiceRecord }> {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await http.post<{
      success: boolean;
      data: OnlineOrderRecord;
    }>(`/online-orders/${orderId}/review`, payload, { headers });
    const order = res.data.data;
    return { order, invoice: order.invoice || undefined };
  },

  async updateOnlineOrderStage(
    orderId: number,
    payload: {
      stage: 'PACKING' | 'SHIPPING' | 'DELIVERED';
      courierTrackingCode?: string;
    }
  ): Promise<OnlineOrderRecord> {
    const res = await http.patch<{ success: boolean; data: OnlineOrderRecord }>(
      `/online-orders/${orderId}/status`,
      payload
    );
    return res.data.data;
  },

  // Form Liên hệ & Tư vấn Dược sĩ
  async listContacts(): Promise<ContactRecord[]> {
    const res = await http.get<{ success: boolean; data: ContactRecord[] }>('/contacts');
    return res.data.data;
  },

  async createContact(payload: {
    FullName: string;
    Email: string;
    Phone: string;
    Subject: string;
    Message: string;
  }): Promise<ContactRecord> {
    const res = await http.post<{ success: boolean; data: ContactRecord }>('/contacts', payload);
    return res.data.data;
  },

  async replyContact(contactId: number, ReplyNote: string): Promise<ContactRecord> {
    const res = await http.patch<{ success: boolean; data: ContactRecord }>(
      `/contacts/${contactId}/reply`,
      { ReplyNote }
    );
    return res.data.data;
  },

  async fetchPrescriptionImageBlobUrl(fileKey: string): Promise<string> {
    const res = await http.get<Blob>(`/online-orders/prescriptions/${encodeURIComponent(fileKey)}`, {
      responseType: 'blob',
    });
    return URL.createObjectURL(res.data);
  },
};
