import { Product } from '@prisma/client';
import { z } from 'zod';

// ============================================================================
// ZOD SCHEMAS KIỂM DUYỆT DỮ LIỆU ĐẦU VÀO (VALIDATION)
// ============================================================================

export const productInputSchema = z.object({
  ProductName: z.string().trim().min(2, 'Tên thuốc phải có ít nhất 2 ký tự'),
  PathImage: z
    .string()
    .trim()
    .optional()
    .default('https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80'),
  ProductType: z.string().trim().min(1, 'Vui lòng chọn nhóm thuốc'),
  Quantity: z.coerce.number().int().min(0, 'Số lượng tồn kho không được âm'),
  Unit: z.string().trim().min(1, 'Vui lòng nhập đơn vị tính (Hộp, Vỉ, Viên, Chai...)'),
  Price: z.coerce.number().min(0, 'Đơn giá không được âm'),
  Description: z.string().trim().optional().default(''),
});

export const bulkIdsSchema = z.object({
  ids: z
    .array(z.coerce.number().int().positive())
    .min(1, 'Vui lòng chọn ít nhất 1 bản ghi từ ô checkbox'),
});

export type ProductInputDTO = z.infer<typeof productInputSchema>;
export type ProductUpdateDTO = Partial<ProductInputDTO>;

export type ExportFormat = 'xlsx' | 'json' | 'xml';

export interface ProductQueryParams {
  page: number;
  limit: number;
  search: string;
  type: string;
  unit: string;
  sortBy: keyof Product;
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedProductResponse {
  items: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    types: string[];
    units: string[];
  };
  searchMeta?: {
    engine: 'meilisearch' | 'fuse-fuzzy' | 'prisma-sql';
    processingTimeMs: number;
  };
}
