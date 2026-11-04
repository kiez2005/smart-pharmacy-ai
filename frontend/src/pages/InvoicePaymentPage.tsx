import React, { useEffect, useMemo, useState } from 'react';
import {
  Receipt,
  CreditCard,
  Plus,
  Trash2,
  QrCode,
  Banknote,
  CheckCircle2,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '../types/product';
import { InvoiceRecord } from '../types/forms';
import { productApi } from '../services/product.api';
import { formsApi } from '../services/forms.api';

interface CartLineItem {
  product: Product;
  quantity: number;
  dosageNote: string;
}

export const InvoicePaymentPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Form Lập Hóa Đơn (Form 5)
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [cart, setCart] = useState<CartLineItem[]>([]);

  // Form Thanh Toán (Form 6)
  const [paymentMethod, setPaymentMethod] = useState<'VIETQR' | 'CASH' | 'CARD'>('VIETQR');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadData = async () => {
    try {
      const [prodRes, invRes] = await Promise.all([
        productApi.list({ page: 1, limit: 100 }),
        formsApi.listInvoices(),
      ]);
      setProducts(prodRes.items);
      setInvoices(invRes);
    } catch {
      toast.error('Không thể tải dữ liệu thuốc và hóa đơn');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products.filter(
      (p) =>
        p.ProductName.toLowerCase().includes(q) ||
        p.ProductType.toLowerCase().includes(q) ||
        p.Description.toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  const totalAmount = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.Price * item.quantity, 0),
    [cart]
  );

  const handleAddToCart = (product: Product) => {
    if (product.Quantity <= 0) {
      toast.warning(`Thuốc "${product.ProductName}" đã hết hàng trong kho!`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((line) => line.product.ProductID === product.ProductID);
      if (existing) {
        return prev.map((line) =>
          line.product.ProductID === product.ProductID
            ? { ...line, quantity: Math.min(product.Quantity, line.quantity + 1) }
            : line
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          dosageNote: 'Sáng 1 viên, Tối 1 viên sau ăn',
        },
      ];
    });
  };

  const handleRemoveCartItem = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.ProductID !== productId));
  };

  const handleCreateInvoiceAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      toast.warning('Vui lòng nhập tên khách hàng / bệnh nhân');
      return;
    }
    if (cart.length === 0) {
      toast.warning('Vui lòng chọn ít nhất 1 loại thuốc vào hóa đơn');
      return;
    }

    setSubmitting(true);
    try {
      const created = await formsApi.createInvoice({
        CustomerName: customerName,
        CustomerPhone: customerPhone,
        Note: note,
        PaymentMethod: paymentMethod,
        items: cart.map((line) => ({
          ProductID: line.product.ProductID,
          Quantity: line.quantity,
          DosageNote: line.dosageNote,
        })),
      });

      toast.success(
        `Đã lập hóa đơn ${created.InvoiceCode} (${totalAmount.toLocaleString('vi-VN')} ₫) và trừ tồn kho thành công!`
      );
      setCustomerName('');
      setCustomerPhone('');
      setNote('');
      setCart([]);
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Lỗi khi lập hóa đơn';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const vietQrUrl = `https://img.vietqr.io/image/MB-0988123456-compact2.png?amount=${totalAmount}&addInfo=${encodeURIComponent(
    `THANH TOAN THUOC ${customerName || 'KHACH LE'}`
  )}&accountName=${encodeURIComponent('NHA THUOC SMART PHARMACY')}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CỘT TRÁI: CHỌN THUỐC TỪ KHO */}
        <div className="lg:col-span-5 rounded-2xl bg-white p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900">
              1. Chọn Thuốc Từ Kho Dược Phẩm
            </h2>
            <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full">
              {products.length} mặt hàng
            </span>
          </div>

          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm nhanh thuốc để thêm vào đơn..."
              className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {filteredProducts.map((product) => (
              <div
                key={product.ProductID}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 hover:border-teal-400 transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-slate-800 truncate">
                    {product.ProductName}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <span className="font-bold text-teal-700">
                      {product.Price.toLocaleString('vi-VN')} ₫/{product.Unit}
                    </span>
                    <span>•</span>
                    <span>Tồn kho: {product.Quantity}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddToCart(product)}
                  className="inline-flex items-center gap-1 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Chọn</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CỘT PHẢI: FORM HÓA ĐƠN (FORM 5) & FORM THANH TOÁN (FORM 6) */}
        <form
          onSubmit={handleCreateInvoiceAndPay}
          className="lg:col-span-7 rounded-2xl bg-white p-5 shadow-sm border border-slate-200 space-y-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Receipt className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-extrabold text-slate-900">
              2. Form Lập Hóa Đơn Bán Thuốc (POS) & Form Thanh Toán
            </h2>
          </div>

          {/* Thông tin bệnh nhân / khách hàng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Họ tên Bệnh nhân / Khách hàng *
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="VD: Nguyễn Thị Lan Anh"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Số điện thoại liên hệ
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="VD: 0912345678"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-600 mb-1">
                Ghi chú chẩn đoán / triệu chứng lâm sàng
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Đau họng, sốt nhẹ 38 độ, không dị ứng kháng sinh..."
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Danh sách thuốc trong hóa đơn */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-slate-500">
              Chi tiết đơn thuốc ({cart.length} mặt hàng)
            </div>
            {cart.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                Chưa có thuốc nào trong hóa đơn. Hãy bấm nút "Chọn" ở danh sách bên trái.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {cart.map((line) => (
                  <div
                    key={line.product.ProductID}
                    className="rounded-xl bg-slate-50 p-3 border border-slate-200 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-slate-800">
                        {line.product.ProductName}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={line.product.Quantity}
                          value={line.quantity}
                          onChange={(e) => {
                            const val = Math.max(1, Number(e.target.value));
                            setCart((prev) =>
                              prev.map((item) =>
                                item.product.ProductID === line.product.ProductID
                                  ? { ...item, quantity: val }
                                  : item
                              )
                            );
                          }}
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center text-xs font-bold"
                        />
                        <span className="text-xs text-slate-500">{line.product.Unit}</span>
                        <span className="text-xs font-extrabold text-teal-700 w-24 text-right">
                          {(line.product.Price * line.quantity).toLocaleString('vi-VN')} ₫
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCartItem(line.product.ProductID)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={line.dosageNote}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCart((prev) =>
                          prev.map((item) =>
                            item.product.ProductID === line.product.ProductID
                              ? { ...item, dosageNote: val }
                              : item
                          )
                        );
                      }}
                      placeholder="Chỉ dẫn liều dùng (VD: Sáng 1 viên, Tối 1 viên sau ăn)"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FORM THANH TOÁN (FORM 6) */}
          <div className="rounded-2xl bg-slate-900 p-4 text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-400">
                <CreditCard className="h-4 w-4" />
                <span>Phương Thức Thanh Toán (Form Thanh Toán)</span>
              </div>
              <div className="text-lg font-extrabold text-teal-300">
                Tổng cộng: {totalAmount.toLocaleString('vi-VN')} ₫
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: 'VIETQR', label: 'Chuyển khoản VietQR', icon: QrCode },
                { id: 'CASH', label: 'Tiền mặt tại quầy', icon: Banknote },
                { id: 'CARD', label: 'Thẻ ATM / Visa', icon: CreditCard },
              ].map((m) => {
                const Icon = m.icon;
                const active = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as 'VIETQR' | 'CASH' | 'CARD')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-bold border transition ${
                      active
                        ? 'bg-teal-600 border-teal-400 text-white shadow'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'VIETQR' && totalAmount > 0 && (
              <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl bg-white p-3 text-slate-800">
                <img
                  src={vietQrUrl}
                  alt="VietQR Payment"
                  className="h-32 w-32 rounded-lg border border-slate-200 object-contain shrink-0"
                />
                <div className="text-xs space-y-1">
                  <div className="font-extrabold text-teal-700 text-sm">
                    Mã QR Thanh Toán Động (VietQR)
                  </div>
                  <p className="text-slate-600">
                    Số tiền tự động điền: <strong>{totalAmount.toLocaleString('vi-VN')} VNĐ</strong>
                  </p>
                  <p className="text-slate-500">
                    Nội dung CK: <code>THANH TOAN THUOC {customerName || 'KHACH LE'}</code>
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-500 py-3 text-sm font-extrabold text-slate-950 hover:bg-teal-400 disabled:opacity-40 transition"
            >
              <CheckCircle2 className="h-5 w-5" />
              <span>
                {submitting
                  ? 'Đang xử lý thanh toán...'
                  : `Xác Nhận Thanh Toán & Xuất Hóa Đơn (${totalAmount.toLocaleString('vi-VN')} ₫)`}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* LỊCH SỬ HÓA ĐƠN ĐÃ XUẤT */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200 space-y-3">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-700">
          Lịch Sử Hóa Đơn & Giao Dịch Thanh Toán ({invoices.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase">
                <th className="py-2.5 px-3">Mã HĐ</th>
                <th className="py-2.5 px-3">Khách hàng</th>
                <th className="py-2.5 px-3">Danh sách thuốc</th>
                <th className="py-2.5 px-3">Phương thức TT</th>
                <th className="py-2.5 px-3">Tổng tiền</th>
                <th className="py-2.5 px-3">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.InvoiceID} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-mono font-bold text-teal-700">{inv.InvoiceCode}</td>
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-800">{inv.CustomerName}</div>
                    <div className="text-slate-500">{inv.CustomerPhone}</div>
                  </td>
                  <td className="py-3 px-3">
                    {inv.items.map((it) => (
                      <div key={it.ItemID} className="text-slate-700">
                        • {it.product?.ProductName} (x{it.Quantity}) — <em>{it.DosageNote}</em>
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-3">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700 border border-emerald-200">
                      {inv.payment?.PaymentMethod || 'PAID'}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-extrabold text-slate-900">
                    {inv.TotalAmount.toLocaleString('vi-VN')} ₫
                  </td>
                  <td className="py-3 px-3 text-slate-500">
                    {new Date(inv.CreateDate).toLocaleString('vi-VN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
