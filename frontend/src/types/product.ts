export interface ProductPackaging {
  PackagingID: number;
  ProductID: number;
  PackageUnit: string;
  BlisterUnit?: string | null;
  BlistersPerPackage?: number | null;
  SmallestUnit: string;
  UnitsPerPackage: number;
  UnitsPerBlister?: number | null;
  LooseUnits: number;
  AllowFractionalSale: boolean;
}

// Kiểu dữ liệu chuẩn 10 trường bắt buộc của bảng Product theo Sheet "Yêu cầu bài tập lớn"
export interface Product {
  ProductID: number;
  ProductName: string;
  PathImage: string;
  ProductType: string;
  Quantity: number;
  Unit: string;
  Price: number;
  Description: string;
  CreateDate: string;
  UpdateDate: string;
  packaging?: ProductPackaging | null;
}

export interface ProductFormValues {
  ProductName: string;
  PathImage: string;
  ProductType: string;
  Quantity: number;
  Unit: string;
  Price: number;
  Description: string;
}

export type ExportFormat = 'xlsx' | 'json' | 'xml';

export interface ProductListResponse {
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
