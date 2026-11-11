export interface ProductPackaging {
  PackagingID: number;
  ProductID: number;
  PackageUnit: string;
  CartonUnit?: string | null;
  BoxesPerCarton?: number;
  BlisterUnit?: string | null;
  BlistersPerPackage?: number | null;
  SmallestUnit: string;
  UnitsPerPackage: number;
  UnitsPerBlister?: number | null;
  LooseUnits: number;
  ReservedBaseQty?: number;
  ReservedLooseUnits?: number;
  Version?: number;
  AllowFractionalSale: boolean;
  WholesalePrice?: number | null;
  MinWholesaleQty?: number;
}

export interface StockLotSummary {
  LotID: number;
  ProductID: number;
  BatchNumber: string;
  ExpiryDate: string;
  InitialQuantity: number;
  RemainingQuantity: number;
  ImportPrice: number;
  Status: string;
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
  stockLots?: StockLotSummary[];
}

export interface ProductFormValues {
  ProductName: string;
  PathImage: string;
  ProductType: string;
  Quantity: number;
  Unit: string;
  Price: number;
  Description: string;
  packaging?: Partial<ProductPackaging>;
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
