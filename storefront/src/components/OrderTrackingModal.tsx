import React, { useEffect, useState } from 'react';
import {
  X,
  SearchCheck,
  Clock,
  CheckCircle2,
  PackageCheck,
  Truck,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { storeApi } from '../services/api';
import { OnlineOrderRecord } from '../types';
import { formatVND } from '../utils/packaging';

interface OrderTrackingModalProps {
  initialOrderCode?: string;
  initialPhoneOrToken?: string;
  onClose: () => void;
  onOrderCancelled?: () => void;
}

export const OrderTrackingModal: React.FC<OrderTrackingModalProps> = ({
  initialOrderCode = '',
  initialPhoneOrToken = '',
  onClose,
  onOrderCancelled,
}) => {
  const [orderCode, setOrderCode] = useState(initialOrderCode);
  const [phoneOrToken, setPhoneOrToken] = useState(initialPhoneOrToken);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [order, setOrder] = useState<OnlineOrderRecord | null>(null);

  const fetchOrder = async (code: string, credential: string) => {
    if (!code.trim() || !credential.trim()) {
      toast.error('Vui lòng nhập Mã đơn hàng và SĐT hoặc Mã tra cứu');
      return;
    }
    setLoading(true);
    try {
      const res = await storeApi.trackOrder(code.trim(), credential.trim());
      setOrder(res);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không tìm thấy đơn hàng hoặc SĐT/Mã tra cứu không khớp';
      toast.error(msg);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrderCode && initialPhoneOrToken) {
      void fetchOrder(initialOrderCode, initialPhoneOrToken);
    }
  }, [initialOrderCode, initialPhoneOrToken]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchOrder(orderCode, phoneOrToken);
  };

  const handleCancelOrder = async () => {
    if (!order || order.Status !== 'PENDING_REVIEW') return;
    setCancelling(true);
    try {
      const updated = await storeApi.cancelOrder(
        order.OrderID,
        phoneOrToken.trim(),
        'Khách hàng tự hủy trên Cổng Storefront'
      );
      setOrder(updated);
      toast.success(`Đã hủy đơn #${updated.OrderCode} và hoàn trả giữ kho tạm thành công!`);
      onOrderCancelled?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể hủy đơn hàng';
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  };

  const getStepIndex = (status: string) => {
    if (status === 'PENDING_REVIEW') return 1;
    if (status === 'CONFIRMED' || status === 'PACKING') return 2;
    if (status === 'SHIPPING') return 3;
    if (status === 'DELIVERED') return 4;
    return 0;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 bg-teal-50 border-b border-teal-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-teal-600 text-white flex items-center justify-center">
              <SearchCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Tra Cứu Hành Trình Đơn Hàng Trực Tuyến
              </h3>
              <p className="text-[11px] text-teal-700 font-medium">
                Bảo mật riêng tư: Chỉ hiển thị khi khớp Mã đơn hàng & SĐT / Tracking Token
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-teal-100 hover:text-teal-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
            <input
              type="text"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="Mã đơn (VD: ORD-2026-...)"
              className="sm:col-span-2 h-9 rounded-xl border border-slate-300 px-3 font-mono font-bold text-slate-900 focus:border-teal-600 focus:outline-none"
            />
            <input
              type="text"
              value={phoneOrToken}
              onChange={(e) => setPhoneOrToken(e.target.value)}
              placeholder="SĐT hoặc Token (TRK-...)"
              className="sm:col-span-2 h-9 rounded-xl border border-slate-300 px-3 text-slate-900 focus:border-teal-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-9 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700 transition-colors"
            >
              {loading ? 'Đang tìm...' : 'Tra cứu'}
            </button>
          </form>

          {order && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-base font-extrabold text-teal-800">{order.OrderCode}</div>
                  <div className="text-[11px] text-slate-500">
                    Đặt lúc: {new Date(order.CreateDate).toLocaleString('vi-VN')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-slate-900 tabular-nums">
                    {formatVND(order.TotalAmount)}
                  </div>
                  <div className="text-[11px] font-semibold text-teal-700">
                    {order.PaymentMethod} · {order.PaymentStatus}
                  </div>
                </div>
              </div>

              {/* Pipeline hoặc trạng thái Hủy/Từ chối */}
              {['REJECTED', 'CANCELLED', 'EXPIRED'].includes(order.Status) ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2.5 text-rose-800">
                  <XCircle className="h-5 w-5 text-rose-600 shrink-0" />
                  <div>
                    <div className="font-bold">
                      {order.Status === 'REJECTED'
                        ? 'Đơn hàng bị Dược sĩ từ chối'
                        : order.Status === 'EXPIRED'
                        ? 'Đơn hàng đã hết thời hạn giữ kho (15 phút)'
                        : 'Đơn hàng đã được hủy'}
                    </div>
                    {order.RejectCancelReason && (
                      <div className="mt-0.5 text-[11px]">Lý do: {order.RejectCancelReason}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { step: 1, label: 'Chờ Dược sĩ duyệt', icon: Clock },
                    { step: 2, label: 'Đã duyệt & Đóng gói', icon: PackageCheck },
                    { step: 3, label: 'Đang giao hàng', icon: Truck },
                    { step: 4, label: 'Giao thành công', icon: CheckCircle2 },
                  ].map((item) => {
                    const currentStep = getStepIndex(order.Status);
                    const isDone = currentStep >= item.step;
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.step}
                        className={`rounded-xl border p-2.5 text-center space-y-1 ${
                          isDone
                            ? 'border-teal-500 bg-white text-teal-800 shadow-xs'
                            : 'border-slate-200 bg-slate-100/50 text-slate-400'
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 mx-auto ${
                            isDone ? 'text-teal-600' : 'text-slate-400'
                          }`}
                        />
                        <div className="text-[10px] font-bold leading-tight">{item.label}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {order.Status === 'PENDING_REVIEW' && order.ReservedUntil && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 flex items-center justify-between text-amber-900">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Kho đang tạm giữ thuốc cho đơn của bạn đến{' '}
                    <strong>{new Date(order.ReservedUntil).toLocaleTimeString('vi-VN')}</strong>
                  </span>
                </div>
              )}

              <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-1">
                <div>
                  <strong>Người nhận:</strong> {order.CustomerName} ({order.CustomerPhone})
                </div>
                <div>
                  <strong>Địa chỉ:</strong> {order.ShippingAddress}
                </div>
                {order.CourierTrackingCode && (
                  <div className="text-indigo-700 font-semibold font-mono">
                    <strong>Mã vận đơn Shipper:</strong> {order.CourierTrackingCode}
                  </div>
                )}
                {order.ClinicalReviewNote && (
                  <div className="text-teal-700 font-semibold">
                    <strong>Lời dặn Dược sĩ:</strong> {order.ClinicalReviewNote}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-1.5">
                <div className="font-bold text-slate-700">Chi tiết thuốc đã đặt:</div>
                <div className="divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <div key={item.OrderItemID} className="py-1.5 flex justify-between">
                      <span>
                        <strong>
                          {item.Quantity} {item.Unit}
                        </strong>{' '}
                        × {item.product?.ProductName || `SP #${item.ProductID}`}
                      </span>
                      <span className="font-bold tabular-nums">
                        {formatVND(item.Quantity * item.UnitPrice)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {order.Status === 'PENDING_REVIEW' && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => void handleCancelOrder()}
                    className="h-9 px-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold hover:bg-rose-100 transition-colors"
                  >
                    {cancelling ? 'Đang xử lý...' : 'Hủy đơn hàng (Giải phóng giữ kho)'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
