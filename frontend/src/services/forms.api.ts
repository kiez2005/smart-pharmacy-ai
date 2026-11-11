import { apiClient as http } from './apiClient';
import {
  ContactRecord,
  CreateInvoicePayload,
  CreateOnlineOrderPayload,
  InvoiceRecord,
  OnlineOrderRecord,
  UserProfile,
} from '../types/forms';

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

  logout(): void {
    localStorage.removeItem('pharmacore_token');
    localStorage.removeItem('pharmacore_user');
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
  }): Promise<OnlineOrderRecord[]> {
    const res = await http.get<{ success: boolean; data: OnlineOrderRecord[] }>('/online-orders', {
      params,
    });
    return res.data.data;
  },

  async reviewOnlineOrder(
    orderId: number,
    payload: {
      action: 'APPROVE' | 'REJECT';
      clinicalReviewNote?: string;
      rejectReason?: string;
    },
    idempotencyKey?: string
  ): Promise<{ order: OnlineOrderRecord; invoice?: InvoiceRecord }> {
    const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {};
    const res = await http.post<{
      success: boolean;
      data: { order: OnlineOrderRecord; invoice?: InvoiceRecord };
    }>(`/online-orders/${orderId}/review`, payload, { headers });
    return res.data.data;
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
};
