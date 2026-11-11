import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  PackageCheck,
  QrCode,
  Banknote,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { productApi } from '../services/product.api';
import { formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';
import { Product } from '../types/product';
import { CustomerRecord } from '../types/enterprise';
import { InvoiceRecord } from '../types/forms';
import { ModalPortal } from '../components/common/ModalPortal';

interface OnlineCartItem {
  product: Product;
  quantity: number;
  unit: string;
  unitPrice: number;
  dosageNote: string;
}

export const OnlineStorePage: React.FC = () => {
  const [activeView, setActiveView] = useState<'STOREFRONT' | 'FULFILLMENT'>('STOREFRONT');
  const [buyerMode, setBuyerMode] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<OnlineCartItem[]>([]);

  // Thông tin người nhận & giao vận
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [recipientName, setRecipientName] = useState<string>('Nguyễn Minh Anh');
  const [recipientPhone, setRecipientPhone] = useState<string>('0988123456');
  const [shippingAddress, setShippingAddress] = useState<string>(
    'Số 235 Hoàng Quốc Việt, Phường Cổ Nhuế 1, Quận Bắc Từ Liêm, Hà Nội'
  );
  const [shippingMethod, setShippingMethod] = useState<'EXPRESS_2H' | 'STANDARD' | 'GDP_TRUCK'>(
    'EXPRESS_2H'
  );
  const [paymentMethod, setPaymentMethod] = useState<'VIETQR' | 'COD' | 'CREDIT'>('COD');
  const [orderNote, setOrderNote] = useState<string>(
    'Giao giờ hành chính, dược sĩ gọi tư vấn liều dùng khi nhận thuốc'
  );
  const [includeVat, setIncludeVat] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Modal xem vận đơn / tem giao hàng
  const [selectedOrderLabel, setSelectedOrderLabel] = useState<InvoiceRecord | null>(null);
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>('ALL');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, custRes, invRes] = await Promise.all([
        productApi.list({ page: 1, limit: 100 }),
        enterpriseApi.getCustomers(),
        formsApi.listInvoices(),
      ]);
      setProducts(prodRes.items);
      setCustomers(custRes);
      setInvoices(invRes);
    } catch {
      toast.error('Không thể tải dữ liệu Cổng Nhà Thuốc Trực Tuyến');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  const handleSwitchBuyerMode = (mode: 'RETAIL' | 'WHOLESALE') => {
    setBuyerMode(mode);
    setCart([]);
    if (mode === 'WHOLESALE') {
      const agency = customers.find((c) => c.CustomerType === 'WHOLESALE');
      if (agency) {
        setSelectedCustomerId(agency.CustomerID);
        setRecipientName(agency.CompanyName || agency.FullName);
        setRecipientPhone(agency.Phone);
        setShippingAddress(
          agency.Address || 'Số 108 Phố Vọng, Quận Hai Bà Trưng, Hà Nội'
        );
      }
      setShippingMethod('GDP_TRUCK');
      setPaymentMethod('CREDIT');
      setIncludeVat(true);
      setOrderNote('Đặt sỉ B2B trực tuyến - Giao xe lạnh chuẩn GDP kèm phiếu kiểm nghiệm lô');
    } else {
      setSelectedCustomerId(null);
      setRecipientName('Nguyễn Minh Anh');
      setRecipientPhone('0988123456');
      setShippingAddress('Số 235 Hoàng Quốc Việt, Phường Cổ Nhuế 1, Quận Bắc Từ Liêm, Hà Nội');
      setShippingMethod('EXPRESS_2H');
      setPaymentMethod('COD');
      setIncludeVat(false);
      setOrderNote('Giao giờ hành chính, dược sĩ gọi tư vấn liều dùng khi nhận thuốc');
    }
  };

  const handleSelectCustomer = (cid: number | null) => {
    setSelectedCustomerId(cid);
    if (!cid) return;
    const found = customers.find((c) => c.CustomerID === cid);
    if (found) {
      setRecipientName(found.CompanyName || found.FullName);
      setRecipientPhone(found.Phone);
      if (found.Address) setShippingAddress(found.Address);
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
        p.Description.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, search]);

  const getWholesaleBoxPrice = (p: Product) =>
    p.packaging?.WholesalePrice ?? Math.round((p.Price * 0.88) / 500) * 500;

  const addToOnlineCart = (product: Product, unitType: 'BASE' | 'BLISTER' | 'CARTON') => {
    if (product.Quantity <= 0) {
      toast.error(`Sản phẩm "${product.ProductName}" tạm hết hàng trực tuyến`);
      return;
    }
    const pkg = product.packaging;
    const boxesPerCarton = pkg?.BoxesPerCarton ?? 20;
    const blistersPerBox = pkg?.BlistersPerPackage ?? 10;
    const wholesaleBoxPrice = getWholesaleBoxPrice(product);

    let unit = product.Unit;
    let unitPrice = buyerMode === 'WHOLESALE' ? wholesaleBoxPrice : product.Price;
    let defaultQty = buyerMode === 'WHOLESALE' && unitType === 'BASE' ? 5 : 1;

    if (unitType === 'CARTON') {
      unit = pkg?.CartonUnit || 'Thùng';
      unitPrice = Math.round(wholesaleBoxPrice * boxesPerCarton * 0.96);
      defaultQty = 1;
    } else if (unitType === 'BLISTER') {
      unit = pkg?.BlisterUnit || 'Vỉ';
      unitPrice = Math.max(1000, Math.round(product.Price / blistersPerBox));
      defaultQty = 2;
    }

    setCart((prev) => {
      const existing = prev.find(
        (i) => i.product.ProductID === product.ProductID && i.unit === unit
      );
      if (existing) {
        return prev.map((i) =>
          i.product.ProductID === product.ProductID && i.unit === unit
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          product,
          quantity: defaultQty,
          unit,
          unitPrice,
          dosageNote:
            buyerMode === 'WHOLESALE'
              ? `Đặt sỉ Online (${unit})`
              : 'Dược sĩ tư vấn liều dùng qua điện thoại & kèm hướng dẫn trong gói hàng',
        },
      ];
    });
    toast.success(`Đã thêm ${defaultQty} ${unit} "${product.ProductName}" vào giỏ đặt hàng Online`);
  };

  const updateQty = (productId: number, unit: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.ProductID !== productId || item.unit !== unit) return item;
          const next = item.quantity + delta;
          return next > 0 ? { ...item, quantity: next } : null;
        })
        .filter((i): i is OnlineCartItem => Boolean(i))
    );
  };

  const subTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const shippingFee = useMemo(() => {
    if (cart.length === 0) return 0;
    if (buyerMode === 'WHOLESALE' || shippingMethod === 'GDP_TRUCK') return 0;
    if (subTotal >= 300000) return 0;
    return shippingMethod === 'EXPRESS_2H' ? 30000 : 15000;
  }, [cart.length, buyerMode, shippingMethod, subTotal]);

  const vatAmount = includeVat ? Math.round(subTotal * 0.05) : 0;
  const finalTotal = subTotal + vatAmount + shippingFee;

  const handlePlaceOnlineOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 sản phẩm vào giỏ đặt hàng Online');
      return;
    }
    if (!recipientName.trim() || !recipientPhone.trim() || !shippingAddress.trim()) {
      toast.error('Vui lòng điền đầy đủ Họ tên, Số điện thoại và Địa chỉ nhận thuốc');
      return;
    }
    if (paymentMethod === 'CREDIT' && !selectedCustomerId) {
      toast.error('Vui lòng chọn tài khoản Đại lý B2B để đặt hàng ghi công nợ');
      return;
    }

    setSubmitting(true);
    try {
      const created = await formsApi.createInvoice({
        CustomerID: selectedCustomerId,
        CustomerName: recipientName,
        CustomerPhone: recipientPhone,
        OrderType: buyerMode,
        Channel: 'ONLINE',
        ShippingAddress: shippingAddress,
        ShippingMethod:
          shippingMethod === 'EXPRESS_2H'
            ? 'Giao Hỏa Tốc Nội Thành 2H (GPP)'
            : shippingMethod === 'GDP_TRUCK'
            ? 'Xe Lạnh Chuyên Dụng GDP (B2B)'
            : 'Giao Tiêu Chuẩn Toàn Quốc',
        ShippingFee: shippingFee,
        VatRate: includeVat ? 5 : 0,
        Discount: 0,
        PaidAmount: paymentMethod === 'VIETQR' ? finalTotal : 0,
        PaymentMethod: paymentMethod,
        Note: orderNote,
        items: cart.map((i) => ({
          ProductID: i.product.ProductID,
          Quantity: i.quantity,
          Unit: i.unit,
          DosageNote: i.dosageNote,
        })),
      });

      setCart([]);
      setSelectedOrderLabel(created);
      toast.success(
        `Đặt hàng Online thành công (${created.InvoiceCode})! Đơn đã chuyển sang Trung tâm Điều phối.`
      );
      await loadData();
      setActiveView('FULFILLMENT');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể tạo đơn đặt hàng trực tuyến';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateFulfillment = async (
    invoiceId: number,
    nextStatus: 'CONFIRMED' | 'SHIPPING' | 'COMPLETED'
  ) => {
    try {
      await formsApi.updateFulfillmentStatus(invoiceId, nextStatus);
      const labelMap = {
        CONFIRMED: 'Đã xác nhận đơn & Đóng gói chuẩn GPP/GDP',
        SHIPPING: 'Đã bàn giao đơn vị vận chuyển / Xe lạnh GDP',
        COMPLETED: 'Đã giao hàng thành công & Đối soát thanh toán COD',
      };
      toast.success(labelMap[nextStatus]);
      await loadData();
    } catch {
      toast.error('Không thể cập nhật trạng thái vận đơn');
    }
  };

  const onlineInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const isOnline = inv.Channel === 'ONLINE' || inv.InvoiceCode.startsWith('ONL-');
      if (!isOnline) return false;
      if (fulfillmentFilter === 'ALL') return true;
      return (inv.FulfillmentStatus || 'COMPLETED') === fulfillmentFilter;
    });
  }, [invoices, fulfillmentFilter]);

  const fulfillmentMetrics = useMemo(() => {
    const allOnline = invoices.filter(
      (i) => i.Channel === 'ONLINE' || i.InvoiceCode.startsWith('ONL-')
    );
    return {
      total: allOnline.length,
      pending: allOnline.filter((i) => i.FulfillmentStatus === 'PENDING').length,
      shipping: allOnline.filter(
        (i) => i.FulfillmentStatus === 'CONFIRMED' || i.FulfillmentStatus === 'SHIPPING'
      ).length,
      completed: allOnline.filter((i) => i.FulfillmentStatus === 'COMPLETED').length,
    };
  }, [invoices]);

  return (
    <div className="space-y-5">
      {/* Header & Chuyển đổi giữa Cửa Hàng Online vs Điều Phối Giao Hàng */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Nhà Thuốc Trực Tuyến (E-Pharmacy) & Điều Phối Giao Vận
            </h1>
            <span className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200">
              B2C Giao Nhanh 2H · Đặt Sỉ B2B Online
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Cổng đặt thuốc trực tuyến cho bệnh nhân lẻ & đại lý B2B, tự động trừ kho thực tế và theo dõi hành trình vận đơn (COD / VietQR).
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 w-fit">
          <button
            type="button"
            onClick={() => setActiveView('STOREFRONT')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeView === 'STOREFRONT'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>1. Cửa Hàng Đặt Thuốc Online</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('FULFILLMENT')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeView === 'FULFILLMENT'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="h-3.5 w-3.5" />
            <span>
              2. Điều Phối & Giao Hàng ({fulfillmentMetrics.total})
            </span>
            {fulfillmentMetrics.pending > 0 && (
              <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {fulfillmentMetrics.pending} mới
              </span>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: CỬA HÀNG ĐẶT THUỐC TRỰC TUYẾN (B2C & B2B) */}
      {activeView === 'STOREFRONT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Cột Trái (7 cols): Kệ Thuốc Online */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
            {/* Banner chọn đối tượng mua hàng Online */}
            <div
              className={`rounded-xl p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                buyerMode === 'WHOLESALE'
                  ? 'bg-indigo-50/70 border-indigo-200'
                  : 'bg-teal-50/70 border-teal-200'
              }`}
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Sparkles className="h-4 w-4 text-teal-600" />
                  <span>
                    {buyerMode === 'WHOLESALE'
                      ? 'Cổng Đặt Sỉ Trực Tuyến dành cho Đại Lý / Phòng Khám (Giá B2B)'
                      : 'Cổng Đặt Thuốc Online Giao Tận Nhà 2H (Miễn phí ship đơn từ 300.000đ)'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {buyerMode === 'WHOLESALE'
                    ? 'Chiết khấu trực tiếp theo Thùng/Hộp, miễn phí giao xe lạnh chuẩn GDP và hỗ trợ công nợ 30 ngày.'
                    : 'Dược sĩ đại học kiểm duyệt đơn thuốc, đóng gói niêm phong GPP và giao nhanh nội thành.'}
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSwitchBuyerMode('RETAIL')}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                    buyerMode === 'RETAIL'
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Khách lẻ B2C
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchBuyerMode('WHOLESALE')}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                    buyerMode === 'WHOLESALE'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Đại lý Sỉ B2B
                </button>
              </div>
            </div>

            {/* Tìm kiếm & Lọc nhóm */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm kiếm thuốc, vitamin, thiết bị y tế đặt giao tận nơi..."
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
                    {cat === 'ALL' ? 'Tất cả danh mục' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Danh sách sản phẩm trên kệ Online */}
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Đang tải danh mục thuốc trực tuyến...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[540px] overflow-y-auto pr-1">
                {filteredProducts.map((p) => {
                  const wholesalePrice = getWholesaleBoxPrice(p);
                  const boxesPerCarton = p.packaging?.BoxesPerCarton ?? 20;
                  const isBox = p.Unit === 'Hộp';
                  return (
                    <div
                      key={p.ProductID}
                      className="rounded-xl border border-slate-200/90 p-3 hover:border-teal-500 transition-all flex gap-3 bg-white"
                    >
                      <img
                        src={p.PathImage}
                        alt={p.ProductName}
                        className="h-14 w-14 rounded-lg border border-slate-200 object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                            {p.ProductType}
                          </span>
                          <span className="text-[10px] font-medium text-slate-500">
                            Còn {p.Quantity} {p.Unit}
                          </span>
                        </div>
                        <div className="text-xs font-bold text-slate-900 truncate mt-1">
                          {p.ProductName}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">{p.Description}</p>

                        <div className="mt-2 flex items-center justify-between gap-1">
                          <div>
                            <span className="text-xs font-bold text-teal-700 tabular-nums block">
                              {buyerMode === 'WHOLESALE'
                                ? `${formatVND(wholesalePrice)}/${p.Unit}`
                                : `${formatVND(p.Price)}/${p.Unit}`}
                            </span>
                            {buyerMode === 'WHOLESALE' && (
                              <span className="text-[10px] text-slate-400 line-through tabular-nums">
                                Lẻ: {formatVND(p.Price)}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {buyerMode === 'WHOLESALE' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={p.Quantity < boxesPerCarton}
                                  onClick={() => addToOnlineCart(p, 'CARTON')}
                                  className="h-7 rounded-lg border border-indigo-200 bg-indigo-50 px-2 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-600 hover:text-white disabled:opacity-40"
                                >
                                  +Thùng
                                </button>
                                <button
                                  type="button"
                                  disabled={p.Quantity <= 0}
                                  onClick={() => addToOnlineCart(p, 'BASE')}
                                  className="h-7 rounded-lg bg-indigo-600 px-2.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                                >
                                  +5 {p.Unit}
                                </button>
                              </>
                            ) : (
                              <>
                                {isBox && (
                                  <button
                                    type="button"
                                    disabled={p.Quantity <= 0}
                                    onClick={() => addToOnlineCart(p, 'BLISTER')}
                                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
                                  >
                                    +Vỉ lẻ
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={p.Quantity <= 0}
                                  onClick={() => addToOnlineCart(p, 'BASE')}
                                  className="h-7 rounded-lg bg-teal-600 px-2.5 text-[11px] font-semibold text-white hover:bg-teal-700"
                                >
                                  +Đặt {p.Unit}
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
            )}
          </div>

          {/* Cột Phải (5 cols): Giỏ Đặt Hàng Trực Tuyến & Thông Tin Giao Vận */}
          <form
            onSubmit={handlePlaceOnlineOrder}
            className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-teal-600" />
                <h2 className="text-sm font-bold text-slate-900">
                  Thông Tin Giao Thuốc Tận Nơi ({cart.length} món)
                </h2>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-semibold text-rose-600 hover:underline"
                >
                  Xóa giỏ
                </button>
              )}
            </div>

            {/* Chọn khách hàng / đại lý có sẵn hoặc nhập mới */}
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80 space-y-2.5">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                {buyerMode === 'WHOLESALE' ? (
                  <>
                    <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Chọn Tài khoản Đại lý B2B đặt hàng:</span>
                  </>
                ) : (
                  <>
                    <User className="h-3.5 w-3.5 text-teal-600" />
                    <span>Chọn Hồ sơ Khách hàng (hoặc nhập địa chỉ giao mới):</span>
                  </>
                )}
              </label>

              <select
                value={selectedCustomerId || ''}
                onChange={(e) =>
                  handleSelectCustomer(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900"
              >
                <option value="">-- Nhập thông tin người nhận trực tiếp bên dưới --</option>
                {customers
                  .filter((c) =>
                    buyerMode === 'WHOLESALE' ? c.CustomerType === 'WHOLESALE' : true
                  )
                  .map((c) => (
                    <option key={c.CustomerID} value={c.CustomerID}>
                      [{c.CustomerCode}] {c.CompanyName || c.FullName} - {c.Phone}
                    </option>
                  ))}
              </select>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Họ tên người nhận / Đại lý *"
                    className="w-full h-8 rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 text-xs text-slate-900"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="Số điện thoại nhận hàng *"
                    className="w-full h-8 rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="relative">
                <MapPin className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Địa chỉ nhận thuốc chi tiết (Số nhà, Phường/Xã, Quận/Huyện) *"
                  className="w-full h-8 rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Danh sách sản phẩm trong giỏ Online */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Chưa có sản phẩm nào trong giỏ đặt hàng trực tuyến.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={`${item.product.ProductID}-${item.unit}`}
                    className="pt-2.5 first:pt-0 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {item.product.ProductName}
                      </div>
                      <div className="text-[11px] text-teal-700 font-semibold tabular-nums">
                        {formatVND(item.unitPrice)} / {item.unit}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQty(item.product.ProductID, item.unit, -1)}
                        className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-bold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.product.ProductID, item.unit, 1)}
                        className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateQty(item.product.ProductID, item.unit, -item.quantity)
                        }
                        className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Chọn hình thức giao vận */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 block">
                Phương thức Vận chuyển Bảo quản Dược phẩm:
              </label>
              <div className="grid grid-cols-1 gap-1.5 text-xs">
                <label
                  className={`flex items-center justify-between rounded-lg border p-2.5 cursor-pointer ${
                    shippingMethod === 'EXPRESS_2H'
                      ? 'border-teal-600 bg-teal-50/50'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shippingMethod"
                      checked={shippingMethod === 'EXPRESS_2H'}
                      onChange={() => setShippingMethod('EXPRESS_2H')}
                    />
                    <div>
                      <div className="font-bold text-slate-900">
                        Giao Hỏa Tốc Nội Thành 2H (Túi giữ nhiệt GPP)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Miễn phí cho đơn từ 300.000đ
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-teal-700">
                    {subTotal >= 300000 ? 'Miễn phí' : '30.000 ₫'}
                  </span>
                </label>

                <label
                  className={`flex items-center justify-between rounded-lg border p-2.5 cursor-pointer ${
                    shippingMethod === 'STANDARD'
                      ? 'border-teal-600 bg-teal-50/50'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shippingMethod"
                      checked={shippingMethod === 'STANDARD'}
                      onChange={() => setShippingMethod('STANDARD')}
                    />
                    <div>
                      <div className="font-bold text-slate-900">
                        Giao Tiêu Chuẩn Toàn Quốc (24h - 48h)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Đóng thùng chống sốc & niêm phong GPP
                      </div>
                    </div>
                  </div>
                  <span className="font-bold text-teal-700">
                    {subTotal >= 300000 ? 'Miễn phí' : '15.000 ₫'}
                  </span>
                </label>

                {buyerMode === 'WHOLESALE' && (
                  <label
                    className={`flex items-center justify-between rounded-lg border p-2.5 cursor-pointer ${
                      shippingMethod === 'GDP_TRUCK'
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="shippingMethod"
                        checked={shippingMethod === 'GDP_TRUCK'}
                        onChange={() => setShippingMethod('GDP_TRUCK')}
                      />
                      <div>
                        <div className="font-bold text-indigo-900">
                          Xe Lạnh Chuyên Dụng GDP (Đơn Sỉ Đại Lý B2B)
                        </div>
                        <div className="text-[11px] text-indigo-600">
                          Bàn giao kèm biên bản kiểm soát nhiệt độ 2-8°C
                        </div>
                      </div>
                    </div>
                    <span className="font-bold text-emerald-700">Miễn phí</span>
                  </label>
                )}
              </div>
            </div>

            {/* Phương thức thanh toán Online */}
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'COD', label: 'Tiền mặt COD', icon: Banknote },
                  { id: 'VIETQR', label: 'Chuyển khoản QR', icon: QrCode },
                  { id: 'CREDIT', label: 'Công nợ B2B', icon: FileSpreadsheet },
                ] as const
              ).map((pm) => {
                const Icon = pm.icon;
                const active = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`flex items-center justify-center gap-1.5 h-9 rounded-lg border text-xs font-semibold ${
                      active
                        ? 'border-teal-600 bg-teal-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{pm.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tổng kết đơn Online */}
            <div className="border-t border-slate-200 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Tạm tính tiền thuốc:</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatVND(subTotal)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Phí vận chuyển bảo quản:</span>
                <span className="font-semibold text-emerald-700 tabular-nums">
                  {shippingFee === 0 ? 'Miễn phí (0 ₫)' : formatVND(shippingFee)}
                </span>
              </div>
              {includeVat && (
                <div className="flex justify-between text-slate-600">
                  <span>Thuế GTGT Dược phẩm (VAT 5%):</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    +{formatVND(vatAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1.5 border-t border-slate-100">
                <span>Tổng thanh toán đơn Online:</span>
                <span className="text-base text-teal-700 tabular-nums">
                  {formatVND(finalTotal)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || cart.length === 0}
              className="w-full h-10 rounded-lg bg-teal-600 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              {submitting
                ? 'Đang khởi tạo vận đơn...'
                : `Đặt Hàng Trực Tuyến & Xuất Vận Đơn (${formatVND(finalTotal)})`}
            </button>
          </form>
        </div>
      )}

      {/* VIEW 2: TRUNG TÂM ĐIỀU PHỐI & GIAO VẬN ĐƠN ONLINE (FULFILLMENT PIPELINE) */}
      {activeView === 'FULFILLMENT' && (
        <div className="space-y-4">
          {/* 4 Thẻ KPI Điều phối */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="text-xs font-medium text-slate-500">Tổng đơn đặt Online</div>
              <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
                {fulfillmentMetrics.total} đơn
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Kênh Web B2C & Portal B2B</div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
              <div className="text-xs font-semibold text-amber-800">
                1. Chờ Dược sĩ Duyệt & Soạn hàng
              </div>
              <div className="mt-1.5 text-2xl font-bold text-amber-700 tabular-nums">
                {fulfillmentMetrics.pending} đơn
              </div>
              <div className="mt-1 text-[11px] text-amber-700">Cần kiểm tra đơn & đóng gói</div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 shadow-2xs">
              <div className="text-xs font-semibold text-sky-800">
                2. Đã Đóng Gói & Đang Giao
              </div>
              <div className="mt-1.5 text-2xl font-bold text-sky-700 tabular-nums">
                {fulfillmentMetrics.shipping} đơn
              </div>
              <div className="mt-1 text-[11px] text-sky-700">Shipper / Xe lạnh GDP đang giao</div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
              <div className="text-xs font-semibold text-emerald-800">
                3. Giao Thành Công & Đã Thu COD
              </div>
              <div className="mt-1.5 text-2xl font-bold text-emerald-700 tabular-nums">
                {fulfillmentMetrics.completed} đơn
              </div>
              <div className="mt-1 text-[11px] text-emerald-700">Đã đối soát doanh thu sổ quỹ</div>
            </div>
          </div>

          {/* Bộ lọc trạng thái vận đơn */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: 'ALL', label: 'Tất cả đơn Online' },
                  { id: 'PENDING', label: 'Chờ xác nhận (PENDING)' },
                  { id: 'CONFIRMED', label: 'Đã đóng gói (CONFIRMED)' },
                  { id: 'SHIPPING', label: 'Đang giao hàng (SHIPPING)' },
                  { id: 'COMPLETED', label: 'Đã giao thành công (COMPLETED)' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFulfillmentFilter(tab.id)}
                    className={`h-8 rounded-lg px-3 text-xs font-semibold transition-colors ${
                      fulfillmentFilter === tab.id
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bảng điều phối đơn hàng Online */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase text-slate-500">
                    <th className="py-3 px-3">Mã Vận Đơn / Loại</th>
                    <th className="py-3 px-3">Người nhận & Địa chỉ giao</th>
                    <th className="py-3 px-3">Chi tiết thuốc</th>
                    <th className="py-3 px-3 text-right">Tổng thu / COD</th>
                    <th className="py-3 px-3">Tiến trình Giao Vận</th>
                    <th className="py-3 px-3 text-right">Điều phối nhanh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 text-xs">
                  {onlineInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-400">
                        Chưa có đơn đặt thuốc trực tuyến nào ở trạng thái này. Hãy sang tab "1. Cửa Hàng Đặt Thuốc Online" để tạo đơn mẫu!
                      </td>
                    </tr>
                  ) : (
                    onlineInvoices.map((inv) => {
                      const fStatus = inv.FulfillmentStatus || 'COMPLETED';
                      return (
                        <tr key={inv.InvoiceID} className="hover:bg-slate-50/80">
                          <td className="py-3 px-3">
                            <div className="font-mono font-bold text-slate-900">
                              {inv.InvoiceCode}
                            </div>
                            <span
                              className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold border ${
                                inv.OrderType === 'WHOLESALE'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : 'bg-teal-50 text-teal-700 border-teal-200'
                              }`}
                            >
                              {inv.OrderType === 'WHOLESALE' ? 'Đơn Sỉ B2B' : 'Đơn Lẻ B2C'}
                            </span>
                          </td>

                          <td className="py-3 px-3 max-w-[240px]">
                            <div className="font-bold text-slate-900">
                              {inv.CustomerName} · {inv.CustomerPhone}
                            </div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">
                              {inv.ShippingAddress || 'Nhận tại nhà thuốc'}
                            </div>
                            <div className="text-[10px] font-semibold text-sky-700 mt-0.5">
                              {inv.ShippingMethod || 'Giao nhanh 2H'}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <div className="space-y-0.5">
                              {inv.items.map((it) => (
                                <div key={it.ItemID} className="text-[11px] text-slate-700">
                                  • {it.product?.ProductName} ×{' '}
                                  <strong>
                                    {it.Quantity} {it.Unit || it.product?.Unit}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right tabular-nums">
                            <div className="font-bold text-slate-900">
                              {formatVND(inv.TotalAmount)}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {inv.payment?.PaymentMethod || 'COD'} ·{' '}
                              {(inv.DebtAmount ?? 0) > 0
                                ? `Cần thu: ${formatVND(inv.DebtAmount || 0)}`
                                : 'Đã thu đủ'}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            {fStatus === 'PENDING' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                                <Clock className="h-3 w-3" /> Chờ duyệt đơn
                              </span>
                            )}
                            {fStatus === 'CONFIRMED' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200">
                                <PackageCheck className="h-3 w-3" /> Đã đóng gói GPP
                              </span>
                            )}
                            {fStatus === 'SHIPPING' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 border border-sky-200">
                                <Truck className="h-3 w-3" /> Đang giao hàng
                              </span>
                            )}
                            {fStatus === 'COMPLETED' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" /> Giao hoàn tất
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {fStatus === 'PENDING' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateFulfillment(inv.InvoiceID, 'CONFIRMED')
                                  }
                                  className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700"
                                >
                                  Duyệt & Đóng gói
                                </button>
                              )}
                              {fStatus === 'CONFIRMED' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateFulfillment(inv.InvoiceID, 'SHIPPING')
                                  }
                                  className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-sky-700"
                                >
                                  Giao Shipper
                                </button>
                              )}
                              {fStatus === 'SHIPPING' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleUpdateFulfillment(inv.InvoiceID, 'COMPLETED')
                                  }
                                  className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
                                >
                                  Hoàn tất & Thu COD
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedOrderLabel(inv)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Printer className="h-3 w-3" />
                                <span>In Tem</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IN TEM VẬN ĐƠN GPP / GDP */}
      {selectedOrderLabel && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Phiếu Giao Vận Dược Phẩm ({selectedOrderLabel.InvoiceCode})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrderLabel(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-5 space-y-3 text-xs">
                <div className="rounded-lg border-2 border-dashed border-slate-300 p-3.5 space-y-2">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                    <span className="font-bold text-teal-800">PHARMACORE GPP/GDP EXPRESS</span>
                    <span className="font-mono font-bold text-slate-900">
                      {selectedOrderLabel.InvoiceCode}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Người nhận:</span>{' '}
                    <strong className="text-slate-900">
                      {selectedOrderLabel.CustomerName} ({selectedOrderLabel.CustomerPhone})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Địa chỉ giao:</span>{' '}
                    <strong className="text-slate-800">
                      {selectedOrderLabel.ShippingAddress || 'Tại quầy'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Hình thức vận chuyển:</span>{' '}
                    <span className="font-semibold text-sky-700">
                      {selectedOrderLabel.ShippingMethod || 'Giao nhanh 2H'}
                    </span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                    <span className="font-semibold text-slate-600">Tiền thu hộ COD / Tổng đơn:</span>
                    <span className="text-base font-bold text-rose-600 tabular-nums">
                      {formatVND(selectedOrderLabel.TotalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 bg-slate-50">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>In Tem Giao Hàng</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOrderLabel(null)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700"
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
