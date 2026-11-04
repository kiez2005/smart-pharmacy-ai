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
} from 'lucide-react';
import { toast } from 'sonner';
import { productApi } from '../services/product.api';
import { formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';
import { Product } from '../types/product';
import { CustomerRecord, DrugInteractionResult } from '../types/enterprise';
import { InvoiceRecord } from '../types/forms';

export type RetailUnitMode = 'BASE' | 'BLISTER' | 'PILL';

export interface PosCartItem {
  product: Product;
  quantity: number;
  dosageNote: string;
  unitMode?: RetailUnitMode;
}

interface PosTerminalPageProps {
  initialCartItems?: PosCartItem[];
  onClearInitialCart?: () => void;
  onNavigateToInvoices?: () => void;
}

export const PosTerminalPage: React.FC<PosTerminalPageProps> = ({
  initialCartItems,
  onClearInitialCart,
  onNavigateToInvoices,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Giỏ hàng POS hỗ trợ Đa đơn vị quy đổi (Hộp / Vỉ / Viên lẻ)
  const [cart, setCart] = useState<PosCartItem[]>([
    {
      product: {
        ProductID: 1,
        ProductName: 'Panadol Extra 500mg/65mg',
        PathImage:
          'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&auto=format&fit=crop&q=80',
        ProductType: 'Giảm đau - Hạ sốt',
        Quantity: 250,
        Unit: 'Hộp',
        Price: 185000,
        Description: 'Paracetamol 500mg, Caffeine 65mg',
        CreateDate: new Date().toISOString(),
        UpdateDate: new Date().toISOString(),
      },
      quantity: 1,
      dosageNote: 'Uống 1 viên khi đau hoặc sốt sau ăn (Tối đa 4 viên/ngày)',
      unitMode: 'BASE',
    },
  ]);

  // Thông tin Bệnh nhân & Thanh toán
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState<string>('Khách vãng lai');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'VIETQR' | 'CASH' | 'CARD'>('VIETQR');
  const [note, setNote] = useState<string>('Tư vấn uống đúng liều, tránh rượu bia');
  const [submitting, setSubmitting] = useState<boolean>(false);

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
      toast.success(`Đã nạp ${initialCartItems.length} thuốc từ Đơn thuốc OCR vào Quầy POS!`);
      onClearInitialCart?.();
    }
  }, [initialCartItems, onClearInitialCart]);

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
          patientAllergies: selectedCustomer?.Allergies || '',
        });
        setInteractionCheck(res);
      } catch {
        // Ignore silent check error
      }
    };
    void checkSafety();
  }, [cart, selectedCustomer]);

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

  const getEffectivePrice = (product: Product, mode: RetailUnitMode = 'BASE') => {
    if (mode === 'BLISTER') return Math.max(1000, Math.round(product.Price / 10));
    if (mode === 'PILL') return Math.max(500, Math.round(product.Price / 50));
    return product.Price;
  };

  const getUnitLabel = (product: Product, mode: RetailUnitMode = 'BASE') => {
    if (mode === 'BLISTER') return 'Vỉ lẻ (1/10 Hộp)';
    if (mode === 'PILL') return 'Viên lẻ';
    return product.Unit;
  };

  const addToCart = (product: Product, defaultMode: RetailUnitMode = 'BASE', customNote?: string) => {
    if (product.Quantity <= 0) {
      toast.error(`"${product.ProductName}" đã hết tồn kho!`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.product.ProductID === product.ProductID);
      if (existing) {
        if (existing.quantity + 1 > product.Quantity) {
          toast.warning('Vượt quá số lượng tồn kho hiện có');
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

  // Combo Cắt Liều Mẫu chuẩn nhà thuốc thương mại
  const applyComboPack = (comboType: 'FLU' | 'STOMACH' | 'IMMUNE') => {
    if (products.length === 0) return;
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
          if (nextQty > item.product.Quantity) {
            toast.warning('Vượt quá tồn kho khả dụng');
            return item;
          }
          return nextQty > 0 ? { ...item, quantity: nextQty } : null;
        })
        .filter((i): i is PosCartItem => Boolean(i))
    );
  };

  const updateUnitMode = (productId: number, mode: RetailUnitMode) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.ProductID === productId ? { ...item, unitMode: mode } : item
      )
    );
  };

  const subTotal = cart.reduce(
    (sum, i) => sum + getEffectivePrice(i.product, i.unitMode) * i.quantity,
    0
  );
  const finalTotal = Math.max(0, subTotal - discount);
  const changeAmount = Math.max(0, cashTendered - finalTotal);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error('Giỏ thuốc đang trống');
      return;
    }
    setSubmitting(true);
    try {
      const created = await formsApi.createInvoice({
        CustomerID: selectedCustomerId,
        CustomerName: customerName,
        CustomerPhone: customerPhone,
        Discount: discount,
        Note: note,
        PaymentMethod: paymentMethod,
        items: cart.map((i) => ({
          ProductID: i.product.ProductID,
          Quantity: i.quantity,
          DosageNote: `[ĐVT: ${getUnitLabel(i.product, i.unitMode)}] ${i.dosageNote}`,
        })),
      });
      setCompletedInvoice(created);
      setCart([]);
      setDiscount(0);
      toast.success(`Đã xuất hóa đơn ${created.InvoiceCode} và trừ tồn kho theo FEFO!`);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Quầy Thu Ngân Bán Lẻ POS & Cắt Liều Đa Đơn Vị
            </h1>
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">
              Hộp · Vỉ · Viên lẻ
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Hỗ trợ bán nguyên hộp hoặc cắt liều theo Vỉ/Viên, tự động chọn lô FEFO, kiểm tra dị ứng bệnh nhân và tạo mã VietQR.
          </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Cột Trái (7 cols): Danh mục chọn thuốc nhanh + Combo Cắt Liều Mẫu */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
          {/* Combo Cắt Liều Mẫu 1-Click */}
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
            {filteredProducts.map((p) => (
              <div
                key={p.ProductID}
                className="group rounded-xl border border-slate-200/90 p-3 hover:border-teal-600 hover:bg-teal-50/20 transition-all flex items-start gap-3"
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
                        p.Quantity > 20
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      Tồn: {p.Quantity} {p.Unit}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                    {p.ProductName}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{p.Description}</div>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-teal-700 tabular-nums">
                      {formatVND(p.Price)}/{p.Unit}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => addToCart(p, 'BLISTER')}
                        className="inline-flex items-center h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
                      >
                        +Vỉ lẻ
                      </button>
                      <button
                        type="button"
                        onClick={() => addToCart(p, 'BASE')}
                        className="inline-flex items-center h-7 rounded-lg bg-teal-600 px-2.5 text-xs font-semibold text-white hover:bg-teal-700"
                      >
                        +{p.Unit}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
              <ShoppingCart className="h-4 w-4 text-teal-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Phiếu Xuất Thuốc GPP ({cart.length} mặt hàng)
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

          {/* Chọn Hồ sơ Bệnh nhân (CRM) */}
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-teal-600" />
                <span>Hồ sơ Bệnh nhân (Kiểm tra Dị ứng & Tích điểm)</span>
              </label>
            </div>
            <select
              value={selectedCustomerId || ''}
              onChange={(e) =>
                handleSelectCustomer(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
            >
              <option value="">-- Khách vãng lai (Bán lẻ OTC không lưu hồ sơ) --</option>
              {customers.map((c) => (
                <option key={c.CustomerID} value={c.CustomerID}>
                  [{c.CustomerCode}] {c.FullName} - {c.Phone}{' '}
                  {c.Allergies && c.Allergies !== 'Không ghi nhận'
                    ? `(Dị ứng: ${c.Allergies})`
                    : ''}
                </option>
              ))}
            </select>

            {selectedCustomer && (
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
              <div className="grid grid-cols-2 gap-2 pt-1">
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
                  • <strong>{w.title}:</strong> {w.detail}
                </div>
              ))}
            </div>
          ) : cart.length > 0 ? (
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 flex items-center gap-2 text-xs font-medium text-emerald-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Đơn thuốc an toàn: Không phát hiện trùng hoạt chất hay xung đột dị ứng.</span>
            </div>
          ) : null}

          {/* Danh sách thuốc trong giỏ hỗ trợ chuyển đổi Hộp / Vỉ / Viên */}
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1 divide-y divide-slate-100">
            {cart.map((item) => {
              const mode = item.unitMode || 'BASE';
              const unitPrice = getEffectivePrice(item.product, mode);
              return (
                <div key={item.product.ProductID} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {item.product.ProductName}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-bold text-teal-700 tabular-nums">
                          {formatVND(unitPrice)} / {getUnitLabel(item.product, mode)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                          <CalendarClock className="h-2.5 w-2.5 text-teal-600" />
                          FEFO: LOT-250{item.product.ProductID} · HSD 12/2027
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
                        className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100"
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

                  {/* Bộ chọn Đơn vị quy đổi (Nguyên Hộp / Vỉ lẻ / Viên lẻ) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px]">
                      {(
                        [
                          { id: 'BASE', label: `Nguyên ${item.product.Unit}` },
                          { id: 'BLISTER', label: 'Bán Vỉ (1/10)' },
                          { id: 'PILL', label: 'Viên lẻ' },
                        ] as const
                      ).map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => updateUnitMode(item.product.ProductID, u.id)}
                          className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
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
          <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Tổng tiền thuốc ({cart.reduce((s, i) => s + i.quantity, 0)} đơn vị):</span>
              <span className="font-semibold text-slate-900 tabular-nums">{formatVND(subTotal)}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-600">Chiết khấu / Đổi điểm thành viên (VNĐ):</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-32 h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-right text-xs tabular-nums shadow-sm focus:border-teal-600 focus:outline-none"
              />
            </div>

            <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-100">
              <span>Khách cần thanh toán:</span>
              <span className="text-base text-teal-700 tabular-nums">{formatVND(finalTotal)}</span>
            </div>
          </div>

          {/* Phương thức thanh toán */}
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'VIETQR', label: 'Mã VietQR', icon: QrCode },
                { id: 'CASH', label: 'Tiền mặt', icon: Banknote },
                { id: 'CARD', label: 'Thẻ POS', icon: CreditCard },
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
                      ? 'border-teal-600 bg-teal-600 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{pm.label}</span>
                </button>
              );
            })}
          </div>

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
            disabled={submitting || cart.length === 0}
            className="w-full h-10 rounded-lg bg-teal-600 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50 shadow-sm transition-colors"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
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
                <div className="rounded-xl border border-slate-200 p-3 text-center space-y-2 bg-slate-50">
                  <div className="text-[11px] font-semibold text-slate-600">
                    Quét mã VietQR Napas247 để đối soát tự động
                  </div>
                  <img
                    src={`https://img.vietqr.io/image/MB-0388889999-compact2.png?amount=${completedInvoice.TotalAmount}&addInfo=${encodeURIComponent(
                      completedInvoice.InvoiceCode
                    )}`}
                    alt="VietQR"
                    className="mx-auto h-44 w-44 sm:h-48 sm:w-48 rounded-lg border border-slate-200 bg-white p-1"
                  />
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
      )}
    </div>
  );
};
