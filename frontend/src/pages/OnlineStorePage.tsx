import React, { useCallback, useEffect, useState } from 'react';
import {
  ShoppingBag,
  Truck,
  Search,
  Plus,
  Minus,
  Trash2,
  MapPin,
  Phone,
  User,
  Building2,
  CheckCircle2,
  Clock,
  QrCode,
  ShieldCheck,
  Sparkles,
  X,
  SearchCheck,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { formsApi } from '../services/forms.api';
import { Product } from '../types/product';
import { OnlineOrderRecord } from '../types/forms';
import { ModalPortal } from '../components/common/ModalPortal';

interface OnlineCartItem {
  product: Product;
  quantity: number;
  unit: string;
  unitPrice: number;
  dosageNote: string;
}

export const OnlineStorePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'STORE' | 'TRACKING'>('STORE');
  const [buyerMode, setBuyerMode] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<OnlineCartItem[]>([]);

  // Thông tin người nhận & giao vận (Bắt đầu trống - Không điền sẵn danh tính giả mạo)
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [shippingAddress, setShippingAddress] = useState<string>('');
  const [shippingMethod, setShippingMethod] = useState<'EXPRESS_2H' | 'STANDARD' | 'GDP_TRUCK'>('EXPRESS_2H');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'VIETQR' | 'CREDIT'>('COD');
  const [orderNote, setOrderNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Đơn vừa đặt thành công (Hiển thị Mã đơn, Token tra cứu và Đồng hồ đếm ngược giữ kho)
  const [placedOrder, setPlacedOrder] = useState<OnlineOrderRecord | null>(null);

  // Tra cứu đơn hàng độc lập
  const [trackOrderCode, setTrackOrderCode] = useState<string>('');
  const [trackPhoneOrToken, setTrackPhoneOrToken] = useState<string>('');
  const [trackingResult, setTrackingResult] = useState<OnlineOrderRecord | null>(null);
  const [trackingLoading, setTrackingLoading] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await formsApi.listPublicCatalog();
      setProducts(res.items);
    } catch {
      toast.error('Không thể tải danh sách sản phẩm thuốc');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  const categories = ['ALL', ...Array.from(new Set(products.map((p) => p.ProductType)))];

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'ALL' || p.ProductType === selectedCategory;
    const matchesSearch =
      !search.trim() ||
      p.ProductName.toLowerCase().includes(search.toLowerCase()) ||
      p.Description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getEffectivePrice = (product: Product) => {
    const spec = product.packaging;
    if (buyerMode === 'WHOLESALE' && spec && spec.WholesalePrice) {
      return spec.WholesalePrice;
    }
    return product.Price;
  };

  const getAvailableStock = (product: Product) => {
    const spec = product.packaging;
    const reserved = spec?.ReservedBaseQty || 0;
    return Math.max(0, product.Quantity - reserved);
  };

  const addToCart = (product: Product) => {
    const availStock = getAvailableStock(product);
    if (availStock <= 0) {
      toast.error(`"${product.ProductName}" tạm thời hết hàng hoặc đang được giữ tạm.`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((i) => i.product.ProductID === product.ProductID);
      if (existing) {
        if (existing.quantity + 1 > availStock) {
          toast.warning(`Chỉ còn ${availStock} ${product.Unit} khả dụng.`);
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
          unit: product.Unit,
          unitPrice: getEffectivePrice(product),
          dosageNote: 'Uống theo hướng dẫn của Dược sĩ khi nhận hàng',
        },
      ];
    });
    toast.success(`Đã thêm "${product.ProductName}" vào giỏ hàng`);
  };

  const updateCartQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.ProductID !== productId) return item;
          const nextQty = item.quantity + delta;
          const availStock = getAvailableStock(item.product);
          if (nextQty > availStock) {
            toast.warning(`Tồn kho khả dụng chỉ còn ${availStock} ${item.product.Unit}`);
            return item;
          }
          return nextQty > 0 ? { ...item, quantity: nextQty } : null;
        })
        .filter((i): i is OnlineCartItem => Boolean(i))
    );
  };

  const subTotal = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const shippingFee =
    shippingMethod === 'EXPRESS_2H' ? 30000 : shippingMethod === 'GDP_TRUCK' ? 150000 : 15000;
  const vatAmount = buyerMode === 'WHOLESALE' ? Math.round(subTotal * 0.05) : 0;
  const finalTotal = subTotal + shippingFee + vatAmount;

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error('Giỏ thuốc đang trống');
      return;
    }
    if (!customerName.trim()) {
      toast.error('Vui lòng nhập họ và tên người nhận thuốc');
      return;
    }
    if (!customerPhone.trim() || customerPhone.trim().length < 8) {
      toast.error('Vui lòng nhập số điện thoại hợp lệ để Dược sĩ liên hệ tư vấn');
      return;
    }
    if (!shippingAddress.trim() || shippingAddress.trim().length < 6) {
      toast.error('Vui lòng nhập địa chỉ nhận hàng chi tiết');
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const created = await formsApi.createOnlineOrder(
        {
          OrderType: buyerMode,
          CustomerName: customerName.trim(),
          CustomerPhone: customerPhone.trim(),
          ShippingAddress: shippingAddress.trim(),
          ShippingMethod: shippingMethod,
          PaymentMethod: paymentMethod,
          Note: orderNote.trim() || undefined,
          items: cart.map((i) => ({
            ProductID: i.product.ProductID,
            Quantity: i.quantity,
            Unit: i.unit,
            DosageNote: i.dosageNote,
          })),
        },
        idempotencyKey
      );

      setPlacedOrder(created);
      setCart([]);
      toast.success(
        `Đặt hàng thành công! Đơn hàng #${created.OrderCode} đang giữ kho tạm 15 phút chờ Dược sĩ duyệt.`
      );
      await loadProducts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể gửi đơn hàng';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrackOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackOrderCode.trim() || !trackPhoneOrToken.trim()) {
      toast.error('Vui lòng nhập đầy đủ Mã đơn hàng và Số điện thoại đặt hàng');
      return;
    }

    setTrackingLoading(true);
    try {
      const res = await formsApi.trackOnlineOrder(trackOrderCode.trim(), trackPhoneOrToken.trim());
      setTrackingResult(res);
      toast.success(`Đã tìm thấy đơn hàng #${res.OrderCode}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không tìm thấy đơn hàng hoặc thông tin xác thực không khớp';
      toast.error(msg);
      setTrackingResult(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleCustomerCancelOrder = async () => {
    if (!trackingResult) return;
    if (trackingResult.Status !== 'PENDING_REVIEW') {
      toast.error('Đơn hàng đã được Dược sĩ duyệt hoặc đang vận chuyển, không thể tự hủy');
      return;
    }

    setCancelling(true);
    try {
      const updated = await formsApi.customerCancelOnlineOrder(
        trackingResult.OrderID,
        trackPhoneOrToken.trim(),
        'Khách hàng yêu cầu hủy đơn trên Cổng tra cứu'
      );
      setTrackingResult(updated);
      toast.success(`Đã hủy đơn hàng #${updated.OrderCode} thành công. Kho giữ tạm đã được giải phóng.`);
      await loadProducts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể hủy đơn hàng';
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`Đã sao chép ${label} vào bộ nhớ tạm`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Navigation: Cửa hàng vs Tra cứu đơn hàng */}
      <div className="rounded-2xl bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 p-6 text-white shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 border border-teal-400/30">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Nhà Thuốc Tiện Lợi Trực Tuyến · Chuẩn GPP Quốc Gia</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              PharmaCore Direct · Đặt Thuốc Trực Tuyến & Giao Tận Nơi
            </h1>
            <p className="text-xs text-teal-100/90 max-w-2xl">
              100% thuốc chính hãng, nguồn gốc rõ ràng. Dược sĩ lâm sàng thẩm định đơn thuốc an toàn trước khi cấp phát và đóng gói giao nhanh 2 giờ.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-xl border border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('STORE')}
              className={`h-9 px-4 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'STORE'
                  ? 'bg-teal-500 text-white shadow-md'
                  : 'text-teal-100 hover:text-white'
              }`}
            >
              <ShoppingBag className="inline h-3.5 w-3.5 mr-1.5" />
              Cửa Hàng Trực Tuyến
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('TRACKING')}
              className={`h-9 px-4 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'TRACKING'
                  ? 'bg-teal-500 text-white shadow-md'
                  : 'text-teal-100 hover:text-white'
              }`}
            >
              <SearchCheck className="inline h-3.5 w-3.5 mr-1.5" />
              Tra Cứu Tiến Trình Đơn
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'TRACKING' ? (
        /* GIAO DIỆN TRA CỨU ĐƠN HÀNG DÀNH CHO KHÁCH HÀNG (Issue 8) */
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <SearchCheck className="h-5 w-5 text-teal-600" />
              <h2 className="text-base font-bold text-slate-900">Tra Cứu Tình Trạng Đơn Hàng</h2>
            </div>
            <p className="text-xs text-slate-500">
              Nhập chính xác Mã đơn hàng và Số điện thoại bạn đã dùng khi đặt hàng để theo dõi tiến trình xử lý từ Dược sĩ.
            </p>

            <form onSubmit={handleTrackOrder} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mã đơn hàng (Order Code):
                </label>
                <input
                  type="text"
                  value={trackOrderCode}
                  onChange={(e) => setTrackOrderCode(e.target.value)}
                  placeholder="Ví dụ: ORD-2026-10492"
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-xs font-bold font-mono text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số điện thoại người nhận (hoặc Mã bí mật Tracking Token):
                </label>
                <input
                  type="text"
                  value={trackPhoneOrToken}
                  onChange={(e) => setTrackPhoneOrToken(e.target.value)}
                  placeholder="Ví dụ: 0988123456 hoặc TRK-XXXX"
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={trackingLoading}
                className="w-full h-10 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition-colors shadow-2xs"
              >
                {trackingLoading ? 'Đang tra cứu dữ liệu...' : 'Kiểm tra trạng thái đơn hàng'}
              </button>
            </form>
          </div>

          {/* Kết quả tra cứu */}
          {trackingResult && (
            <div className="bg-white rounded-2xl border border-teal-200 p-6 shadow-md space-y-4">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="text-xs text-slate-500">Mã đơn hàng:</div>
                  <div className="text-lg font-extrabold text-teal-800">{trackingResult.OrderCode}</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Ngày đặt: {new Date(trackingResult.CreateDate).toLocaleString('vi-VN')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Tổng tiền thanh toán:</div>
                  <div className="text-base font-extrabold text-slate-900 tabular-nums">
                    {formatVND(trackingResult.TotalAmount)}
                  </div>
                  <div className="text-[11px] font-semibold text-teal-700">
                    {trackingResult.PaymentMethod} · {trackingResult.PaymentStatus}
                  </div>
                </div>
              </div>

              {/* Tiến trình Pipeline */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700">Tiến trình xử lý đơn hàng:</div>
                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <div
                    className={`p-2 rounded-lg border ${
                      trackingResult.Status === 'PENDING_REVIEW'
                        ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    1. Chờ Dược sĩ duyệt
                  </div>
                  <div
                    className={`p-2 rounded-lg border ${
                      trackingResult.Status === 'CONFIRMED' || trackingResult.Status === 'PACKING'
                        ? 'border-blue-400 bg-blue-50 text-blue-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    2. Đã duyệt / Đóng gói
                  </div>
                  <div
                    className={`p-2 rounded-lg border ${
                      trackingResult.Status === 'SHIPPING'
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    3. Đang giao hàng
                  </div>
                  <div
                    className={`p-2 rounded-lg border ${
                      trackingResult.Status === 'DELIVERED'
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900 font-bold'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    4. Đã nhận hàng
                  </div>
                </div>
              </div>

              {/* Thông tin chi tiết */}
              <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1 border border-slate-200">
                <div><strong>Người nhận:</strong> {trackingResult.CustomerName} ({trackingResult.CustomerPhone})</div>
                <div><strong>Địa chỉ:</strong> {trackingResult.ShippingAddress}</div>
                {trackingResult.CourierTrackingCode && (
                  <div className="text-indigo-700 font-mono font-semibold">
                    <strong>Mã vận đơn giao hàng:</strong> {trackingResult.CourierTrackingCode}
                  </div>
                )}
                {trackingResult.RejectCancelReason && (
                  <div className="text-rose-700 font-semibold">
                    <strong>Ghi chú lý do:</strong> {trackingResult.RejectCancelReason}
                  </div>
                )}
              </div>

              {/* Danh sách mặt hàng */}
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-700">Mặt hàng đã đặt:</div>
                <div className="divide-y divide-slate-100 border rounded-xl p-2 text-xs">
                  {trackingResult.items.map((it, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span>
                        {it.Quantity} {it.Unit} × {it.product?.ProductName || `Sản phẩm #${it.ProductID}`}
                      </span>
                      <span className="font-bold tabular-nums">
                        {formatVND(it.Quantity * it.UnitPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Khách tự hủy đơn khi PENDING_REVIEW */}
              {trackingResult.Status === 'PENDING_REVIEW' && (
                <div className="pt-2 border-t flex justify-end">
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => void handleCustomerCancelOrder()}
                    className="h-8 px-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100 transition-colors"
                  >
                    {cancelling ? 'Đang hủy...' : 'Hủy đơn hàng này (Giải phóng giữ kho)'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* GIAO DIỆN CỬA HÀNG TRỰC TUYẾN DÀNH CHO KHÁCH HÀNG */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cột 1 & 2: Danh mục sản phẩm & Lọc */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm kiếm theo tên biệt dược, hoạt chất, quy cách..."
                  className="w-full h-9 rounded-lg border border-slate-300 pl-9 pr-3 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBuyerMode('RETAIL')}
                  className={`h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                    buyerMode === 'RETAIL'
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Mua Lẻ GPP
                </button>
                <button
                  type="button"
                  onClick={() => setBuyerMode('WHOLESALE')}
                  className={`h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
                    buyerMode === 'WHOLESALE'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Building2 className="inline h-3 w-3 mr-1" />
                  Đại Lý Sỉ B2B
                </button>
              </div>
            </div>

            {/* Bộ lọc danh mục */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cat === 'ALL' ? 'Tất cả nhóm thuốc' : cat}
                </button>
              ))}
            </div>

            {/* Lưới sản phẩm */}
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500">Đang tải danh mục dược phẩm...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">Không tìm thấy sản phẩm phù hợp.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {filteredProducts.map((p) => {
                  const availStock = getAvailableStock(p);
                  const price = getEffectivePrice(p);

                  return (
                    <div
                      key={p.ProductID}
                      className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between hover:border-teal-400 hover:shadow-md transition-all"
                    >
                      <div className="space-y-2">
                        <div className="aspect-video w-full rounded-lg bg-slate-100 overflow-hidden relative">
                          <img
                            src={p.PathImage}
                            alt={p.ProductName}
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute top-1.5 left-1.5 rounded-full bg-slate-900/75 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white">
                            {p.ProductType}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-xs font-bold text-slate-900 line-clamp-2">
                            {p.ProductName}
                          </h3>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                            {p.Description}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 mt-2 space-y-2">
                        <div className="flex items-baseline justify-between">
                          <div className="text-sm font-extrabold text-teal-700 tabular-nums">
                            {formatVND(price)}
                            <span className="text-[10px] font-normal text-slate-500 ml-1">
                              / {p.Unit}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Khả dụng: <strong className="text-teal-700">{availStock}</strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={availStock <= 0}
                          onClick={() => addToCart(p)}
                          className={`w-full h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                            availStock <= 0
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : 'bg-teal-600 text-white hover:bg-teal-700 shadow-2xs'
                          }`}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{availStock <= 0 ? 'Tạm hết hàng' : 'Thêm vào giỏ'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cột 3: Giỏ hàng & Form thông tin đặt hàng (Bắt đầu trống) */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5 text-teal-600" />
                  <h2 className="text-sm font-bold text-slate-900">Giỏ Thuốc Trực Tuyến</h2>
                </div>
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
                  {cart.length} món
                </span>
              </div>

              {/* Danh sách giỏ hàng */}
              {cart.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Chưa có thuốc trong giỏ. Vui lòng chọn sản phẩm bên trái.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1">
                  {cart.map((item) => (
                    <div key={item.product.ProductID} className="pt-2.5 first:pt-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {item.product.ProductName}
                          </div>
                          <div className="text-[11px] font-semibold text-teal-700 tabular-nums">
                            {formatVND(item.unitPrice)} / {item.unit}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.product.ProductID, -1)}
                            className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.product.ProductID, 1)}
                            className="h-6 w-6 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Form Thông Tin Nhận Hàng (Không tự điền danh tính giả) */}
              <form onSubmit={handleCheckout} className="border-t pt-3 space-y-3">
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-teal-600" />
                  <span>Thông Tin Người Nhận Thuốc:</span>
                </div>

                <div>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Họ và tên người nhận (*)"
                    className="w-full h-8 rounded-lg border border-slate-300 px-2.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Số điện thoại nhận hàng & tư vấn (*)"
                    className="w-full h-8 rounded-lg border border-slate-300 px-2.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <textarea
                    rows={2}
                    required
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Địa chỉ giao hàng (Số nhà, đường, phường/xã, quận/huyện) (*)"
                    className="w-full rounded-lg border border-slate-300 p-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Hình thức giao hàng:
                  </label>
                  <select
                    value={shippingMethod}
                    onChange={(e) =>
                      setShippingMethod(e.target.value as 'EXPRESS_2H' | 'STANDARD' | 'GDP_TRUCK')
                    }
                    className="w-full h-8 rounded-lg border border-slate-300 px-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="EXPRESS_2H">Giao Hỏa Tốc 2 Giờ (30.000 đ)</option>
                    <option value="STANDARD">Giao Tiết Kiệm Trong Ngày (15.000 đ)</option>
                    {buyerMode === 'WHOLESALE' && (
                      <option value="GDP_TRUCK">Xe Tải Chuyên Dụng GDP (150.000 đ)</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Phương thức thanh toán:
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'COD' | 'VIETQR' | 'CREDIT')
                    }
                    className="w-full h-8 rounded-lg border border-slate-300 px-2 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  >
                    <option value="COD">Thanh toán tiền mặt khi nhận hàng (COD)</option>
                    <option value="VIETQR">Chuyển khoản VietQR tức thì</option>
                    {buyerMode === 'WHOLESALE' && (
                      <option value="CREDIT">Ghi nhận công nợ đại lý B2B</option>
                    )}
                  </select>
                </div>

                <div>
                  <input
                    type="text"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="Ghi chú thêm cho Dược sĩ (VD: bệnh nền, dị ứng)..."
                    className="w-full h-8 rounded-lg border border-slate-300 px-2.5 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                {/* Tổng kết chi phí */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Tiền thuốc:</span>
                    <span className="tabular-nums font-semibold">{formatVND(subTotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Phí vận chuyển:</span>
                    <span className="tabular-nums font-semibold">{formatVND(shippingFee)}</span>
                  </div>
                  {buyerMode === 'WHOLESALE' && (
                    <div className="flex justify-between text-slate-600">
                      <span>Thuế GTGT (5%):</span>
                      <span className="tabular-nums font-semibold">{formatVND(vatAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-extrabold text-teal-800 border-t pt-1">
                    <span>Tổng thanh toán:</span>
                    <span className="tabular-nums">{formatVND(finalTotal)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || cart.length === 0}
                  className={`w-full h-10 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
                    submitting || cart.length === 0
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-teal-600 hover:bg-teal-700'
                  }`}
                >
                  {submitting ? 'Đang gửi đơn hàng...' : 'Gửi Đơn Hàng (Giữ Kho 15 Phút)'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal Đặt hàng thành công & Giữ kho tạm (Issue 5 & 8) */}
      {placedOrder && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
              <div className="text-center space-y-1">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Đặt Thuốc Trực Tuyến Thành Công!</h3>
                <p className="text-xs text-slate-500">
                  Hệ thống đã tự động giữ kho tạm thời trong 15 phút. Dược sĩ lâm sàng sẽ thẩm định đơn ngay.
                </p>
              </div>

              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Mã đơn hàng:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-bold text-teal-700">{placedOrder.OrderCode}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(placedOrder.OrderCode, 'Mã đơn')}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Mã tra cứu bí mật:</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono font-bold text-slate-800">{placedOrder.TrackingToken}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(placedOrder.TrackingToken, 'Mã tra cứu')}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tổng tiền đơn hàng:</span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatVND(placedOrder.TotalAmount)} ({placedOrder.PaymentMethod})
                  </span>
                </div>

                <div className="flex items-center justify-between text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Thời hạn giữ kho:</span>
                  </span>
                  <span className="font-bold">15 phút (Đến {new Date(placedOrder.ReservedUntil || Date.now() + 15 * 60000).toLocaleTimeString('vi-VN')})</span>
                </div>
              </div>

              {placedOrder.PaymentMethod === 'VIETQR' && (
                <div className="text-center p-3 rounded-xl border border-teal-200 bg-teal-50/50 space-y-2">
                  <div className="text-xs font-bold text-teal-900">Mã Chuyển Khoản VietQR Nhanh</div>
                  <img
                    src={`https://api.vietqr.io/image/970422-0988123456-compact.png?amount=${placedOrder.TotalAmount}&addInfo=${placedOrder.OrderCode}&accountName=NHA%20THUOC%20PHARMACORE`}
                    alt="VietQR"
                    className="h-36 w-36 mx-auto rounded-lg border shadow-xs"
                  />
                  <div className="text-[11px] text-slate-600">
                    Nội dung CK: <strong className="font-mono text-teal-800">{placedOrder.OrderCode}</strong>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPlacedOrder(null);
                    setActiveTab('TRACKING');
                    setTrackOrderCode(placedOrder.OrderCode);
                    setTrackPhoneOrToken(placedOrder.CustomerPhone);
                  }}
                  className="flex-1 h-9 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 shadow-2xs"
                >
                  Theo dõi đơn hàng này
                </button>
                <button
                  type="button"
                  onClick={() => setPlacedOrder(null)}
                  className="h-9 px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
