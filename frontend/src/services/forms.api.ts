import axios from 'axios';
import {
  ContactRecord,
  CreateInvoicePayload,
  InvoiceRecord,
  UserProfile,
} from '../types/forms';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export const formsApi = {
  // Form Đăng nhập & Đăng ký
  async login(Email: string, Password: string): Promise<{ token: string; user: UserProfile }> {
    const res = await http.post<{
      success: boolean;
      data: { token: string; user: UserProfile };
    }>('/auth/login', { Email, Password });
    return res.data.data;
  },

  async register(payload: {
    FullName: string;
    Email: string;
    Password: string;
    Phone: string;
  }): Promise<{ token: string; user: UserProfile }> {
    const res = await http.post<{
      success: boolean;
      data: { token: string; user: UserProfile };
    }>('/auth/register', payload);
    return res.data.data;
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
