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
  RemainingQuantity: number;
  ImportPrice: number;
  Status: string;
}

export interface Product {
  ProductID: number;
  ProductName: string;
  PathImage: string;
  ProductType: string;
  Quantity: number;
  AvailableQuantity?: number;
  Unit: string;
  Price: number;
  Description: string;
  IsRx?: boolean;
  CreateDate: string;
  UpdateDate: string;
  packaging?: ProductPackaging | null;
  stockLots?: StockLotSummary[];
}

export type UnitMode = 'BASE' | 'BLISTER' | 'PILL' | 'CARTON';

export interface CartItem {
  product: Product;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitMode: UnitMode;
  dosageNote?: string;
}

export interface OnlineOrderItemRecord {
  OrderItemID: number;
  OrderID: number;
  ProductID: number;
  Quantity: number;
  Unit: string;
  UnitPrice: number;
  BaseQtyReserved: number;
  LooseQtyReserved: number;
  DosageNote?: string | null;
  product?: Product;
}

export interface OnlineOrderRecord {
  OrderID: number;
  OrderCode: string;
  TrackingToken: string;
  OrderType: 'RETAIL' | 'WHOLESALE';
  Status:
    | 'PENDING_REVIEW'
    | 'CONFIRMED'
    | 'PACKING'
    | 'SHIPPING'
    | 'DELIVERED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'EXPIRED';
  PaymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED' | 'VOID';
  PaymentMethod: 'COD' | 'VIETQR' | 'CREDIT';
  CustomerName: string;
  CustomerPhone: string;
  ShippingAddress: string;
  ShippingMethod: 'EXPRESS_2H' | 'STANDARD' | 'GDP_TRUCK';
  SubTotal: number;
  ShippingFee: number;
  VatAmount: number;
  Discount: number;
  TotalAmount: number;
  PaidAmount: number;
  Note?: string | null;
  ReservedUntil?: string | null;
  CourierTrackingCode?: string | null;
  RejectCancelReason?: string | null;
  ClinicalReviewNote?: string | null;
  ReviewedByName?: string | null;
  CreateDate: string;
  items: OnlineOrderItemRecord[];
}
