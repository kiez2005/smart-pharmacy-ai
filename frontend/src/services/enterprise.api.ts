import axios from 'axios';
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

const http = axios.create({
  baseURL: `${API_BASE_URL}/enterprise`,
  timeout: 15000,
});

export const enterpriseApi = {
  async getDashboard(): Promise<DashboardAnalytics> {
    const res = await http.get<{ success: boolean; data: DashboardAnalytics }>('/dashboard');
    return res.data.data;
  },

  async getProductStockCard(productId: number): Promise<ProductStockCardResponse> {
    const res = await http.get<{ success: boolean; data: ProductStockCardResponse }>(
      `/products/${productId}/stock-card`
    );
    return res.data.data;
  },

  async getSuppliers(): Promise<SupplierRecord[]> {
    const res = await http.get<{ success: boolean; data: SupplierRecord[] }>('/suppliers');
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

  async getPurchaseOrders(): Promise<PurchaseOrderRecord[]> {
    const res = await http.get<{ success: boolean; data: PurchaseOrderRecord[] }>(
      '/purchase-orders'
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

  async getCustomers(): Promise<CustomerRecord[]> {
    const res = await http.get<{ success: boolean; data: CustomerRecord[] }>('/customers');
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

  async getPayments(): Promise<PaymentRecord[]> {
    const res = await http.get<{ success: boolean; data: PaymentRecord[] }>('/payments');
    return res.data.data;
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
