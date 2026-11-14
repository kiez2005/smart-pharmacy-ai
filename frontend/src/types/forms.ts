import { Product } from './product';

export interface UserProfile {
  UserID: number;
  FullName: string;
  Email: string;
  Phone?: string;
  Role: 'ADMIN' | 'PHARMACIST' | 'CASHIER' | 'CUSTOMER';
  CreateDate?: string;
}

export interface InvoiceItemRecord {
  ItemID: number;
  InvoiceID: number;
  ProductID: number;
  Quantity: number;
  Unit?: string;
  UnitPrice: number;
  BaseQuantityDeducted?: number;
  LooseUnitsDeducted?: number;
  DosageNote?: string;
  product: Product;
}

export interface PaymentRecord {
  PaymentID: number;
  InvoiceID: number;
  PaymentMethod: 'CASH' | 'VIETQR' | 'CARD' | 'CREDIT' | 'COD' | string;
  TransactionCode?: string;
  PaidAmount: number;
  Status: 'PAID' | 'REFUNDED' | 'PENDING' | 'PARTIAL' | string;
  PaymentDate: string;
  invoice?: {
    InvoiceID: number;
    InvoiceCode: string;
    OrderType?: string;
    Channel?: string;
    CustomerName: string;
    CustomerPhone?: string;
    Status: string;
  };
}

export interface CustomerRecord {
  CustomerID: number;
  CustomerCode: string;
  FullName: string;
  Phone: string;
  Email?: string;
  BirthYear?: number;
  Gender?: string;
  CustomerType?: 'RETAIL' | 'WHOLESALE' | string;
  CompanyName?: string;
  TaxCode?: string;
  Address?: string;
  CreditLimit?: number;
  DebtBalance?: number;
  Allergies?: string;
  ChronicCond?: string;
  LoyaltyPoints: number;
  CreateDate: string;
  invoices?: InvoiceRecord[];
}

export interface InvoiceRecord {
  InvoiceID: number;
  InvoiceCode: string;
  OrderType?: 'RETAIL' | 'WHOLESALE' | string;
  Channel?: 'POS' | 'ONLINE' | string;
  FulfillmentStatus?:
    | 'PENDING_REVIEW'
    | 'CONFIRMED'
    | 'PACKING'
    | 'SHIPPING'
    | 'DELIVERED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'REJECTED'
    | string;
  PaymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED' | 'VOID' | string;
  CustomerID?: number | null;
  CustomerName: string;
  CustomerPhone?: string;
  ShippingAddress?: string;
  ShippingMethod?: string;
  ShippingFee?: number;
  VatAmount?: number;
  PaidAmount?: number;
  DebtAmount?: number;
  RefundedAmount?: number;
  SubTotal?: number;
  Discount?: number;
  UsedPoints?: number;
  PointsDiscount?: number;
  PointsEarned?: number;
  TotalAmount: number;
  Status: 'COMPLETED' | 'CANCELLED' | 'PARTIAL' | 'DEBT' | string;
  Note?: string;
  CancelReason?: string;
  ClinicalOverrideCode?: string;
  ClinicalOverrideNote?: string;
  PrescriptionFileKey?: string | null;
  PrescriptionFileMime?: string | null;
  ApprovedByUserID?: number | null;
  ApprovedByName?: string | null;
  ApprovedAt?: string | null;
  CreateDate: string;
  customer?: CustomerRecord | null;
  items: InvoiceItemRecord[];
  payment?: PaymentRecord;
}

export interface ClinicalWarning {
  ruleId?: string;
  source?: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'HIGH' | 'MEDIUM' | 'LOW';
  category?: 'ALLERGY' | 'DUPLICATION' | 'INTERACTION' | 'CONTRAINDICATION';
  title: string;
  detail: string;
  recommendation: string;
}

export interface InventoryReservationRecord {
  ReservationID: number;
  OrderID: number;
  OrderItemID: number;
  ProductID: number;
  Unit: string;
  Quantity: number;
  BaseQtyReserved: number;
  LooseQtyReserved: number;
  Status: 'ACTIVE' | 'CONSUMED' | 'RELEASED' | 'EXPIRED';
  ExpiresAt: string;
  ReleasedAt?: string | null;
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
  BatchNumber?: string | null;
  ExpiryDate?: string | null;
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
  CustomerID?: number | null;
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
  PatientAllergies?: string | null;
  PrescriptionFileKey?: string | null;
  PrescriptionFileMime?: string | null;
  ReservedUntil?: string | null;
  ClinicalSafetyStatus: 'SAFE' | 'WARNING_REQUIRES_REVIEW' | 'APPROVED_WITH_OVERRIDE' | 'REJECTED';
  ClinicalWarningsJson?: string | null;
  clinicalWarnings?: ClinicalWarning[];
  ClinicalReviewNote?: string | null;
  ReviewedByUserID?: number | null;
  ReviewedByName?: string | null;
  ReviewedAt?: string | null;
  RejectCancelReason?: string | null;
  CourierTrackingCode?: string | null;
  InvoiceID?: number | null;
  CreateDate: string;
  UpdateDate?: string;
  customer?: CustomerRecord | null;
  invoice?: InvoiceRecord | null;
  items: OnlineOrderItemRecord[];
  reservations?: InventoryReservationRecord[];
}

export interface CreateOnlineOrderPayload {
  OrderType?: 'RETAIL' | 'WHOLESALE';
  CustomerName: string;
  CustomerPhone: string;
  ShippingAddress: string;
  ShippingMethod?: 'EXPRESS_2H' | 'STANDARD' | 'GDP_TRUCK';
  PaymentMethod?: 'COD' | 'VIETQR' | 'CREDIT';
  Note?: string;
  items: Array<{
    ProductID: number;
    Quantity: number;
    Unit?: string;
    DosageNote?: string;
  }>;
}

export interface CreateInvoicePayload {
  CustomerID?: number | null;
  CustomerName: string;
  CustomerPhone: string;
  OrderType?: 'RETAIL' | 'WHOLESALE';
  Channel?: 'POS' | 'ONLINE';
  ShippingAddress?: string;
  ShippingMethod?: string;
  ShippingFee?: number;
  VatRate?: number;
  PaidAmount?: number;
  Discount?: number;
  UsedPoints?: number;
  Note: string;
  ClinicalOverrideCode?: string;
  ClinicalOverrideNote?: string;
  PatientAllergies?: string;
  PrescriptionFileKey?: string;
  PaymentMethod: 'CASH' | 'VIETQR' | 'CARD' | 'CREDIT' | 'COD';
  items: Array<{
    ProductID: number;
    Quantity: number;
    Unit?: string;
    DosageNote: string;
  }>;
}

export interface ContactRecord {
  ContactID: number;
  FullName: string;
  Email: string;
  Phone: string;
  Subject: string;
  Message: string;
  ReplyNote?: string;
  Status: 'NEW' | 'REPLIED' | 'CLOSED';
  CreateDate: string;
}
