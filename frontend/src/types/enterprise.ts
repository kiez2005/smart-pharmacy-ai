import { Product } from './product';
import { CustomerRecord, PaymentRecord, UserProfile } from './forms';

export interface DashboardAnalytics {
  totalRevenue: number;
  totalPurchaseCost: number;
  totalInventoryValue: number;
  totalProducts: number;
  totalStockUnits: number;
  lowStockProducts: Product[];
  outOfStockCount: number;
  totalCustomers: number;
  completedInvoicesCount: number;
  categoryBreakdown: Array<{
    type: string;
    count: number;
    quantity: number;
    value: number;
  }>;
  topSelling: Array<{
    ProductID: number;
    ProductName: string;
    Unit: string;
    soldQty: number;
    revenue: number;
  }>;
}

export interface SupplierRecord {
  SupplierID: number;
  SupplierCode: string;
  SupplierName: string;
  ContactPerson?: string;
  Phone: string;
  Email?: string;
  TaxCode?: string;
  Address?: string;
  Status: string;
  CreateDate: string;
}

export interface PurchaseOrderItemRecord {
  POItemID: number;
  POID: number;
  ProductID: number;
  BatchNumber: string;
  ExpiryDate: string;
  Quantity: number;
  ImportPrice: number;
  product: Product;
}

export interface PurchaseOrderRecord {
  POID: number;
  POCode: string;
  SupplierID: number;
  TotalCost: number;
  Status: string;
  Note?: string;
  CreatedBy?: string;
  CreateDate: string;
  supplier: SupplierRecord;
  items: PurchaseOrderItemRecord[];
}

export interface ProductStockCardResponse {
  product: Product;
  imports: Array<{
    POItemID: number;
    BatchNumber: string;
    ExpiryDate: string;
    Quantity: number;
    ImportPrice: number;
    purchaseOrder: {
      POCode: string;
      CreateDate: string;
      supplier: SupplierRecord;
    };
  }>;
  exports: Array<{
    ItemID: number;
    Quantity: number;
    Unit?: string;
    BaseQuantityDeducted?: number;
    LooseUnitsDeducted?: number;
    UnitPrice: number;
    DosageNote?: string;
    invoice: {
      InvoiceCode: string;
      OrderType?: string;
      Channel?: string;
      CustomerName: string;
      Status: string;
      CreateDate: string;
    };
  }>;
}

export interface DrugInteractionResult {
  checkedProductsCount: number;
  patientAllergies?: string;
  isSafe: boolean;
  isAdvisoryOnly?: boolean;
  disclaimer?: string;
  ruleVersion?: string;
  warnings: Array<{
    ruleId?: string;
    source?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    category?: 'ALLERGY' | 'DUPLICATE_INGREDIENT' | 'DRUG_INTERACTION' | 'DOSAGE_WARNING';
    title: string;
    detail: string;
    recommendation: string;
  }>;
}

export type { CustomerRecord, PaymentRecord, UserProfile };
