export interface PublicProductPackaging {
  PackageUnit: string;
  BlisterUnit?: string | null;
  BlistersPerPackage?: number | null;
  SmallestUnit: string;
  UnitsPerPackage: number;
  UnitsPerBlister?: number | null;
  AllowFractionalSale: boolean;
}

export interface Product {
  ProductID: number;
  ProductName: string;
  PathImage: string;
  ProductType: string;
  Unit: string;
  Price: number;
  Description: string;
  IsRx?: boolean;
  StockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  InStock?: boolean;
  MaxOrderQty?: number;
  // Optional fallback fields (not emitted by sanitized catalog endpoint)
  Quantity?: number;
  AvailableQuantity?: number;
  packaging?: PublicProductPackaging | null;
}

export type UnitMode = 'BASE' | 'BLISTER' | 'PILL';

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
  TrackingToken?: string;
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
  PaymentMethod: 'COD' | 'VIETQR';
  CustomerName: string;
  CustomerPhone: string;
  ShippingAddress: string;
  ShippingMethod: 'EXPRESS_2H' | 'STANDARD';
  PatientAllergies?: string | null;
  PrescriptionFileKey?: string | null;
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
