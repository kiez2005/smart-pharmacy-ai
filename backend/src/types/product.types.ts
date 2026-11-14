import { Product } from '@prisma/client';
import { z } from 'zod';
import { isValidFutureIsoDate } from '../utils/date.util';

// ============================================================================
// ZOD SCHEMAS KIỂM DUYỆT DỮ LIỆU ĐẦU VÀO (VALIDATION)
// ============================================================================

export const productInputBaseSchema = z.object({
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
  InitialBatchNumber: z.string().trim().optional(),
  InitialExpiryDate: z.string().trim().optional(),
});

export const productInputSchema = productInputBaseSchema.superRefine((data, ctx) => {
  if (data.Quantity > 0) {
    if (!data.InitialBatchNumber || data.InitialBatchNumber.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['InitialBatchNumber'],
        message:
          'Khi tạo mới sản phẩm có tồn kho > 0, bắt buộc nhập Số lô sản xuất thật (tối thiểu 2 ký tự) hoặc đặt Số lượng = 0 để nhập qua Phiếu nhập kho.',
      });
    }
    if (!isValidFutureIsoDate(data.InitialExpiryDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['InitialExpiryDate'],
        message:
          'Khi tạo mới sản phẩm có tồn kho > 0, bắt buộc nhập Hạn sử dụng hợp lệ còn hạn (YYYY-MM-DD).',
      });
    }
  }
});

export const productUpdateSchema = productInputBaseSchema
  .omit({ InitialBatchNumber: true, InitialExpiryDate: true })
  .partial();

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
