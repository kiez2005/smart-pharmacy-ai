import React, { useEffect, useState } from 'react';
import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Truck,
  QrCode,
  Banknote,
  Building2,
  ShieldCheck,
  AlertTriangle,
  UploadCloud,
  CheckCircle2,
  Copy,
  Clock,
  SearchCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { storeApi } from '../services/api';
import { CartItem, OnlineOrderRecord, UnitMode } from '../types';
import { formatVND, getMaxStockForMode } from '../utils/packaging';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQty: (productId: number, unitMode: UnitMode, delta: number) => void;
  onRemoveItem: (productId: number, unitMode: UnitMode) => void;
  onClearCart: () => void;
  onOrderSuccess: (order: OnlineOrderRecord) => void;
  onTrackOrder: (orderCode: string, trackingToken: string) => void;
  onOpenB2BQuoteModal: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cart,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onOrderSuccess,
  onTrackOrder,
  onOpenB2BQuoteModal,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingMethod, setShippingMethod] = useState<'EXPRESS_2H' | 'STANDARD'>('EXPRESS_2H');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'VIETQR'>('COD');
  const [patientAllergies, setPatientAllergies] = useState('');
  const [prescriptionFileKey, setPrescriptionFileKey] = useState('');
  const [prescriptionPreviewUrl, setPrescriptionPreviewUrl] = useState('');
  const [prescriptionFileName, setPrescriptionFileName] = useState('');
  const [uploadingRx, setUploadingRx] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<OnlineOrderRecord | null>(null);

  useEffect(() => {
    return () => {
      if (prescriptionPreviewUrl) URL.revokeObjectURL(prescriptionPreviewUrl);
    };
  }, [prescriptionPreviewUrl]);

  if (!isOpen) return null;

  const hasRxItem = cart.some((item) => item.product.IsRx);
  const subTotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  // Khớp chính xác công thức tính phí vận chuyển của Server (miễn phí đơn từ 300.000đ)
  const shippingFee = subTotal >= 300000 ? 0 : shippingMethod === 'EXPRESS_2H' ? 30000 : 15000;
  const grandTotal = subTotal + shippingFee;

  const handleRxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Ảnh đơn thuốc tải lên tối đa 3MB (JPEG, PNG, WEBP)');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Chỉ hỗ trợ định dạng ảnh JPEG, PNG hoặc WEBP');
      return;
    }

    setPrescriptionFileName(file.name);
    const localUrl = URL.createObjectURL(file);
    setPrescriptionPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return localUrl;
    });

    setUploadingRx(true);
    try {
      const uploaded = await storeApi.uploadPrescriptionImage(file);
      setPrescriptionFileKey(uploaded.fileKey);
      toast.success('Đã tải ảnh đơn thuốc bảo mật thành công!');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể tải lên ảnh đơn thuốc';
      toast.error(msg);
      setPrescriptionFileKey('');
    } finally {
      setUploadingRx(false);
    }
  };

  const handleCopyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã sao chép ${label}: ${text}`);
    } catch {
      toast.info(`${label}: ${text}`);
    }
  };

  const handleCloseDrawer = () => {
    setPlacedOrder(null);
    onClose();
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      toast.error('Giỏ thuốc đang trống');
      return;
    }
    if (hasRxItem && uploadingRx) {
      toast.error('Ảnh toa thuốc đang được tải lên máy chủ, vui lòng chờ hoàn tất');
      return;
    }
    if (hasRxItem && !prescriptionFileKey) {
      toast.error(
        'Giỏ thuốc có sản phẩm kê đơn (Rx). Vui lòng tải lên ảnh toa thuốc bác sĩ trước khi đặt hàng!'
      );
      return;
    }

    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim();
    const cleanAddress = shippingAddress.trim();

    if (cleanName.length < 2) {
      toast.error('Vui lòng nhập họ tên người nhận (tối thiểu 2 ký tự)');
      return;
    }
    if (!/^0\d{9,10}$/.test(cleanPhone)) {
      toast.error('Số điện thoại phải gồm 10-11 chữ số và bắt đầu bằng số 0');
      return;
    }
    if (cleanAddress.length < 10) {
      toast.error('Vui lòng nhập địa chỉ giao hàng chi tiết (tối thiểu 10 ký tự)');
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `web-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const created = await storeApi.createOnlineOrder(
        {
          OrderType: 'RETAIL',
          CustomerName: cleanName,
          CustomerPhone: cleanPhone,
          ShippingAddress: cleanAddress,
          ShippingMethod: shippingMethod,
          PaymentMethod: paymentMethod,
          PatientAllergies: patientAllergies.trim() || undefined,
          PrescriptionFileKey: prescriptionFileKey || undefined,
          Note: note.trim() || undefined,
          items: cart.map((item) => ({
            ProductID: item.product.ProductID,
            Quantity: item.quantity,
            Unit: item.unit,
            DosageNote:
              item.dosageNote || 'Dược sĩ hướng dẫn liều dùng & kiểm tra tương tác trước khi giao',
          })),
        },
        idempotencyKey
      );

      setPlacedOrder(created);
      onClearCart();
      onOrderSuccess(created);
      setCustomerName('');
      setCustomerPhone('');
      setShippingAddress('');
      setPatientAllergies('');
      setPrescriptionFileKey('');
      setPrescriptionFileName('');
      setPrescriptionPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      setNote('');
      toast.success(`Đặt hàng thành công! Mã đơn: ${created.OrderCode}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể đặt đơn hàng. Vui lòng kiểm tra lại tồn kho.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/55 backdrop-blur-xs">
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {placedOrder ? 'Đặt hàng thành công' : `Giỏ thuốc & Thanh toán (${cart.length})`}
              </h2>
              <p className="text-xs text-slate-500">
                Giữ kho nguyên tử 15 phút • Dược sĩ GPP thẩm định lâm sàng
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseDrawer}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng giỏ hàng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {placedOrder ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-emerald-950">
                      Đơn hàng đang chờ Dược sĩ kiểm duyệt chuyên môn
                    </h3>
                    <p className="text-xs text-emerald-800 leading-relaxed">
                      Vui lòng lưu lại cả <strong>Mã đơn hàng</strong> và{' '}
                      <strong>Tracking Token bảo mật</strong> bên dưới để tra cứu hoặc hủy đơn trực tuyến.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Mã đơn hàng
                    </span>
                    <div className="text-lg font-extrabold text-slate-900 tabular-nums font-mono">
                      {placedOrder.OrderCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyText('Mã đơn hàng', placedOrder.OrderCode)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Sao chép
                  </button>
                </div>

                {placedOrder.TrackingToken && (
                  <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Mã bảo mật tra cứu (Tracking Token)
                      </span>
                      <div className="font-mono text-sm font-bold text-teal-700">
                        {placedOrder.TrackingToken}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyText('Tracking Token', placedOrder.TrackingToken || '')
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Sao chép
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-200 pt-2.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                    <Clock className="h-4 w-4" />
                    Hạn giữ kho tạm
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {placedOrder.ReservedUntil
                      ? new Date(placedOrder.ReservedUntil).toLocaleString('vi-VN')
                      : '15 phút'}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 pt-2.5 text-sm">
                  <span className="font-medium text-slate-600">Tổng thanh toán</span>
                  <span className="text-base font-extrabold text-teal-700 tabular-nums">
                    {formatVND(placedOrder.TotalAmount)}
                  </span>
                </div>
              </div>

              {placedOrder.PaymentMethod === 'VIETQR' && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-center space-y-2.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-900">
                    <QrCode className="h-4 w-4 text-sky-600" />
                    Quét mã VietQR để chuyển khoản nhanh
                  </div>
                  <img
                    src={`https://img.vietqr.io/image/VCB-0011001932418-compact2.png?amount=${Math.round(
                      placedOrder.TotalAmount
                    )}&addInfo=${encodeURIComponent(placedOrder.OrderCode)}`}
                    alt="Mã VietQR thanh toán đơn thuốc"
                    className="mx-auto h-48 w-48 rounded-xl border border-sky-200 bg-white object-contain p-2"
                  />
                  <p className="text-[11px] text-slate-600">
                    Ngân hàng Vietcombank • STK: <strong className="text-slate-900">0011001932418</strong>{' '}
                    • Nội dung: <strong className="text-sky-700">{placedOrder.OrderCode}</strong>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const code = placedOrder.OrderCode;
                    const token = placedOrder.TrackingToken || '';
                    setPlacedOrder(null);
                    onTrackOrder(code, token);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-700 shadow-xs"
                >
                  <SearchCheck className="h-4 w-4" />
                  Theo dõi đơn hàng
                </button>
                <button
                  type="button"
                  onClick={handleCloseDrawer}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Tiếp tục mua sắm
                </button>
              </div>
            </div>
          ) : cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center py-12">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <ShoppingBag className="h-8 w-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Giỏ thuốc của bạn đang trống</h3>
              <p className="mt-1 max-w-xs text-xs text-slate-500">
                Hãy chọn thuốc OTC, thực phẩm bảo vệ sức khỏe hoặc gửi toa thuốc để Dược sĩ tư vấn.
              </p>
              <button
                type="button"
                onClick={handleCloseDrawer}
                className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700"
              >
                Khám phá danh mục thuốc
              </button>
            </div>
          ) : (
            <form id="storefront-checkout-form" onSubmit={handleCheckout} className="space-y-5">
              {/* Cart Items */}
              <div className="space-y-2.5">
                {cart.map((item) => {
                  const maxStock = getMaxStockForMode(item.product, item.unitMode);
                  return (
                    <div
                      key={`${item.product.ProductID}-${item.unitMode}`}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <img
                        src={item.product.PathImage}
                        alt={item.product.ProductName}
                        className="h-14 w-14 shrink-0 rounded-lg border border-slate-100 bg-slate-50 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="line-clamp-1 text-sm font-bold text-slate-900">
                              {item.product.ProductName}
                            </h4>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                                Đơn vị: {item.unit}
                              </span>
                              {item.product.IsRx && (
                                <span className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700 border border-rose-200">
                                  Thuốc kê đơn Rx
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.product.ProductID, item.unitMode)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            title="Xóa sản phẩm"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50">
                            <button
                              type="button"
                              onClick={() => onUpdateQty(item.product.ProductID, item.unitMode, -1)}
                              className="px-2 py-1 text-slate-600 hover:bg-slate-200/60 rounded-l-lg"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-[2rem] text-center text-xs font-bold text-slate-900 tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={item.quantity >= maxStock}
                              onClick={() => onUpdateQty(item.product.ProductID, item.unitMode, 1)}
                              className="px-2 py-1 text-slate-600 hover:bg-slate-200/60 disabled:opacity-40 rounded-r-lg"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-teal-700 tabular-nums">
                              {formatVND(item.unitPrice * item.quantity)}
                            </div>
                            <div className="text-[11px] text-slate-400 tabular-nums">
                              {formatVND(item.unitPrice)} / {item.unit}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rx Notice & Multipart Private Prescription Attachment */}
              {hasRxItem && (
                <div
                  className={`rounded-xl border p-3.5 space-y-2.5 ${
                    prescriptionFileKey
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-rose-200 bg-rose-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        prescriptionFileKey ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    />
                    <p
                      className={`text-xs leading-relaxed ${
                        prescriptionFileKey ? 'text-emerald-900' : 'text-rose-900'
                      }`}
                    >
                      Giỏ thuốc có sản phẩm <strong>thuốc kê đơn (Rx)</strong>.{' '}
                      <strong>Bắt buộc tải lên ảnh toa thuốc bác sĩ</strong> (tối đa 3MB) để Dược sĩ thẩm định trước khi đặt hàng.
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-amber-300 bg-white px-3 py-2 text-xs hover:bg-amber-50/50">
                    <span className="inline-flex items-center gap-2 font-medium text-amber-900 truncate">
                      <UploadCloud className="h-4 w-4 text-amber-600 shrink-0" />
                      {uploadingRx
                        ? 'Đang tải ảnh lên máy chủ...'
                        : prescriptionFileName
                        ? `Đã tải bảo mật: ${prescriptionFileName}`
                        : 'Đính kèm ảnh toa thuốc (JPEG/PNG/WEBP <= 3MB)'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void handleRxUpload(e)}
                      className="hidden"
                    />
                  </label>
                  {prescriptionPreviewUrl && (
                    <img
                      src={prescriptionPreviewUrl}
                      alt="Xem trước toa thuốc"
                      className="max-h-28 rounded-lg border border-amber-200 bg-white object-contain p-1"
                    />
                  )}
                </div>
              )}

              {/* Recipient Information */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  1. Thông tin người nhận & Sàng lọc dị ứng
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Họ tên người nhận <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nhập họ tên đầy đủ"
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Số điện thoại <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="VD: 0912345678"
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Địa chỉ giao hàng chi tiết <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Số nhà, tên đường, phường/xã, quận/huyện..."
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Tiền sử dị ứng thuốc (nếu có)
                    </label>
                    <input
                      type="text"
                      value={patientAllergies}
                      onChange={(e) => setPatientAllergies(e.target.value)}
                      placeholder="VD: Penicillin, Aspirin..."
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Ghi chú cho Dược sĩ / Shipper
                    </label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Giao giờ hành chính, gọi trước..."
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Retail Shipping & Payment + B2B Quote CTA */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  2. Vận chuyển & Thanh toán bán lẻ
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      id: 'EXPRESS_2H' as const,
                      label: 'Hỏa tốc 2H',
                      price: subTotal >= 300000 ? 'Miễn phí' : '30.000đ',
                      sub: 'Nội thành siêu tốc',
                    },
                    {
                      id: 'STANDARD' as const,
                      label: 'Tiêu chuẩn',
                      price: subTotal >= 300000 ? 'Miễn phí' : '15.000đ',
                      sub: '1 - 2 ngày (Miễn phí từ 300k)',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShippingMethod(opt.id)}
                      className={`rounded-xl border p-2.5 text-left transition-all ${
                        shippingMethod === opt.id
                          ? 'border-teal-600 bg-teal-50/80 ring-1 ring-teal-600'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5 text-teal-600" />
                          {opt.label}
                        </span>
                        <span className="text-teal-700 tabular-nums">{opt.price}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{opt.sub}</p>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('COD')}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                      paymentMethod === 'COD'
                        ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <Banknote className="h-4 w-4 text-teal-600 shrink-0" />
                    <span>Tiền mặt (COD)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('VIETQR')}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition-all ${
                      paymentMethod === 'VIETQR'
                        ? 'border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <QrCode className="h-4 w-4 text-sky-600 shrink-0" />
                    <span>Chuyển khoản VietQR</span>
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-[11px] text-indigo-900">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <span>Khách đại lý / phòng khám đặt sỉ số lượng lớn?</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenB2BQuoteModal();
                    }}
                    className="font-bold text-indigo-700 hover:underline shrink-0 ml-2"
                  >
                    Báo giá sỉ B2B
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer Totals */}
        {!placedOrder && cart.length > 0 && (
          <div className="border-t border-slate-200 bg-white px-5 py-4 space-y-3">
            <div className="space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Tạm tính ({cart.reduce((s, i) => s + i.quantity, 0)} sản phẩm)</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {formatVND(subTotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Phí vận chuyển</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {shippingFee === 0 ? 'Miễn phí' : formatVND(shippingFee)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-900">
                <span>Tổng thanh toán</span>
                <span className="text-lg text-teal-700 tabular-nums">{formatVND(grandTotal)}</span>
              </div>
            </div>

            <button
              type="submit"
              form="storefront-checkout-form"
              disabled={submitting || uploadingRx}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              {submitting ? 'Đang tạo đơn & giữ tồn kho...' : 'Đặt hàng ngay'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
