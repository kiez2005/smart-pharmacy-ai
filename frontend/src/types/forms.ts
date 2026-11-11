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
  FulfillmentStatus?: 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED' | string;
  CustomerID?: number | null;
  CustomerName: string;
  CustomerPhone?: string;
  ShippingAddress?: string;
  ShippingMethod?: string;
  ShippingFee?: number;
  VatAmount?: number;
  PaidAmount?: number;
  DebtAmount?: number;
  SubTotal?: number;
  Discount?: number;
  UsedPoints?: number;
  PointsDiscount?: number;
  PointsEarned?: number;
  TotalAmount: number;
  Status: 'COMPLETED' | 'CANCELLED' | 'PARTIAL' | 'DEBT' | string;
  Note?: string;
  CreateDate: string;
  customer?: CustomerRecord | null;
  items: InvoiceItemRecord[];
  payment?: PaymentRecord;
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
