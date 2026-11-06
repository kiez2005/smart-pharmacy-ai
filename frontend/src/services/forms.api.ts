import { apiClient as http } from './apiClient';
import {
  ContactRecord,
  CreateInvoicePayload,
  InvoiceRecord,
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

  async createInvoice(payload: CreateInvoicePayload): Promise<InvoiceRecord> {
    const res = await http.post<{ success: boolean; data: InvoiceRecord }>('/invoices', payload);
    return res.data.data;
  },

  async cancelInvoice(invoiceId: number): Promise<InvoiceRecord> {
    const res = await http.post<{ success: boolean; data: InvoiceRecord }>(
      `/invoices/${invoiceId}/cancel`
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
