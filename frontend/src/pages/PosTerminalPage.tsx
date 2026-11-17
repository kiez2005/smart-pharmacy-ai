import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  QrCode,
  Banknote,
  CreditCard,
  AlertTriangle,
  ShieldCheck,
  UserCheck,
  CheckCircle2,
  Printer,
  Sparkles,
  CalendarClock,
  Building2,
  PackageCheck,
  FileSpreadsheet,
  Lock,
  Upload,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { productApi } from '../services/product.api';
import { CLINICAL_OVERRIDE_REASONS, formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';
import { Product } from '../types/product';
import { CustomerRecord, DrugInteractionResult } from '../types/enterprise';
import { InvoiceRecord } from '../types/forms';
import { ModalPortal } from '../components/common/ModalPortal';
import type { OcrTransferMeta } from './PrescriptionOcrPage';

export type RetailUnitMode = 'CARTON' | 'BASE' | 'BLISTER' | 'PILL';

export interface PosCartItem {
  product: Product;
  quantity: number;
  dosageNote: string;
  unitMode?: RetailUnitMode;
}

interface PosTerminalPageProps {
  initialCartItems?: PosCartItem[];
  initialOcrMeta?: OcrTransferMeta;
  onClearInitialCart?: () => void;
  onNavigateToInvoices?: () => void;
}

export const PosTerminalPage: React.FC<PosTerminalPageProps> = ({
  initialCartItems,
  initialOcrMeta,
  onClearInitialCart,
  onNavigateToInvoices,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Giỏ hàng POS hỗ trợ Đa đơn vị quy đổi (Hộp / Vỉ / Viên lẻ)
  const [cart, setCart] = useState<PosCartItem[]>([]);

  // Chế độ Bán hàng: Bán Lẻ POS (GPP) hoặc Xuất Bán Buôn Đại Lý B2B (GDP)
  const [orderType, setOrderType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [includeVat, setIncludeVat] = useState<boolean>(false);
  const [paidAmountInput, setPaidAmountInput] = useState<number>(0);

  // Thông tin Bệnh nhân / Đại lý & Thanh toán
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState<string>('Khách vãng lai');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [usedPoints, setUsedPoints] = useState<number>(0);
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'VIETQR' | 'CASH' | 'CARD' | 'CREDIT'>('VIETQR');
  const [note, setNote] = useState<string>('Tư vấn uống đúng liều, tránh rượu bia');
  const [clinicalOverrideCode, setClinicalOverrideCode] = useState<string>('');
  const [clinicalOverrideNote, setClinicalOverrideNote] = useState<string>('');
  const [walkInAllergies, setWalkInAllergies] = useState<string>('');
  const [prescriptionFileKey, setPrescriptionFileKey] = useState<string>('');
  const [prescriptionFileName, setPrescriptionFileName] = useState<string>('');
  const [prescriptionUploading, setPrescriptionUploading] = useState<boolean>(false);
  const [activeOcrMeta, setActiveOcrMeta] = useState<OcrTransferMeta | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const hasRxInCart = useMemo(
    () => cart.some((item) => Boolean(item.product.packaging?.IsRx)),
    [cart]
  );

  useEffect(() => {
    if (!hasRxInCart) {
      setPrescriptionFileKey('');
      setPrescriptionFileName('');
      setActiveOcrMeta(null);
    }
  }, [hasRxInCart]);

  const canOverrideClinical = useMemo(() => {
    try {
      const raw = localStorage.getItem('pharmacore_user');
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { Role?: string };
      return parsed.Role === 'ADMIN' || parsed.Role === 'PHARMACIST';
    } catch {
      return false;
    }
  }, []);

  // Cảnh báo Dị ứng & Tương tác thuốc tự động
  const [interactionCheck, setInteractionCheck] = useState<DrugInteractionResult | null>(null);

  // Hóa đơn vừa xuất thành công (hiển thị VietQR / Phiếu in)
  const [completedInvoice, setCompletedInvoice] = useState<InvoiceRecord | null>(null);

  const loadPosData = async () => {
    try {
      const [prodRes, custRes] = await Promise.all([
        productApi.list({ page: 1, limit: 100 }),
        enterpriseApi.getCustomers(),
      ]);
      setProducts(prodRes.items);
      setCustomers(custRes);
    } catch {
      toast.error('Không thể tải dữ liệu quầy thu ngân POS');
    }
  };

  useEffect(() => {
    void loadPosData();
  }, []);

  useEffect(() => {
    if (initialCartItems && initialCartItems.length > 0) {
      setCart(initialCartItems.map((i) => ({ ...i, unitMode: i.unitMode || 'BASE' })));
      if (initialOcrMeta) {
        setActiveOcrMeta(initialOcrMeta);
      }
      toast.success(`Đã nạp ${initialCartItems.length} thuốc từ Đơn thuốc OCR đã xác nhận vào Quầy POS!`);
      onClearInitialCart?.();
    }
  }, [initialCartItems, initialOcrMeta, onClearInitialCart]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.CustomerID === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  // Tự động kiểm tra tương tác thuốc & tiền sử dị ứng của bệnh nhân mỗi khi giỏ hàng hoặc bệnh nhân thay đổi
  useEffect(() => {
    const checkSafety = async () => {
      if (cart.length === 0) {
        setInteractionCheck(null);
        return;
      }
      try {
        const res = await enterpriseApi.checkDrugInteractions({
          productIds: cart.map((c) => c.product.ProductID),
          patientAllergies: selectedCustomer?.Allergies || walkInAllergies.trim() || '',
        });
        setInteractionCheck(res);
      } catch {
        // Ignore silent check error
      }
    };
    void checkSafety();
  }, [cart, selectedCustomer, walkInAllergies]);

  const handleSelectCustomer = (cid: number | null) => {
    setSelectedCustomerId(cid);
    if (!cid) {
      setCustomerName('Khách vãng lai');
      setCustomerPhone('');
      return;
    }
    const found = customers.find((c) => c.CustomerID === cid);
    if (found) {
      setCustomerName(found.FullName);
      setCustomerPhone(found.Phone);
    }
  };

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.ProductType));
    return ['ALL', ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'ALL' || p.ProductType === selectedCategory;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        p.ProductName.toLowerCase().includes(q) ||
        p.Description.toLowerCase().includes(q) ||
        String(p.ProductID).includes(q);
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, search]);

  const getPackagingSpec = (product: Product) => {
    const pkg = product.packaging;
    const isBox = product.Unit === 'Hộp';
    return {
      PackageUnit: pkg?.PackageUnit || product.Unit,
      CartonUnit: pkg?.CartonUnit || 'Thùng',
      BoxesPerCarton: pkg?.BoxesPerCarton || 20,
      BlisterUnit: pkg?.BlisterUnit ?? (isBox ? 'Vỉ' : null),
      BlistersPerPackage: pkg?.BlistersPerPackage ?? (isBox ? 10 : null),
      SmallestUnit: pkg?.SmallestUnit || (isBox ? 'Viên' : product.Unit),
      UnitsPerPackage: pkg?.UnitsPerPackage || (isBox ? 100 : 1),
      UnitsPerBlister: pkg?.UnitsPerBlister ?? (isBox ? 10 : null),
      LooseUnits: pkg?.LooseUnits || 0,
      ReservedBaseQty: pkg?.ReservedBaseQty || 0,
      ReservedLooseUnits: pkg?.ReservedLooseUnits || 0,
      AllowFractionalSale: pkg?.AllowFractionalSale ?? isBox,
      WholesalePrice: pkg?.WholesalePrice ?? Math.round((product.Price * 0.88) / 500) * 500,
      MinWholesaleQty: pkg?.MinWholesaleQty ?? 10,
    };
  };

  const getEffectivePrice = (
    product: Product,
    mode: RetailUnitMode = 'BASE',
    qty: number = 1
  ) => {
    const spec = getPackagingSpec(product);
    if (mode === 'CARTON') {
      return Math.round(spec.WholesalePrice * spec.BoxesPerCarton * 0.96);
    }
    if (mode === 'BLISTER' && spec.BlistersPerPackage && spec.BlistersPerPackage > 1) {
      return Math.max(1000, Math.round(product.Price / spec.BlistersPerPackage));
    }
    if (mode === 'PILL' && spec.UnitsPerPackage > 1) {
      return Math.max(500, Math.round(product.Price / spec.UnitsPerPackage));
    }
    if (orderType === 'WHOLESALE' || qty >= spec.MinWholesaleQty) {
      return spec.WholesalePrice;
    }
    return product.Price;
  };

  const getUnitName = (product: Product, mode: RetailUnitMode = 'BASE') => {
    const spec = getPackagingSpec(product);
    if (mode === 'CARTON') return spec.CartonUnit || 'Thùng';
    if (mode === 'BLISTER') return spec.BlisterUnit || 'Vỉ';
    if (mode === 'PILL') return spec.SmallestUnit || 'Viên';
    return spec.PackageUnit || product.Unit;
  };

  const getUnitLabel = (product: Product, mode: RetailUnitMode = 'BASE') => {
    const spec = getPackagingSpec(product);
    if (mode === 'CARTON') {
      return `${spec.CartonUnit || 'Thùng'} (${spec.BoxesPerCarton} ${product.Unit})`;
    }
    if (mode === 'BLISTER') {
      return `${spec.BlisterUnit || 'Vỉ'} (${spec.UnitsPerBlister || 10} ${spec.SmallestUnit || 'Viên'})`;
    }
    if (mode === 'PILL') {
      return `${spec.SmallestUnit || 'Viên'} lẻ`;
    }
    return `${spec.PackageUnit || product.Unit}`;
  };

  const getMaxStockForMode = (product: Product, mode: RetailUnitMode = 'BASE') => {
    const spec = getPackagingSpec(product);
    const availBase = Math.max(0, product.Quantity - (spec.ReservedBaseQty || 0));
    const availLoose = Math.max(0, (spec.LooseUnits || 0) - (spec.ReservedLooseUnits || 0));
    if (mode === 'CARTON') {
      return Math.floor(availBase / (spec.BoxesPerCarton || 20));
    }
    const totalSmallestUnits = availBase * spec.UnitsPerPackage + availLoose;
    if (mode === 'BLISTER' && spec.UnitsPerBlister && spec.UnitsPerBlister > 0) {
      return Math.floor(totalSmallestUnits / spec.UnitsPerBlister);
    }
    if (mode === 'PILL' && spec.UnitsPerPackage) {
      return totalSmallestUnits;
    }
    return availBase;
  };

  const hasSellableStock = (product: Product) =>
    getMaxStockForMode(product, 'PILL') > 0 || product.Quantity > 0;

  const addToCart = (product: Product, defaultMode: RetailUnitMode = 'BASE', customNote?: string) => {
    if (!hasSellableStock(product)) {
      toast.error(`"${product.ProductName}" đã hết tồn kho (0 ${product.Unit}), không thể xuất bán!`);
      return;
    }
    const maxStock = getMaxStockForMode(product, defaultMode);
    setCart((prev) => {
      const existing = prev.find((i) => i.product.ProductID === product.ProductID);
      if (existing) {
        if (existing.quantity + 1 > maxStock) {
          toast.warning(`Không thể thêm: Đã đạt giới hạn tồn kho khả dụng (${maxStock} ${getUnitLabel(product, existing.unitMode)})`);
          return prev;
        }
        return prev.map((i) =>
          i.product.ProductID === product.ProductID ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          dosageNote: customNote || 'Ngày uống 2 lần, mỗi lần 1 viên sau ăn',
          unitMode: defaultMode,
        },
      ];
    });
  };

  const handleSwitchMode = (mode: 'RETAIL' | 'WHOLESALE') => {
    setOrderType(mode);
    if (mode === 'WHOLESALE') {
      const firstAgency = customers.find((c) => c.CustomerType === 'WHOLESALE');
      if (firstAgency) {
        setSelectedCustomerId(firstAgency.CustomerID);
        setCustomerName(firstAgency.CompanyName || firstAgency.FullName);
        setCustomerPhone(firstAgency.Phone);
      }
      setIncludeVat(true);
      setNote('Xuất bán buôn đại lý đạt chuẩn GDP - Kèm phiếu kiểm nghiệm lô');
    } else {
      setSelectedCustomerId(null);
      setCustomerName('Khách vãng lai');
      setCustomerPhone('');
      setIncludeVat(false);
      if (paymentMethod === 'CREDIT') setPaymentMethod('VIETQR');
      setNote('Tư vấn uống đúng liều, tránh rượu bia');
    }
  };

  // Combo Cắt Liều Mẫu chuẩn nhà thuốc thương mại & Combo Xuất Buôn B2B
  const applyComboPack = (comboType: 'FLU' | 'STOMACH' | 'IMMUNE' | 'B2B_AGENCY' | 'B2B_CLINIC') => {
    if (products.length === 0) return;
    if (comboType === 'B2B_AGENCY') {
      const slice = products.slice(0, 3);
      setCart(
        slice.map((p) => ({
          product: p,
          quantity: 10,
          unitMode: 'BASE',
          dosageNote: 'Xuất sỉ đại lý 10 Hộp nguyên niêm phong nhà sản xuất',
        }))
      );
      toast.success('Đã nạp Đơn sỉ mẫu Quầy thuốc Liên kết (3 mặt hàng × 10 Hộp)');
      return;
    }
    if (comboType === 'B2B_CLINIC') {
      const slice = products.slice(0, 2);
      setCart(
        slice.map((p) => ({
          product: p,
          quantity: 1,
          unitMode: 'CARTON',
          dosageNote: 'Xuất nguyên Thùng (20 Hộp) kèm COA kiểm nghiệm lô',
        }))
      );
      toast.success('Đã nạp Đơn sỉ Phòng khám Đa khoa (2 mặt hàng × 1 Thùng)');
      return;
    }
    if (comboType === 'FLU') {
      const slice = products.slice(0, 2);
      setCart(
        slice.map((p) => ({
          product: p,
          quantity: 1,
          unitMode: 'BLISTER',
          dosageNote: 'Combo Cảm cúm 3 ngày: Sáng 1 viên, Tối 1 viên sau ăn no',
        }))
      );
      toast.success('Đã nạp Combo Cắt liều Cảm cúm - Hạ sốt (3 ngày)');
    } else if (comboType === 'STOMACH') {
      const slice = products.slice(2, 4).length > 0 ? products.slice(2, 4) : products.slice(0, 2);
      setCart(
        slice.map((p) => ({
          product: p,
          quantity: 1,
          unitMode: 'BASE',
          dosageNote: 'Combo Dạ dày: Uống trước bữa ăn sáng 30 phút',
        }))
      );
      toast.success('Đã nạp Combo Điều trị Đau dạ dày - Trào ngược');
    } else {
      const slice = products.slice(-2);
      setCart(
        slice.map((p) => ({
          product: p,
          quantity: 1,
          unitMode: 'BASE',
          dosageNote: 'Combo Tăng đề kháng: Hòa tan 1 viên sủi vào 200ml nước sau ăn sáng',
        }))
      );
      toast.success('Đã nạp Combo Bổ sung Vitamin & Tăng đề kháng');
    }
  };

  const updateCartQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.ProductID !== productId) return item;
          const nextQty = item.quantity + delta;
          const maxStock = getMaxStockForMode(item.product, item.unitMode);
          if (nextQty > maxStock) {
            toast.warning(`Vượt quá tồn kho khả dụng (${maxStock} ${getUnitLabel(item.product, item.unitMode)})`);
            return item;
          }
          return nextQty > 0 ? { ...item, quantity: nextQty } : null;
        })
        .filter((i): i is PosCartItem => Boolean(i))
    );
  };

  const updateUnitMode = (productId: number, mode: RetailUnitMode) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.ProductID !== productId) return item;
        const maxStock = getMaxStockForMode(item.product, mode);
        const nextQty = Math.min(item.quantity, maxStock);
        return { ...item, unitMode: mode, quantity: Math.max(1, nextQty) };
      })
    );
  };

  const subTotal = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const mode = item.unitMode || 'BASE';
        const price = getEffectivePrice(item.product, mode, item.quantity);
        return sum + price * item.quantity;
      }, 0),
    [cart, orderType]
  );

  const maxRedeemablePoints = selectedCustomer
    ? Math.min(selectedCustomer.LoyaltyPoints, Math.floor(subTotal / 1000))
    : 0;
  const pointDiscount = (usedPoints || 0) * 1000;
  const maxAllowedCashDiscount = Math.max(0, subTotal - pointDiscount);
  const netAfterDiscount = Math.max(0, subTotal - (discount + pointDiscount));
  const vatAmount = includeVat ? Math.round(netAfterDiscount * 0.05) : 0;
  const finalTotal = netAfterDiscount + vatAmount;
  const changeAmount = Math.max(0, cashTendered - finalTotal);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error('Giỏ thuốc đang trống');
      return;
    }
    if (discount < 0) {
      toast.error('Số tiền chiết khấu không được âm!');
      return;
    }
    if (discount + pointDiscount > subTotal) {
      toast.error(
        `Tổng giảm giá (${formatVND(discount + pointDiscount)}) không được vượt quá tổng tiền hàng (${formatVND(subTotal)})!`
      );
      return;
    }
    if (selectedCustomer && usedPoints > selectedCustomer.LoyaltyPoints) {
      toast.error(
        `Bệnh nhân chỉ có ${selectedCustomer.LoyaltyPoints} điểm, không đủ để quy đổi ${usedPoints} điểm!`
      );
      return;
    }
    if (paymentMethod === 'CREDIT' && !selectedCustomerId) {
      toast.error('Vui lòng chọn Hồ sơ Đại lý / Khách hàng để ghi nhận công nợ!');
      return;
    }

    if (hasRxInCart && !canOverrideClinical) {
      toast.error(
        'Giỏ hàng có thuốc kê đơn (Rx). Tài khoản Thu ngân (CASHIER) không được phép xuất bán thuốc Rx — vui lòng mời Dược sĩ hoặc Admin!'
      );
      return;
    }
    if (hasRxInCart && !prescriptionFileKey) {
      toast.error(
        'Giỏ hàng có thuốc kê đơn (Rx). Bắt buộc tải ảnh toa thuốc bác sĩ trước khi hoàn tất hóa đơn!'
      );
      return;
    }

    const hasCriticalWarnings = Boolean(
      interactionCheck?.warnings &&
        interactionCheck.warnings.some(
          (w) => w.severity === 'HIGH' || w.severity === 'CRITICAL'
        )
    );
    if (hasCriticalWarnings && !canOverrideClinical) {
      toast.error(
        'Đơn thuốc có cảnh báo tương tác / dị ứng nghiêm trọng. Tài khoản Thu ngân (CASHIER) không được phép vượt quyền — vui lòng mời Dược sĩ hoặc Admin thẩm định!'
      );
      return;
    }
    if (hasCriticalWarnings && (!clinicalOverrideCode || clinicalOverrideNote.trim().length < 10)) {
      toast.error(
        'Dược sĩ bắt buộc phải chọn mã lý do thẩm định và ghi chú chuyên môn tối thiểu 10 ký tự khi xuất đơn có cảnh báo!'
      );
      return;
    }

    // Ràng buộc kiểm tra nghiêm ngặt: Tuyệt đối không cho thanh toán nếu có mặt hàng vượt tồn kho hoặc bằng 0
    for (const item of cart) {
      if (!hasSellableStock(item.product)) {
        toast.error(`Thuốc "${item.product.ProductName}" đã hết tồn kho (0 ${item.product.Unit}). Vui lòng xóa khỏi giỏ.`);
        return;
      }
      const maxAllowed = getMaxStockForMode(item.product, item.unitMode);
      if (item.quantity > maxAllowed) {
        toast.error(`"${item.product.ProductName}" vượt quá số lượng tối đa (${item.quantity} > ${maxAllowed} ${getUnitLabel(item.product, item.unitMode)})`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const paidAmt =
        paymentMethod === 'CREDIT' ? Math.max(0, Math.min(finalTotal, paidAmountInput)) : finalTotal;
      const finalNote = clinicalOverrideNote.trim()
        ? `[Dược sĩ thẩm định: ${clinicalOverrideNote.trim()}] ${note}`
        : note;
      const idempotencyKey = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const created = await formsApi.createInvoice(
        {
          CustomerID: selectedCustomerId,
          CustomerName: customerName,
          CustomerPhone: customerPhone,
          OrderType: orderType,
          Channel: 'POS',
          Discount: discount,
          UsedPoints: usedPoints,
          VatRate: includeVat ? 5 : 0,
          PaidAmount: paidAmt,
          Note: finalNote,
          PaymentMethod: paymentMethod,
          PatientAllergies: (selectedCustomer?.Allergies || walkInAllergies.trim() || undefined),
          ClinicalOverrideCode: clinicalOverrideCode || undefined,
          ClinicalOverrideNote: clinicalOverrideNote.trim() || undefined,
          PrescriptionFileKey: prescriptionFileKey || undefined,
          ...(activeOcrMeta
            ? {
                ocrDraftId: activeOcrMeta.draftId,
                ocrVerification: activeOcrMeta,
              }
            : {}),
          items: cart.map((i) => ({
            ProductID: i.product.ProductID,
            Quantity: i.quantity,
            Unit: getUnitName(i.product, i.unitMode),
            DosageNote: `[ĐVT: ${getUnitName(i.product, i.unitMode)}] ${i.dosageNote}`,
          })),
        },
        idempotencyKey
      );
      setCompletedInvoice(created);
      setCart([]);
      setDiscount(0);
      setUsedPoints(0);
      setPaidAmountInput(0);
      setClinicalOverrideCode('');
      setClinicalOverrideNote('');
      setWalkInAllergies('');
      setPrescriptionFileKey('');
      setPrescriptionFileName('');
      setActiveOcrMeta(null);
      toast.success(
        orderType === 'WHOLESALE'
          ? `Đã xuất Hóa đơn Bán buôn B2B ${created.InvoiceCode} và trừ kho theo Thùng/Hộp!`
          : `Đã xuất Hóa đơn Bán lẻ ${created.InvoiceCode} và trừ tồn kho theo quy cách!`
      );
      await loadPosData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể tạo hóa đơn POS';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-5">
      {/* Header + Chuyển đổi chế độ Bán Lẻ POS (GPP) vs Xuất Bán Buôn Đại Lý B2B (GDP) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {orderType === 'WHOLESALE'
                ? 'Trung Tâm Xuất Bán Buôn Đại Lý & Phòng Khám (Chuẩn GDP)'
                : 'Quầy Thu Ngân Bán Lẻ POS & Cắt Liều Đa Đơn Vị (Chuẩn GPP)'}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                orderType === 'WHOLESALE'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-teal-50 text-teal-700 border-teal-200'
              }`}
            >
              {orderType === 'WHOLESALE' ? 'Thùng · Hộp Sỉ · Công Nợ B2B' : 'Hộp · Vỉ · Viên lẻ'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {orderType === 'WHOLESALE'
              ? 'Áp dụng bảng giá sỉ B2B, chiết khấu theo bậc doanh số, xuất hóa đơn VAT 5% và quản lý hạn mức công nợ đại lý.'
              : 'Hỗ trợ bán nguyên hộp hoặc cắt liều theo Vỉ/Viên, tự động chọn lô FEFO, kiểm tra dị ứng bệnh nhân và tạo mã VietQR.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => handleSwitchMode('RETAIL')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                orderType === 'RETAIL'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Bán Lẻ POS (GPP)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('WHOLESALE')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                orderType === 'WHOLESALE'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Xuất Bán Buôn B2B (GDP)</span>
            </button>
          </div>

          {onNavigateToInvoices && (
            <button
              type="button"
              onClick={onNavigateToInvoices}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <span>Lịch sử Hóa đơn & Hoàn trả</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Cột Trái (7 cols): Danh mục chọn thuốc nhanh + Combo Cắt Liều Mẫu */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
          {/* Combo Cắt Liều Mẫu 1-Click hoặc Đơn Sỉ B2B Mẫu */}
          {orderType === 'WHOLESALE' ? (
            <div className="rounded-xl bg-indigo-50/70 border border-indigo-200/80 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <PackageCheck className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Đơn Sỉ B2B Mẫu:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyComboPack('B2B_AGENCY')}
                  className="rounded-lg bg-white border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-600 hover:text-white transition-colors shadow-2xs"
                >
                  + Lô Sỉ Quầy Thuốc (3 mã × 10 Hộp)
                </button>
                <button
                  type="button"
                  onClick={() => applyComboPack('B2B_CLINIC')}
                  className="rounded-lg bg-white border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-600 hover:text-white transition-colors shadow-2xs"
                >
                  + Lô Sỉ Phòng Khám (2 mã × 1 Thùng)
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-teal-50/60 border border-teal-200/80 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
                <Sparkles className="h-4 w-4 text-teal-600 shrink-0" />
                <span>Combo Cắt Liều Nhanh:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyComboPack('FLU')}
                  className="rounded-lg bg-white border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-600 hover:text-white transition-colors shadow-2xs"
                >
                  + Liều Cảm cúm 3 ngày
                </button>
                <button
                  type="button"
                  onClick={() => applyComboPack('STOMACH')}
                  className="rounded-lg bg-white border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-600 hover:text-white transition-colors shadow-2xs"
                >
                  + Đơn Dạ dày - Trào ngược
                </button>
                <button
                  type="button"
                  onClick={() => applyComboPack('IMMUNE')}
                  className="rounded-lg bg-white border border-teal-200 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-600 hover:text-white transition-colors shadow-2xs"
                >
                  + Combo Tăng đề kháng
                </button>
              </div>
            </div>
          )}

          {/* Thanh tìm kiếm & Lọc nhóm */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Quét mã vạch Barcode hoặc nhập tên thuốc, hoạt chất, mã DQG..."
                className="w-full h-9 rounded-lg border border-slate-300 pl-9 pr-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`h-8 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
                    selectedCategory === cat
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {cat === 'ALL' ? 'Tất cả nhóm' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Lưới Thẻ Thuốc */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[540px] overflow-y-auto pr-1">
            {filteredProducts.map((p) => {
              const isOutOfStock = !hasSellableStock(p);
              const packaging = getPackagingSpec(p);
              const blisterCount = packaging.UnitsPerBlister
                ? Math.floor(
                    (p.Quantity * packaging.UnitsPerPackage + (packaging.LooseUnits || 0)) /
                      packaging.UnitsPerBlister
                  )
                : p.Quantity;
              return (
                <div
                  key={p.ProductID}
                  className={`group rounded-xl border p-3 transition-all flex items-start gap-3 ${
                    isOutOfStock
                      ? 'border-rose-200 bg-rose-50/20 opacity-70'
                      : 'border-slate-200/90 hover:border-teal-600 hover:bg-teal-50/20'
                  }`}
                >
                  <img
                    src={p.PathImage}
                    alt={p.ProductName}
                    className="h-12 w-12 rounded-lg border border-slate-200 object-cover bg-slate-50 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[10px] font-semibold text-slate-400">
                        DQG-{String(p.ProductID + 8100).padStart(5, '0')}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          isOutOfStock
                            ? 'bg-rose-100 text-rose-700 font-bold'
                            : p.Quantity > 20
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {isOutOfStock
                          ? 'HẾT HÀNG'
                          : `Tồn: ${p.Quantity} ${p.Unit} (${blisterCount} Vỉ)`}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                      {p.ProductName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{p.Description}</div>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <div>
                        <span className="text-xs font-bold text-teal-700 tabular-nums block">
                          {orderType === 'WHOLESALE'
                            ? `Giá sỉ: ${formatVND(packaging.WholesalePrice)}/${p.Unit}`
                            : `${formatVND(p.Price)}/${p.Unit}`}
                        </span>
                        {orderType === 'WHOLESALE' && (
                          <span className="text-[10px] text-slate-400 line-through tabular-nums">
                            Giá lẻ: {formatVND(p.Price)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {orderType === 'WHOLESALE' ? (
                          <>
                            <button
                              type="button"
                              disabled={p.Quantity < (packaging.BoxesPerCarton || 20)}
                              onClick={() =>
                                addToCart(
                                  p,
                                  'CARTON',
                                  `Xuất nguyên Thùng (${packaging.BoxesPerCarton} ${p.Unit})`
                                )
                              }
                              className={`inline-flex items-center h-7 rounded-lg border px-2 text-xs font-semibold ${
                                p.Quantity < (packaging.BoxesPerCarton || 20)
                                  ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                              }`}
                            >
                              +1 Thùng
                            </button>
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() =>
                                addToCart(p, 'BASE', 'Xuất sỉ đại lý nguyên hộp')
                              }
                              className={`inline-flex items-center h-7 rounded-lg px-2.5 text-xs font-semibold text-white ${
                                isOutOfStock
                                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                  : 'bg-indigo-600 hover:bg-indigo-700'
                              }`}
                            >
                              +{p.Unit} sỉ
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => addToCart(p, 'BLISTER')}
                              className={`inline-flex items-center h-7 rounded-lg border px-2 text-xs font-semibold ${
                                isOutOfStock
                                  ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-teal-600 hover:text-teal-700'
                              }`}
                              title={isOutOfStock ? 'Đã hết tồn kho' : `Còn ${blisterCount} Vỉ khả dụng`}
                            >
                              +Vỉ lẻ
                            </button>
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => addToCart(p, 'BASE')}
                              className={`inline-flex items-center h-7 rounded-lg px-2.5 text-xs font-semibold text-white ${
                                isOutOfStock
                                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                  : 'bg-teal-600 hover:bg-teal-700'
                              }`}
                              title={isOutOfStock ? 'Đã hết tồn kho' : `Còn ${p.Quantity} ${p.Unit} khả dụng`}
                            >
                              +{p.Unit}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cột Phải (5 cols): Giỏ Thuốc Đa Đơn Vị, Cảnh báo Dị ứng & Thanh toán */}
        <form
          id="pos-cart-panel"
          onSubmit={handleCheckout}
          className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4 scroll-mt-20"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              {orderType === 'WHOLESALE' ? (
                <Building2 className="h-4 w-4 text-indigo-600" />
              ) : (
                <ShoppingCart className="h-4 w-4 text-teal-600" />
              )}
              <h2 className="text-sm font-bold text-slate-900">
                {orderType === 'WHOLESALE'
                  ? `Phiếu Xuất Bán Buôn GDP (${cart.length} mã)`
                  : `Phiếu Xuất Thuốc GPP (${cart.length} mặt hàng)`}
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs font-semibold text-rose-600 hover:underline"
              >
                Làm trống giỏ
              </button>
            )}
          </div>

          {/* Chọn Hồ sơ Bệnh nhân (CRM) hoặc Đại lý B2B */}
          <div
            className={`rounded-xl p-3 border space-y-2.5 ${
              orderType === 'WHOLESALE'
                ? 'bg-indigo-50/50 border-indigo-200/80'
                : 'bg-slate-50 border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                {orderType === 'WHOLESALE' ? (
                  <>
                    <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Hồ sơ Đại lý / Phòng khám B2B (Hạn mức Công nợ & MST)</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5 text-teal-600" />
                    <span>Hồ sơ Bệnh nhân (Kiểm tra Dị ứng & Tích điểm)</span>
                  </>
                )}
              </label>
            </div>
            <select
              value={selectedCustomerId || ''}
              onChange={(e) =>
                handleSelectCustomer(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
            >
              <option value="">
                {orderType === 'WHOLESALE'
                  ? '-- Chọn Đại lý / Quầy thuốc / Phòng khám B2B --'
                  : '-- Khách vãng lai (Bán lẻ OTC không lưu hồ sơ) --'}
              </option>
              {customers
                .filter((c) =>
                  orderType === 'WHOLESALE' ? c.CustomerType === 'WHOLESALE' : true
                )
                .map((c) => (
                  <option key={c.CustomerID} value={c.CustomerID}>
                    [{c.CustomerCode}] {c.CompanyName || c.FullName} - {c.Phone}{' '}
                    {c.CustomerType === 'WHOLESALE'
                      ? `(MST: ${c.TaxCode || 'N/A'} | Nợ: ${formatVND(c.DebtBalance || 0)})`
                      : c.Allergies && c.Allergies !== 'Không ghi nhận'
                      ? `(Dị ứng: ${c.Allergies})`
                      : ''}
                  </option>
                ))}
            </select>

            {selectedCustomer && selectedCustomer.CustomerType === 'WHOLESALE' && (
              <div className="rounded-lg bg-white p-2.5 border border-indigo-200/80 text-[11px] space-y-1 text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-500">Đơn vị / MST:</span>
                  <strong className="text-indigo-950">
                    {selectedCustomer.CompanyName || selectedCustomer.FullName} ({selectedCustomer.TaxCode || 'Chưa cập nhật'})
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Hạn mức công nợ B2B:</span>
                  <strong className="text-emerald-700 tabular-nums">
                    {formatVND(selectedCustomer.CreditLimit || 50000000)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dư nợ hiện tại:</span>
                  <strong className="text-rose-600 tabular-nums">
                    {formatVND(selectedCustomer.DebtBalance || 0)}
                  </strong>
                </div>
              </div>
            )}

            {selectedCustomer && selectedCustomer.CustomerType !== 'WHOLESALE' && (
              <div className="text-[11px] flex flex-wrap items-center justify-between gap-2 pt-1 text-slate-600">
                <span>
                  Tiền sử dị ứng:{' '}
                  <strong
                    className={
                      selectedCustomer.Allergies &&
                      selectedCustomer.Allergies !== 'Không ghi nhận'
                        ? 'text-rose-600'
                        : 'text-emerald-700'
                    }
                  >
                    {selectedCustomer.Allergies || 'Không'}
                  </strong>
                </span>
                <span>
                  Điểm tích lũy: <strong className="text-teal-700">{selectedCustomer.LoyaltyPoints} điểm</strong>
                </span>
              </div>
            )}

            {!selectedCustomerId && (
              <div className="space-y-1.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Tên khách hàng"
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Số điện thoại"
                    className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  value={walkInAllergies}
                  onChange={(e) => setWalkInAllergies(e.target.value)}
                  placeholder="Tiền sử dị ứng thuốc (nếu có, VD: Penicillin, Aspirin)"
                  className="w-full h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* CẢNH BÁO TƯƠNG TÁC THUỐC & DỊ ỨNG TỰ ĐỘNG */}
          {interactionCheck && interactionCheck.warnings.length > 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>Cảnh báo An toàn Dược Lâm Sàng ({interactionCheck.warnings.length})</span>
              </div>
              {interactionCheck.warnings.map((w, idx) => (
                <div key={idx} className="text-[11px] text-rose-700 leading-relaxed pl-5">
                  • <strong>[{w.severity}] {w.title}:</strong> {w.detail}
                  {w.ruleId && (
                    <span className="ml-1.5 text-[10px] text-rose-500 font-mono">
                      ({w.ruleId}{w.source ? ` · ${w.source}` : ''})
                    </span>
                  )}
                </div>
              ))}
              {interactionCheck.disclaimer && (
                <div className="text-[10px] italic text-rose-700/80 pl-5">
                  {interactionCheck.disclaimer}
                </div>
              )}

              {canOverrideClinical ? (
                <div className="pt-2 border-t border-rose-200 mt-2 space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-rose-900 mb-1">
                      Mã lý do thẩm định của Dược sĩ / Admin (Bắt buộc nếu tiếp tục xuất):
                    </label>
                    <select
                      value={clinicalOverrideCode}
                      onChange={(e) => setClinicalOverrideCode(e.target.value)}
                      className="w-full h-8 rounded-lg border border-rose-300 bg-white px-2 text-xs text-rose-900 focus:border-rose-600 focus:outline-none"
                    >
                      <option value="">-- Chọn mã lý do lâm sàng --</option>
                      {CLINICAL_OVERRIDE_REASONS.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.code} - {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-rose-900 mb-1">
                      Ghi chú thẩm định chuyên môn (tối thiểu 10 ký tự):
                    </label>
                    <input
                      type="text"
                      value={clinicalOverrideNote}
                      onChange={(e) => setClinicalOverrideNote(e.target.value)}
                      placeholder="VD: Đã liên hệ BS kê đơn xác nhận liều và tư vấn bệnh nhân..."
                      className="w-full h-8 rounded-lg border border-rose-300 bg-white px-2.5 text-xs text-rose-900 placeholder:text-rose-400 focus:border-rose-600 focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-rose-200 mt-2 flex items-start gap-2 rounded-lg bg-rose-100/80 p-2 text-[11px] font-semibold text-rose-900">
                  <Lock className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
                  <span>
                    Yêu cầu Dược sĩ/Admin thẩm định: Tài khoản Thu ngân (CASHIER) không có quyền vượt qua cảnh báo lâm sàng.
                  </span>
                </div>
              )}
            </div>
          ) : cart.length > 0 ? (
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 flex items-center gap-2 text-xs font-medium text-emerald-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Đơn thuốc an toàn: Không phát hiện trùng hoạt chất hay xung đột dị ứng.</span>
            </div>
          ) : null}

          {/* Kiểm soát thuốc kê đơn (Rx) tại POS — Phân quyền Dược sĩ + Đính kèm toa thuốc */}
          {hasRxInCart && (
            <div
              className={`rounded-xl border p-3 text-xs space-y-2 ${
                !canOverrideClinical
                  ? 'border-rose-300 bg-rose-50/90 text-rose-900'
                  : prescriptionFileKey
                    ? 'border-emerald-300 bg-emerald-50/80 text-emerald-900'
                    : 'border-amber-300 bg-amber-50/90 text-amber-950'
              }`}
            >
              {!canOverrideClinical ? (
                <div className="flex items-start gap-2 font-semibold">
                  <Lock className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
                  <span>
                    Giỏ hàng chứa thuốc kê đơn (Rx): Tài khoản Thu ngân (CASHIER) không có quyền xuất bán thuốc Rx. Vui lòng chuyển Dược sĩ hoặc Quản trị viên!
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      <FileText className="h-4 w-4 text-rose-600 shrink-0" />
                      <span>Đơn có thuốc kê đơn (Rx) — Bắt buộc đính kèm ảnh toa</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 cursor-pointer shadow-xs">
                      <Upload className="h-3.5 w-3.5 text-teal-600" />
                      <span>
                        {prescriptionUploading
                          ? 'Đang tải ảnh toa...'
                          : prescriptionFileKey
                            ? 'Thay ảnh toa khác'
                            : 'Tải lên ảnh toa (PNG/JPG/WEBP)'}
                      </span>
                      <input
                        id="pos-rx-file-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={prescriptionUploading}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          if (file.size > 3 * 1024 * 1024) {
                            toast.error('Ảnh toa thuốc không được vượt quá 3MB');
                            return;
                          }
                          setPrescriptionUploading(true);
                          try {
                            const uploaded = await formsApi.uploadInvoicePrescription(file);
                            setPrescriptionFileKey(uploaded.fileKey);
                            setPrescriptionFileName(file.name);
                            toast.success(`Đã đính kèm ảnh toa "${file.name}"`);
                          } catch (err: unknown) {
                            const msg =
                              (err as { response?: { data?: { message?: string } } })?.response?.data
                                ?.message || 'Không thể tải ảnh toa thuốc lên máy chủ';
                            toast.error(msg);
                          } finally {
                            setPrescriptionUploading(false);
                          }
                        }}
                      />
                    </label>
                    {prescriptionFileKey ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                        Đã lưu toa: {prescriptionFileName || prescriptionFileKey}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-800">
                        Chưa đính kèm ảnh toa thuốc hợp lệ
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Danh sách thuốc trong giỏ hỗ trợ chuyển đổi Hộp / Vỉ / Viên */}
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1 divide-y divide-slate-100">
            {cart.map((item) => {
              const mode = item.unitMode || 'BASE';
              const unitPrice = getEffectivePrice(item.product, mode, item.quantity);
              const maxStock = getMaxStockForMode(item.product, mode);
              const spec = getPackagingSpec(item.product);
              const cartonMax = getMaxStockForMode(item.product, 'CARTON');

              const availableUnits: { id: RetailUnitMode; label: string }[] = [];
              if (orderType === 'WHOLESALE' && cartonMax > 0) {
                availableUnits.push({
                  id: 'CARTON',
                  label: `Thùng ${spec.BoxesPerCarton} ${item.product.Unit} (${cartonMax})`,
                });
              }
              availableUnits.push({
                id: 'BASE',
                label: `${spec.PackageUnit || item.product.Unit} (${item.product.Quantity})`,
              });
              if (
                orderType === 'RETAIL' &&
                spec.BlisterUnit &&
                spec.BlistersPerPackage &&
                spec.BlistersPerPackage > 1
              ) {
                const blisterMax = getMaxStockForMode(item.product, 'BLISTER');
                availableUnits.push({ id: 'BLISTER', label: `${spec.BlisterUnit} (${blisterMax})` });
              }
              if (
                orderType === 'RETAIL' &&
                spec.AllowFractionalSale &&
                spec.UnitsPerPackage > 1
              ) {
                const pillMax = item.product.Quantity * spec.UnitsPerPackage + (spec.LooseUnits || 0);
                availableUnits.push({ id: 'PILL', label: `${spec.SmallestUnit || 'Viên'} (${pillMax})` });
              }
              if (orderType === 'RETAIL' && cartonMax > 0) {
                availableUnits.push({
                  id: 'CARTON',
                  label: `Thùng (${cartonMax})`,
                });
              }

              return (
                <div key={item.product.ProductID} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {item.product.ProductName}
                        </span>
                        {item.product.packaging?.IsRx && (
                          <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            Rx
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[11px] font-bold text-teal-700 tabular-nums">
                          {formatVND(unitPrice)} / {getUnitLabel(item.product, mode)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                          <CalendarClock className="h-2.5 w-2.5 text-teal-600" />
                          {item.product.stockLots && item.product.stockLots.length > 0
                            ? `FEFO: ${item.product.stockLots[0].BatchNumber} · HSD ${item.product.stockLots[0].ExpiryDate}`
                            : `FEFO: LOT-GPP-${item.product.ProductID} · HSD 12/2027`}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                        <span>Khả dụng:</span>
                        <span className="font-semibold text-teal-700">
                          {maxStock} {getUnitLabel(item.product, mode)}
                        </span>
                        <span className="text-slate-400">
                          (Gốc: {item.product.Quantity} {item.product.Unit}
                          {spec.LooseUnits > 0 ? ` + ${spec.LooseUnits} ${spec.SmallestUnit} lẻ` : ''})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.ProductID, -1)}
                        className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center text-xs font-bold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.ProductID, 1)}
                        disabled={item.quantity >= maxStock}
                        className={`h-7 w-7 rounded-lg border flex items-center justify-center ${
                          item.quantity >= maxStock
                            ? 'border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50'
                            : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                        title={item.quantity >= maxStock ? 'Đã đạt số lượng tồn tối đa' : 'Thêm 1'}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.product.ProductID, -item.quantity)}
                        className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Bộ chọn Đơn vị quy đổi chuẩn quy cách đóng gói */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                      {availableUnits.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => updateUnitMode(item.product.ProductID, u.id)}
                          className={`rounded-md px-2 py-1 font-semibold transition-colors text-[10px] sm:text-xs ${
                            mode === u.id
                              ? 'bg-teal-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {u.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-slate-900 tabular-nums">
                      {formatVND(unitPrice * item.quantity)}
                    </span>
                  </div>

                  <input
                    type="text"
                    value={item.dosageNote}
                    onChange={(e) =>
                      setCart((prev) =>
                        prev.map((row) =>
                          row.product.ProductID === item.product.ProductID
                            ? { ...row, dosageNote: e.target.value }
                            : row
                        )
                      )
                    }
                    placeholder="Hướng dẫn liều dùng in trên nhãn thuốc..."
                    className="w-full h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-700 focus:bg-white focus:border-teal-600 focus:outline-none"
                  />
                </div>
              );
            })}
          </div>

          {/* Tính tiền & Chiết khấu */}
          <div className="border-t border-slate-200 pt-3 space-y-2.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Tổng tiền thuốc ({cart.reduce((s, i) => s + i.quantity, 0)} đơn vị):</span>
              <span className="font-semibold text-slate-900 tabular-nums">{formatVND(subTotal)}</span>
            </div>

            {/* Đổi điểm tích lũy thành viên */}
            {selectedCustomer && (
              <div className="rounded-lg bg-teal-50 border border-teal-200/80 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-teal-900">
                  <span className="font-bold flex items-center gap-1.5 text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    Điểm tích lũy: {selectedCustomer.LoyaltyPoints || 0} điểm
                  </span>
                  <span className="text-[11px] text-teal-700">
                    (1 điểm = 1.000 đ)
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">Đổi điểm trừ tiền:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={Math.min(selectedCustomer.LoyaltyPoints || 0, Math.floor(subTotal / 1000))}
                      value={usedPoints}
                      onChange={(e) => setUsedPoints(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-20 h-7 rounded border border-teal-300 bg-white px-2 text-right text-xs font-bold text-teal-800 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => setUsedPoints(Math.min(selectedCustomer.LoyaltyPoints || 0, Math.floor(subTotal / 1000)))}
                      className="text-[10px] px-2 py-1 bg-teal-700 text-white rounded hover:bg-teal-800 font-semibold"
                    >
                      Dùng tối đa
                    </button>
                  </div>
                </div>
                {usedPoints > 0 && (
                  <div className="flex justify-between text-[11px] text-teal-800 font-semibold pt-1 border-t border-teal-200/60">
                    <span>Trừ từ điểm thưởng ({usedPoints} điểm):</span>
                    <span className="tabular-nums">-{formatVND(pointDiscount)}</span>
                  </div>
                )}
                {usedPoints > (selectedCustomer.LoyaltyPoints || 0) && (
                  <p className="text-[11px] text-rose-600 font-medium">
                    Số điểm dùng vượt quá số dư ({selectedCustomer.LoyaltyPoints || 0} điểm)
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Chiết khấu tiền mặt / Bậc doanh số (VNĐ):</span>
                <input
                  type="number"
                  min={0}
                  max={maxAllowedCashDiscount}
                  step={1000}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className={`w-32 h-8 rounded-lg border bg-white px-2.5 text-right text-xs tabular-nums shadow-sm focus:outline-none ${
                    discount < 0 || discount > maxAllowedCashDiscount
                      ? 'border-rose-500 text-rose-600 focus:border-rose-600 focus:ring-1 focus:ring-rose-500'
                      : 'border-slate-300 focus:border-teal-600'
                  }`}
                />
              </div>
              {orderType === 'WHOLESALE' && subTotal > 0 && (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDiscount(Math.round(subTotal * 0.02))}
                    className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    CK Đại lý 2% (-{formatVND(Math.round(subTotal * 0.02))})
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscount(Math.round(subTotal * 0.05))}
                    className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    CK VIP 5% (-{formatVND(Math.round(subTotal * 0.05))})
                  </button>
                </div>
              )}
              {(discount < 0 || discount > maxAllowedCashDiscount) && (
                <p className="text-[11px] text-rose-600 text-right font-medium">
                  {discount < 0
                    ? 'Chiết khấu không được âm'
                    : `Chiết khấu tối đa cho phép là ${formatVND(maxAllowedCashDiscount)}`}
                </p>
              )}
            </div>

            {/* Thuế GTGT Dược phẩm VAT 5% */}
            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVat}
                  onChange={(e) => setIncludeVat(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>Xuất Hóa đơn GTGT Dược phẩm (VAT 5%)</span>
              </label>
              <span className="font-semibold text-slate-800 tabular-nums">
                +{formatVND(vatAmount)}
              </span>
            </div>

            <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-100">
              <span>{orderType === 'WHOLESALE' ? 'Tổng giá trị Hợp đồng B2B:' : 'Khách cần thanh toán:'}</span>
              <span className="text-base text-teal-700 tabular-nums">{formatVND(finalTotal)}</span>
            </div>
          </div>

          {/* Phương thức thanh toán */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: 'VIETQR', label: 'Mã VietQR', icon: QrCode },
                { id: 'CASH', label: 'Tiền mặt', icon: Banknote },
                { id: 'CARD', label: 'Thẻ POS', icon: CreditCard },
                { id: 'CREDIT', label: 'Ghi Công Nợ', icon: FileSpreadsheet },
              ] as const
            ).map((pm) => {
              const Icon = pm.icon;
              const active = paymentMethod === pm.id;
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setPaymentMethod(pm.id)}
                  className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-semibold transition-colors ${
                    active
                      ? pm.id === 'CREDIT'
                        ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                        : 'border-teal-600 bg-teal-600 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{pm.label}</span>
                </button>
              );
            })}
          </div>

          {paymentMethod === 'CREDIT' && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-indigo-50/70 p-2.5 border border-indigo-200 text-xs">
              <div>
                <span className="text-[11px] font-semibold text-indigo-800 block">
                  Trả trước một phần (VNĐ):
                </span>
                <input
                  type="number"
                  min={0}
                  max={finalTotal}
                  step={10000}
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(Number(e.target.value))}
                  className="mt-0.5 w-full h-8 rounded-lg border border-indigo-300 bg-white px-2.5 text-xs font-bold text-indigo-900 tabular-nums"
                />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-rose-700 block">
                  Ghi vào Công nợ Đại lý:
                </span>
                <div className="mt-1.5 font-bold text-rose-600 tabular-nums text-sm">
                  {formatVND(Math.max(0, finalTotal - paidAmountInput))}
                </div>
              </div>
            </div>
          )}

          {paymentMethod === 'CASH' && (
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 border border-slate-200/70 text-xs">
              <div>
                <span className="text-[11px] text-slate-500 block">Tiền khách đưa:</span>
                <input
                  type="number"
                  value={cashTendered || finalTotal}
                  onChange={(e) => setCashTendered(Number(e.target.value))}
                  className="mt-0.5 w-full h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs tabular-nums shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <span className="text-[11px] text-slate-500 block">Tiền thừa trả khách:</span>
                <div className="mt-1 font-bold text-emerald-700 tabular-nums">
                  {formatVND(changeAmount)}
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              prescriptionUploading ||
              cart.length === 0 ||
              (hasRxInCart && (!canOverrideClinical || !prescriptionFileKey)) ||
              discount < 0 ||
              discount > maxAllowedCashDiscount ||
              Boolean(selectedCustomer && usedPoints > (selectedCustomer.LoyaltyPoints || 0))
            }
            className="w-full h-10 rounded-lg bg-teal-600 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            {submitting
              ? 'Đang xuất hóa đơn...'
              : `Hoàn tất Thanh toán & Xuất Thuốc (${formatVND(finalTotal)})`}
          </button>
        </form>
      </div>

      {/* Nút lối tắt xem giỏ hàng nổi trên Mobile / Tablet */}
      {cart.length > 0 && (
        <a
          href="#pos-cart-panel"
          className="lg:hidden fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-teal-700/30 hover:bg-teal-700 transition-all active:scale-95"
        >
          <ShoppingCart className="h-4 w-4" />
          <span>Giỏ hàng ({cart.reduce((s, i) => s + i.quantity, 0)}) · {formatVND(finalTotal)}</span>
        </a>
      )}

      {/* Modal Hóa đơn & Mã VietQR vừa tạo */}
      {completedInvoice && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4">
            <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between bg-emerald-50/70 shrink-0">
              <div className="flex items-center gap-2 text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold">
                  Xuất Hóa Đơn Thành Công ({completedInvoice.InvoiceCode})
                </h3>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Bệnh nhân / Khách hàng:</span>
                <span className="font-bold text-slate-900">{completedInvoice.CustomerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Liên thông Dược Quốc Gia:</span>
                <span className="font-mono font-semibold text-teal-700">
                  DQG-HD-{completedInvoice.InvoiceID} (Đã đồng bộ)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tổng thanh toán:</span>
                <span className="text-sm font-bold text-teal-700 tabular-nums">
                  {formatVND(completedInvoice.TotalAmount)}
                </span>
              </div>

              {completedInvoice.payment?.PaymentMethod === 'VIETQR' && (
                <div className="rounded-xl border border-slate-200 p-3 text-center space-y-2.5 bg-slate-50">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-slate-600">Quét mã VietQR Napas247</span>
                    {completedInvoice.PaymentStatus === 'PAID' ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                        Đã đối soát thực thu
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                        Chờ đối soát ngân hàng (UNPAID)
                      </span>
                    )}
                  </div>
                  <img
                    src={`https://img.vietqr.io/image/MB-0388889999-compact2.png?amount=${completedInvoice.TotalAmount}&addInfo=${encodeURIComponent(
                      completedInvoice.InvoiceCode
                    )}`}
                    alt="VietQR"
                    className="mx-auto h-44 w-44 sm:h-48 sm:w-48 rounded-lg border border-slate-200 bg-white p-1"
                  />
                  {completedInvoice.PaymentStatus !== 'PAID' && (
                    <div className="pt-2 border-t border-slate-200 text-left space-y-2">
                      <p className="text-[11px] text-amber-800 bg-amber-50/90 border border-amber-200 rounded-lg p-2">
                        Hóa đơn VietQR đang ở trạng thái <strong>UNPAID (Chưa thu tiền)</strong>. Sau khi khách chuyển khoản thành công, vui lòng nhập mã tham chiếu ngân hàng (FT...) để xác nhận thực thu vào Sổ quỹ:
                      </p>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          id="pos-vietqr-ref-input"
                          placeholder="Mã GD ngân hàng (VD: FT26319...)"
                          className="flex-1 h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-mono text-slate-900 focus:border-teal-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const inputEl = document.getElementById(
                              'pos-vietqr-ref-input'
                            ) as HTMLInputElement | null;
                            const refCode = (inputEl?.value || '').trim();
                            if (refCode.length < 3) {
                              toast.warning(
                                'Vui lòng nhập Mã giao dịch ngân hàng (ReferenceCode / FT..., tối thiểu 3 ký tự)!'
                              );
                              return;
                            }
                            try {
                              const reconciled = await formsApi.collectDebt(
                                completedInvoice.InvoiceID,
                                completedInvoice.DebtAmount || completedInvoice.TotalAmount,
                                'VIETQR',
                                refCode,
                                `Đối soát VietQR tại quầy POS (${refCode})`
                              );
                              setCompletedInvoice(reconciled);
                              toast.success(
                                `Đã đối soát thực thu VietQR (${refCode}) cho hóa đơn ${reconciled.InvoiceCode}!`
                              );
                            } catch (err: any) {
                              toast.error(
                                err?.response?.data?.message || 'Không thể đối soát giao dịch VietQR'
                              );
                            }
                          }}
                          className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 shrink-0 shadow-2xs"
                        >
                          Xác nhận đã nhận tiền
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-4 sm:px-5 py-3 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>In phiếu GPP</span>
              </button>
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Đóng & Bán đơn mới
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
};
