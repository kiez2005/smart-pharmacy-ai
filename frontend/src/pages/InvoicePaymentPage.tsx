import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Trash2,
  QrCode,
  Banknote,
  CreditCard,
  Search,
  Check,
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

  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [cart, setCart] = useState<CartLineItem[]>([]);

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
      toast.error('Không thể tải dữ liệu bán hàng');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return products.slice(0, 14);
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
      toast.warning(`"${product.ProductName}" hiện đã hết tồn kho`);
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
      toast.warning('Vui lòng nhập họ tên khách hàng');
      return;
    }
    if (cart.length === 0) {
      toast.warning('Chưa có sản phẩm nào trong phiếu bán hàng');
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
        `Đã hoàn tất đơn ${created.InvoiceCode} (${totalAmount.toLocaleString('vi-VN')} ₫)`
      );
      setCustomerName('');
      setCustomerPhone('');
      setNote('');
      setCart([]);
      await loadData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể tạo hóa đơn';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const vietQrUrl = `https://img.vietqr.io/image/MB-0988123456-compact2.png?amount=${totalAmount}&addInfo=${encodeURIComponent(
    `PHARMACORE ${customerName || 'KHACH LE'}`
  )}&accountName=${encodeURIComponent('PHARMACORE PHARMACY')}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
          Bán hàng tại quầy (POS) & Thanh toán
        </h1>
        <p className="text-[13px] text-zinc-500 mt-0.5">
          Kê đơn bán lẻ, tự động khấu trừ tồn kho và đối soát thanh toán thời gian thực
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* VÙNG TRÁI: TRA CỨU & CHỌN NHANH DƯỢC PHẨM */}
        <div className="lg:col-span-5 rounded-lg bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Danh mục xuất bán</h2>
            <span className="text-xs text-zinc-400 tabular-nums">{products.length} sản phẩm</span>
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên thuốc hoặc hoạt chất..."
              className="w-full h-9 rounded-md border border-zinc-200 bg-zinc-50/50 pl-8 pr-3 text-[13px] focus:border-zinc-900 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="divide-y divide-zinc-100 max-h-[460px] overflow-y-auto pr-1">
            {filteredProducts.map((product) => (
              <div
                key={product.ProductID}
                className="flex items-center justify-between gap-3 py-2.5 px-1 hover:bg-zinc-50/80 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[13px] text-zinc-900 truncate">
                    {product.ProductName}
                  </div>
                  <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5 tabular-nums flex-wrap">
                    <span className="font-medium text-zinc-800">
                      {product.Price.toLocaleString('vi-VN')} ₫/{product.Unit}
                    </span>
                    <span className="text-zinc-300">•</span>
                    {product.Quantity <= 0 ? (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">
                        HẾT HÀNG (0 {product.Unit})
                      </span>
                    ) : (
                      <span>
                        Tồn: <strong className="text-zinc-800">{product.Quantity} {product.Unit}</strong>
                        {(product.Unit || '').toLowerCase() === 'hộp' && ` (${product.Quantity * 10} Vỉ)`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={product.Quantity <= 0}
                  onClick={() => handleAddToCart(product)}
                  className={`inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors shrink-0 ${
                    product.Quantity <= 0
                      ? 'border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-900 hover:text-white hover:border-zinc-900'
                  }`}
                  title={product.Quantity <= 0 ? 'Thuốc đã hết tồn kho' : 'Thêm vào đơn'}
                >
                  <Plus className="h-3 w-3" />
                  <span>{product.Quantity <= 0 ? 'Hết' : 'Thêm'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* VÙNG PHẢI: PHIẾU BÁN HÀNG & THANH TOÁN */}
        <form
          onSubmit={handleCreateInvoiceAndPay}
          className="lg:col-span-7 rounded-lg bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-semibold text-zinc-900">Phiếu xuất bán lẻ & Thanh toán</h2>
            <span className="text-xs text-zinc-400">Tự động trừ kho sau khi xác nhận</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Khách hàng / Bệnh nhân <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nhập họ tên khách hàng"
                className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Số điện thoại
              </label>
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0912..."
                className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] tabular-nums focus:border-zinc-900 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Ghi chú lâm sàng / Lưu ý đơn thuốc
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nhập ghi chú triệu chứng hoặc hướng dẫn sử dụng chung..."
                className="w-full h-9 rounded-md border border-zinc-200 px-3 text-[13px] focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
              <span>Danh mục sản phẩm trong đơn ({cart.length})</span>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                >
                  Làm trống đơn
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-200 py-8 text-center text-xs text-zinc-400">
                Chọn dược phẩm từ danh mục bên trái để thêm vào phiếu bán hàng
              </div>
            ) : (
              <div className="divide-y divide-zinc-200/70 rounded-md border border-zinc-200 max-h-60 overflow-y-auto">
                {cart.map((line) => (
                  <div key={line.product.ProductID} className="p-3 space-y-2 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[13px] text-zinc-900">
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
                          className="h-7 w-14 rounded border border-zinc-200 px-2 text-center text-xs font-medium tabular-nums"
                        />
                        <span className="text-xs text-zinc-500 w-8">{line.product.Unit}</span>
                        <span className="text-[13px] font-medium text-zinc-900 w-24 text-right tabular-nums">
                          {(line.product.Price * line.quantity).toLocaleString('vi-VN')} ₫
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCartItem(line.product.ProductID)}
                          className="text-zinc-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
                      placeholder="Liều dùng..."
                      className="w-full h-7 rounded border border-zinc-200 bg-zinc-50/60 px-2.5 text-xs text-zinc-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KHU VỰC THANH TOÁN */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-600">Phương thức thanh toán</span>
              <div className="text-base font-semibold text-zinc-900 tabular-nums">
                Tổng thanh toán: {totalAmount.toLocaleString('vi-VN')} ₫
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'VIETQR', label: 'Chuyển khoản QR', icon: QrCode },
                { id: 'CASH', label: 'Tiền mặt', icon: Banknote },
                { id: 'CARD', label: 'Thẻ ngân hàng', icon: CreditCard },
              ].map((m) => {
                const Icon = m.icon;
                const active = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as 'VIETQR' | 'CASH' | 'CARD')}
                    className={`flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-zinc-900 border-zinc-900 text-white'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'VIETQR' && totalAmount > 0 && (
              <div className="flex items-center gap-4 rounded-md bg-white p-3 border border-zinc-200">
                <img
                  src={vietQrUrl}
                  alt="VietQR"
                  className="h-28 w-28 rounded border border-zinc-100 object-contain shrink-0"
                />
                <div className="text-xs space-y-1 text-zinc-600">
                  <div className="font-semibold text-zinc-900 text-[13px]">
                    Quét mã VietQR để thanh toán
                  </div>
                  <p className="tabular-nums">
                    Số tiền: <strong className="text-zinc-900">{totalAmount.toLocaleString('vi-VN')} VNĐ</strong>
                  </p>
                  <p className="text-zinc-400">
                    Nội dung chuyển khoản được điền tự động theo phiếu xuất
                  </p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              className="w-full inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              <Check className="h-4 w-4" />
              <span>
                {submitting
                  ? 'Đang xử lý giao dịch...'
                  : `Hoàn tất thanh toán (${totalAmount.toLocaleString('vi-VN')} ₫)`}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* LỊCH SỬ GIAO DỊCH */}
      <div className="rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] border border-zinc-200/80 overflow-hidden">
        <div className="border-b border-zinc-200/80 px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">Sổ giao dịch hóa đơn gần đây</h3>
          <span className="text-xs text-zinc-400 tabular-nums">{invoices.length} hóa đơn</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-zinc-200/80 bg-zinc-50/60 text-xs font-medium text-zinc-500">
                <th className="py-2.5 px-4 font-medium">Mã chứng từ</th>
                <th className="py-2.5 px-4 font-medium">Khách hàng</th>
                <th className="py-2.5 px-4 font-medium">Chi tiết dược phẩm</th>
                <th className="py-2.5 px-4 font-medium">Hình thức</th>
                <th className="py-2.5 px-4 font-medium">Giá trị</th>
                <th className="py-2.5 px-4 font-medium">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60">
              {invoices.map((inv) => (
                <tr key={inv.InvoiceID} className="hover:bg-zinc-50/70">
                  <td className="py-3 px-4 font-mono text-xs font-medium text-zinc-700 tabular-nums">
                    {inv.InvoiceCode}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-zinc-900">{inv.CustomerName}</div>
                    <div className="text-xs text-zinc-400 tabular-nums">{inv.CustomerPhone}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-600 space-y-0.5">
                    {inv.items.map((it) => (
                      <div key={it.ItemID}>
                        {it.product?.ProductName} <span className="text-zinc-400">×{it.Quantity}</span>
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                      {inv.payment?.PaymentMethod || 'PAID'}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium text-zinc-900 tabular-nums">
                    {inv.TotalAmount.toLocaleString('vi-VN')} ₫
                  </td>
                  <td className="py-3 px-4 text-xs text-zinc-500 tabular-nums">
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
