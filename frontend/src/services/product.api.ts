import axios from 'axios';
import { ExportFormat, Product, ProductFormValues, ProductListResponse } from '../types/product';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export interface FetchProductsParams {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  unit?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const productApi = {
  // #1 & #6: Phân trang (10-15 item/page) + Tìm kiếm thông minh
  async list(params: FetchProductsParams): Promise<ProductListResponse> {
    const res = await http.get<{ success: boolean; data: ProductListResponse }>('/products', {
      params,
    });
    return res.data.data;
  },

  // #4: Xem chi tiết 1 sản phẩm
  async getById(id: number): Promise<Product> {
    const res = await http.get<{ success: boolean; data: Product }>(`/products/${id}`);
    return res.data.data;
  },

  // #2: Thêm mới sản phẩm
  async create(payload: ProductFormValues): Promise<Product> {
    const res = await http.post<{ success: boolean; data: Product }>('/products', payload);
    return res.data.data;
  },

  // #3: Cập nhật sản phẩm
  async update(id: number, payload: Partial<ProductFormValues>): Promise<Product> {
    const res = await http.put<{ success: boolean; data: Product }>(`/products/${id}`, payload);
    return res.data.data;
  },

  // #5a: Xóa 1 sản phẩm
  async removeOne(id: number): Promise<void> {
    await http.delete(`/products/${id}`);
  },

  // #5b: Xóa nhiều sản phẩm từ ô Checkbox
  async bulkRemove(ids: number[]): Promise<number> {
    const res = await http.post<{ success: boolean; data: { deletedCount: number } }>(
      '/products/bulk-delete',
      { ids }
    );
    return res.data.data.deletedCount;
  },

  // #7: Sao chép 1 bản ghi
  async cloneOne(id: number): Promise<Product> {
    const res = await http.post<{ success: boolean; data: Product }>(`/products/${id}/clone`);
    return res.data.data;
  },

  // #8: Sao chép nhiều bản ghi từ ô Checkbox
  async bulkClone(ids: number[]): Promise<Product[]> {
    const res = await http.post<{ success: boolean; data: Product[] }>('/products/bulk-clone', {
      ids,
    });
    return res.data.data;
  },

  // #9a: URL tải xuống file Export (.xlsx, .json, .xml)
  getExportUrl(format: ExportFormat): string {
    return `${API_BASE_URL}/products/export?format=${format}`;
  },

  // #9b: Tải lên file Import (.xlsx, .json, .xml)
  async importFile(file: File): Promise<number> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await http.post<{ success: boolean; data: { importedCount: number } }>(
      '/products/import',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data.data.importedCount;
  },
};
