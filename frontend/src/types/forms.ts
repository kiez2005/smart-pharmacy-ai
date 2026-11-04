import { Product } from './product';

export interface UserProfile {
  UserID: number;
  FullName: string;
  Email: string;
  Phone?: string;
  Role: 'ADMIN' | 'PHARMACIST' | 'CUSTOMER';
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
  Status: string;
  PaymentDate: string;
}

export interface InvoiceRecord {
  InvoiceID: number;
  InvoiceCode: string;
  CustomerName: string;
  CustomerPhone?: string;
  Note?: string;
  TotalAmount: number;
  Status: string;
  CreateDate: string;
  items: InvoiceItemRecord[];
  payment?: PaymentRecord;
}

export interface CreateInvoicePayload {
  CustomerName: string;
  CustomerPhone: string;
  Note: string;
  PaymentMethod: 'CASH' | 'VIETQR' | 'CARD';
  items: Array<{
    ProductID: number;
    Quantity: number;
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
