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
} from 'lucide-react';
import { toast } from 'sonner';
import { productApi } from '../services/product.api';
import { formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';
import { Product } from '../types/product';
import { CustomerRecord, DrugInteractionResult } from '../types/enterprise';
import { InvoiceRecord } from '../types/forms';

export interface PosCartItem {
  product: Product;
  quantity: number;
  dosageNote: string;
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

  // Giỏ hàng POS
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
      dosageNote: 'Uống 1 viên khi đau hoặc sốt sau ăn',
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
      setCart(initialCartItems);
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

  const addToCart = (product: Product) => {
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
          dosageNote: 'Ngày uống 2 lần, mỗi lần 1 đơn vị sau ăn',
        },
      ];
    });
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

  const subTotal = cart.reduce((sum, i) => sum + i.product.Price * i.quantity, 0);
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
          DosageNote: i.dosageNote,
        })),
      });
      setCompletedInvoice(created);
      setCart([]);
      setDiscount(0);
      toast.success(`Đã xuất hóa đơn ${created.InvoiceCode} và trừ tồn kho tự động!`);
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
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            Quầy Thu Ngân Bán Lẻ POS (Point of Sale)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Bán thuốc theo đơn hoặc kê lẻ, tự động đối chiếu tiền sử dị ứng bệnh nhân, trừ tồn kho và tạo mã VietQR.
          </p>
        </div>
        {onNavigateToInvoices && (
          <button
            type="button"
            onClick={onNavigateToInvoices}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <span>Lịch sử Hóa đơn & Hoàn trả</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Cột Trái (7 cols): Danh mục chọn thuốc nhanh */}
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs space-y-4">
          {/* Thanh tìm kiếm & Lọc nhóm */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm nhanh theo tên thuốc, hoạt chất hoặc mã SKU..."
                className="w-full h-9 rounded-md border border-zinc-300 pl-9 pr-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
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
              <button
                key={p.ProductID}
                type="button"
                onClick={() => addToCart(p)}
                className="group text-left rounded-lg border border-zinc-200/80 p-3 hover:border-zinc-900 hover:bg-zinc-50/60 transition-all flex items-start gap-3"
              >
                <img
                  src={p.PathImage}
                  alt={p.ProductName}
                  className="h-12 w-12 rounded-md border border-zinc-200 object-cover bg-zinc-50 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[10px] text-zinc-400">
                      #{String(p.ProductID).padStart(4, '0')}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        p.Quantity > 20
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      Tồn: {p.Quantity} {p.Unit}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-900 truncate mt-0.5">
                    {p.ProductName}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">{p.Description}</div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-900 tabular-nums">
                      {formatVND(p.Price)} / {p.Unit}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-zinc-600 group-hover:text-zinc-900">
                      <Plus className="h-3 w-3" /> Thêm
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Cột Phải (5 cols): Giỏ Thuốc, Cảnh báo Dị ứng & Thanh toán */}
        <form
          onSubmit={handleCheckout}
          className="lg:col-span-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-zinc-900" />
              <h2 className="text-sm font-semibold text-zinc-900">
                Phiếu Xuất Thuốc ({cart.length} mặt hàng)
              </h2>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs text-rose-600 hover:underline"
              >
                Làm trống giỏ
              </button>
            )}
          </div>

          {/* Chọn Hồ sơ Bệnh nhân (CRM) */}
          <div className="rounded-md bg-zinc-50 p-3 border border-zinc-200/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-zinc-600" />
                <span>Hồ sơ Bệnh nhân (Kiểm tra Dị ứng & Tích điểm)</span>
              </label>
            </div>
            <select
              value={selectedCustomerId || ''}
              onChange={(e) =>
                handleSelectCustomer(e.target.value ? Number(e.target.value) : null)
              }
              className="w-full h-8 rounded border border-zinc-300 bg-white px-2.5 text-xs text-zinc-900"
            >
              <option value="">-- Khách vãng lai (Không lưu hồ sơ dị ứng) --</option>
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
              <div className="text-[11px] flex flex-wrap items-center justify-between gap-2 pt-1 text-zinc-600">
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
                  Điểm tích lũy: <strong>{selectedCustomer.LoyaltyPoints} điểm</strong>
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
                  className="h-8 rounded border border-zinc-300 bg-white px-2.5 text-xs"
                />
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Số điện thoại"
                  className="h-8 rounded border border-zinc-300 bg-white px-2.5 text-xs"
                />
              </div>
            )}
          </div>

          {/* CẢNH BÁO TƯƠNG TÁC THUỐC & DỊ ỨNG TỰ ĐỘNG */}
          {interactionCheck && interactionCheck.warnings.length > 0 ? (
            <div className="rounded-md border border-rose-200 bg-rose-50/90 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-800">
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
            <div className="rounded-md border border-emerald-200/80 bg-emerald-50/60 px-3 py-2 flex items-center gap-2 text-xs text-emerald-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Đơn thuốc an toàn: Không phát hiện trùng hoạt chất hay xung đột dị ứng.</span>
            </div>
          ) : null}

          {/* Danh sách thuốc trong giỏ */}
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1 divide-y divide-zinc-100">
            {cart.map((item) => (
              <div key={item.product.ProductID} className="pt-2.5 first:pt-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-900 truncate">
                      {item.product.ProductName}
                    </div>
                    <div className="text-[11px] text-zinc-500 tabular-nums">
                      {formatVND(item.product.Price)} / {item.product.Unit}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.product.ProductID, -1)}
                      className="h-6 w-6 rounded border border-zinc-200 flex items-center justify-center hover:bg-zinc-100"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-7 text-center text-xs font-semibold tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.product.ProductID, 1)}
                      className="h-6 w-6 rounded border border-zinc-200 flex items-center justify-center hover:bg-zinc-100"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCartQty(item.product.ProductID, -item.quantity)}
                      className="h-6 w-6 rounded text-zinc-400 hover:text-rose-600 flex items-center justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
                  placeholder="Hướng dẫn liều dùng trên nhãn thuốc..."
                  className="w-full h-7 rounded border border-zinc-200 bg-zinc-50 px-2 text-[11px] text-zinc-700"
                />
              </div>
            ))}
          </div>

          {/* Tính tiền & Chiết khấu */}
          <div className="border-t border-zinc-200 pt-3 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-600">
              <span>Tổng tiền hàng ({cart.reduce((s, i) => s + i.quantity, 0)} đv):</span>
              <span className="font-medium text-zinc-900 tabular-nums">{formatVND(subTotal)}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-600">Chiết khấu / Giảm giá (VNĐ):</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={discount}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className="w-28 h-7 rounded border border-zinc-300 px-2 text-right text-xs tabular-nums"
              />
            </div>

            <div className="flex justify-between text-sm font-semibold text-zinc-900 pt-1 border-t border-zinc-100">
              <span>Khách cần thanh toán:</span>
              <span className="text-base tabular-nums">{formatVND(finalTotal)}</span>
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
                  className={`flex items-center justify-center gap-1.5 h-9 rounded-md border text-xs font-medium transition-colors ${
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{pm.label}</span>
                </button>
              );
            })}
          </div>

          {paymentMethod === 'CASH' && (
            <div className="grid grid-cols-2 gap-2 rounded-md bg-zinc-50 p-2.5 border border-zinc-200/70 text-xs">
              <div>
                <span className="text-[11px] text-zinc-500 block">Tiền khách đưa:</span>
                <input
                  type="number"
                  value={cashTendered || finalTotal}
                  onChange={(e) => setCashTendered(Number(e.target.value))}
                  className="mt-0.5 w-full h-7 rounded border border-zinc-300 bg-white px-2 tabular-nums"
                />
              </div>
              <div>
                <span className="text-[11px] text-zinc-500 block">Tiền thừa trả khách:</span>
                <div className="mt-1 font-semibold text-emerald-700 tabular-nums">
                  {formatVND(changeAmount)}
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || cart.length === 0}
            className="w-full h-10 rounded-md bg-zinc-900 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting
              ? 'Đang xuất hóa đơn...'
              : `Hoàn tất Thanh toán & Xuất Thuốc (${formatVND(finalTotal)})`}
          </button>
        </form>
      </div>

      {/* Modal Hóa đơn & Mã VietQR vừa tạo */}
      {completedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="border-b border-zinc-200 px-5 py-3.5 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center gap-2 text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold">
                  Xuất Hóa Đơn Thành Công ({completedInvoice.InvoiceCode})
                </h3>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Bệnh nhân / Khách hàng:</span>
                <span className="font-semibold text-zinc-900">{completedInvoice.CustomerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Tổng thanh toán:</span>
                <span className="text-sm font-bold text-zinc-900 tabular-nums">
                  {formatVND(completedInvoice.TotalAmount)}
                </span>
              </div>

              {completedInvoice.payment?.PaymentMethod === 'VIETQR' && (
                <div className="rounded-lg border border-zinc-200 p-3 text-center space-y-2 bg-zinc-50">
                  <div className="text-[11px] font-medium text-zinc-600">
                    Quét mã VietQR Napas247 để đối soát tự động
                  </div>
                  <img
                    src={`https://img.vietqr.io/image/MB-0388889999-compact2.png?amount=${completedInvoice.TotalAmount}&addInfo=${encodeURIComponent(
                      completedInvoice.InvoiceCode
                    )}`}
                    alt="VietQR"
                    className="mx-auto h-48 w-48 rounded border border-zinc-200 bg-white p-1"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3 bg-zinc-50">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>In phiếu GPP</span>
              </button>
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                className="h-8 rounded bg-zinc-900 px-4 text-xs font-medium text-white"
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
