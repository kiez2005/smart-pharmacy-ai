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
  UnitPrice: number;
  DosageNote?: string;
  product: Product;
}

export interface PaymentRecord {
  PaymentID: number;
  InvoiceID: number;
  PaymentMethod: 'CASH' | 'VIETQR' | 'CARD';
  TransactionCode?: string;
  PaidAmount: number;
  Status: 'PAID' | 'REFUNDED' | string;
  PaymentDate: string;
  invoice?: {
    InvoiceID: number;
    InvoiceCode: string;
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
  Allergies?: string;
  ChronicCond?: string;
  LoyaltyPoints: number;
  CreateDate: string;
  invoices?: InvoiceRecord[];
}

export interface InvoiceRecord {
  InvoiceID: number;
  InvoiceCode: string;
  CustomerID?: number | null;
  CustomerName: string;
  CustomerPhone?: string;
  SubTotal?: number;
  Discount?: number;
  TotalAmount: number;
  Status: 'COMPLETED' | 'CANCELLED' | string;
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
  Discount?: number;
  Note: string;
  PaymentMethod: 'CASH' | 'VIETQR' | 'CARD';
  items: Array<{
    ProductID: number;
    Quantity: number;
    UnitMode?: 'BASE' | 'BLISTER' | 'PILL';
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
