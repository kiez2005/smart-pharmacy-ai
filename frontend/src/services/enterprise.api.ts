import { apiClient } from './apiClient';
import {
  CustomerRecord,
  DashboardAnalytics,
  DrugInteractionResult,
  PaymentRecord,
  ProductStockCardResponse,
  PurchaseOrderRecord,
  SupplierRecord,
  UserProfile,
} from '../types/enterprise';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const http = {
  get: <T = any>(url: string, config?: any) => apiClient.get<T>(`/enterprise${url}`, config),
  post: <T = any>(url: string, data?: any, config?: any) => apiClient.post<T>(`/enterprise${url}`, data, config),
  put: <T = any>(url: string, data?: any, config?: any) => apiClient.put<T>(`/enterprise${url}`, data, config),
  patch: <T = any>(url: string, data?: any, config?: any) => apiClient.patch<T>(`/enterprise${url}`, data, config),
  delete: <T = any>(url: string, config?: any) => apiClient.delete<T>(`/enterprise${url}`, config),
};

export const enterpriseApi = {
  async getDashboard(): Promise<DashboardAnalytics> {
    const res = await http.get<{ success: boolean; data: DashboardAnalytics }>('/dashboard');
    return res.data.data;
  },

  async getProductStockCard(
    productId: number,
    params?: { page?: number; limit?: number }
  ): Promise<ProductStockCardResponse> {
    const res = await http.get<{ success: boolean; data: ProductStockCardResponse }>(
      `/products/${productId}/stock-card`,
      { params }
    );
    return res.data.data;
  },

  async getSuppliers(params?: {
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<SupplierRecord[]> {
    const res = await http.get<{ success: boolean; data: SupplierRecord[] }>('/suppliers', {
      params,
    });
    return res.data.data;
  },

  async createSupplier(payload: {
    SupplierCode?: string;
    SupplierName: string;
    ContactPerson?: string;
    Phone: string;
    Email?: string;
    TaxCode?: string;
    Address?: string;
  }): Promise<SupplierRecord> {
    const res = await http.post<{ success: boolean; data: SupplierRecord }>('/suppliers', payload);
    return res.data.data;
  },

  async getPurchaseOrders(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<PurchaseOrderRecord[]> {
    const res = await http.get<{ success: boolean; data: PurchaseOrderRecord[] }>(
      '/purchase-orders',
      { params }
    );
    return res.data.data;
  },

  async cancelPurchaseOrder(poId: number, reason: string): Promise<any> {
    const res = await http.post<{ success: boolean; data: any }>(
      `/purchase-orders/${poId}/cancel`,
      { reason }
    );
    return res.data.data;
  },

  async createPurchaseOrder(payload: {
    SupplierID: number;
    Note?: string;
    CreatedBy?: string;
    items: Array<{
      ProductID: number;
      BatchNumber: string;
      ExpiryDate: string;
      Quantity: number;
      ImportPrice: number;
    }>;
  }): Promise<PurchaseOrderRecord> {
    const res = await http.post<{ success: boolean; data: PurchaseOrderRecord }>(
      '/purchase-orders',
      payload
    );
    return res.data.data;
  },

  async getCustomers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
  }): Promise<CustomerRecord[]> {
    const res = await http.get<{ success: boolean; data: CustomerRecord[] }>('/customers', {
      params,
    });
    return res.data.data;
  },

  async createCustomer(payload: {
    FullName: string;
    Phone: string;
    Email?: string;
    BirthYear?: number;
    Gender?: string;
    Allergies?: string;
    ChronicCond?: string;
  }): Promise<CustomerRecord> {
    const res = await http.post<{ success: boolean; data: CustomerRecord }>('/customers', payload);
    return res.data.data;
  },

  async updateCustomer(
    customerId: number,
    payload: Partial<CustomerRecord>
  ): Promise<CustomerRecord> {
    const res = await http.put<{ success: boolean; data: CustomerRecord }>(
      `/customers/${customerId}`,
      payload
    );
    return res.data.data;
  },

  async getPayments(params?: {
    page?: number;
    limit?: number;
    search?: string;
    method?: string;
    status?: string;
  }): Promise<PaymentRecord[]> {
    const res = await http.get<{ success: boolean; data: PaymentRecord[] }>('/payments', {
      params,
    });
    return res.data.data;
  },

  async getPaymentsLedgerFull(params?: {
    page?: number;
    limit?: number;
    search?: string;
    method?: string;
    status?: string;
  }): Promise<{
    data: PaymentRecord[];
    summary?: {
      totalNet: number;
      totalVietQr: number;
      totalCashAndCard: number;
      totalRefunded: number;
      pendingVietQrCount?: number;
    };
    pagination?: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const res = await http.get<{
      success: boolean;
      data: PaymentRecord[];
      summary?: {
        totalNet: number;
        totalVietQr: number;
        totalCashAndCard: number;
        totalRefunded: number;
        pendingVietQrCount?: number;
      };
      pagination?: { page: number; limit: number; total: number; totalPages: number };
    }>('/payments', { params });
    return res.data;
  },

  async getStaff(): Promise<UserProfile[]> {
    const res = await http.get<{ success: boolean; data: UserProfile[] }>('/staff');
    return res.data.data;
  },

  async updateStaffRole(userId: number, Role: string): Promise<UserProfile> {
    const res = await http.patch<{ success: boolean; data: UserProfile }>(`/staff/${userId}/role`, {
      Role,
    });
    return res.data.data;
  },

  async checkDrugInteractions(payload: {
    productIds: number[];
    patientAllergies?: string;
  }): Promise<DrugInteractionResult> {
    const res = await http.post<{ success: boolean; data: DrugInteractionResult }>(
      '/drug-interactions',
      payload
    );
    return res.data.data;
  },

  async updateSupplier(
    supplierId: number,
    payload: Partial<SupplierRecord>
  ): Promise<SupplierRecord> {
    const res = await http.put<{ success: boolean; data: SupplierRecord }>(
      `/suppliers/${supplierId}`,
      payload
    );
    return res.data.data;
  },

  async deleteRecord(entity: string, id: number): Promise<number> {
    const res = await http.delete<{ success: boolean; data: { deletedCount: number } }>(
      `/${entity}/${id}`
    );
    return res.data.data.deletedCount;
  },

  async bulkDelete(entity: string, ids: number[]): Promise<number> {
    const res = await http.post<{ success: boolean; data: { deletedCount: number } }>(
      `/${entity}/bulk-delete`,
      { ids }
    );
    return res.data.data.deletedCount;
  },

  async cloneRecord(entity: string, id: number): Promise<number> {
    const res = await http.post<{ success: boolean; data: { clonedCount: number } }>(
      `/${entity}/${id}/clone`
    );
    return res.data.data.clonedCount;
  },

  async bulkClone(entity: string, ids: number[]): Promise<number> {
    const res = await http.post<{ success: boolean; data: { clonedCount: number } }>(
      `/${entity}/bulk-clone`,
      { ids }
    );
    return res.data.data.clonedCount;
  },

  getExportUrl(entity: string, format: 'xlsx' | 'json' | 'xml'): string {
    return `${API_BASE_URL}/enterprise/export/${entity}?format=${format}`;
  },

  async importFile(entity: string, file: File): Promise<number> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await http.post<{ success: boolean; data: { importedCount: number } }>(
      `/import/${entity}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return res.data.data.importedCount;
  },
};
