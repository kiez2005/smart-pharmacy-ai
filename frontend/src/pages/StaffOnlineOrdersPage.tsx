import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  PackageCheck,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Truck,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Eye,
  FileSpreadsheet,
  QrCode,
  DollarSign,
  UserCheck,
  RefreshCw,
  Building2,
  ArrowRight,
  ClipboardList,
  Lock,
  Image as ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { CLINICAL_OVERRIDE_REASONS, formsApi } from '../services/forms.api';
import { OnlineOrderRecord, InvoiceRecord } from '../types/forms';
import { ModalPortal } from '../components/common/ModalPortal';

export const StaffOnlineOrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<OnlineOrderRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(30);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const orderTableRef = useRef<HTMLDivElement | null>(null);

  // Modal Thẩm định lâm sàng của Dược sĩ
  const [reviewingOrder, setReviewingOrder] = useState<OnlineOrderRecord | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [clinicalOverrideCode, setClinicalOverrideCode] = useState<string>('');
  const [clinicalReviewNote, setClinicalReviewNote] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  // Modal Chi tiết đơn & Giao vận
  const [selectedOrder, setSelectedOrder] = useState<OnlineOrderRecord | null>(null);
  const [courierTrackingCode, setCourierTrackingCode] = useState<string>('');
  const [submittingStage, setSubmittingStage] = useState<boolean>(false);

  // Tải ảnh đơn thuốc bảo mật RBAC từ private endpoint (A5)
  const [rxPreviewUrl, setRxPreviewUrl] = useState<string | null>(null);
  const [rxLoading, setRxLoading] = useState<boolean>(false);

  const canReviewClinical = (() => {
    try {
      const raw = localStorage.getItem('pharmacore_user');
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { Role?: string };
      return parsed.Role === 'ADMIN' || parsed.Role === 'PHARMACIST';
    } catch {
      return false;
    }
  })();

  // Modal Thu tiền COD
  const [collectingCodOrder, setCollectingCodOrder] = useState<OnlineOrderRecord | null>(null);
  const [codReceivedAmount, setCodReceivedAmount] = useState<number>(0);
  const [submittingCod, setSubmittingCod] = useState<boolean>(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await formsApi.listStaffOnlineOrdersPaged({
        ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
        page,
        limit,
      });
      setOrders(res.items);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.totalPages);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể tải danh sách đơn đặt hàng Online';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, limit]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const fileKey = reviewingOrder?.PrescriptionFileKey || selectedOrder?.PrescriptionFileKey;
    if (!fileKey) {
      setRxPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setRxLoading(true);
    formsApi
      .fetchPrescriptionImageBlobUrl(fileKey)
      .then((url) => {
        createdUrl = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
        } else {
          setRxPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        }
      })
      .catch(() => {
        if (!cancelled) setRxPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setRxLoading(false);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [reviewingOrder?.PrescriptionFileKey, selectedOrder?.PrescriptionFileKey]);

  const filteredOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      o.OrderCode.toLowerCase().includes(q) ||
      o.CustomerName.toLowerCase().includes(q) ||
      o.CustomerPhone.includes(q) ||
      (o.CourierTrackingCode && o.CourierTrackingCode.toLowerCase().includes(q))
    );
  });

  const orderVirtualizer = useVirtualizer({
    count: filteredOrders.length,
    getScrollElement: () => orderTableRef.current,
    estimateSize: () => 88,
    overscan: 6,
  });
  const virtualOrderRows = orderVirtualizer.getVirtualItems();
  const orderPaddingTop = virtualOrderRows.length > 0 ? virtualOrderRows[0].start : 0;
  const orderPaddingBottom =
    virtualOrderRows.length > 0
      ? orderVirtualizer.getTotalSize() - virtualOrderRows[virtualOrderRows.length - 1].end
      : 0;

  const handleOpenReview = (order: OnlineOrderRecord, action: 'APPROVE' | 'REJECT') => {
    setReviewingOrder(order);
    setReviewAction(action);
    setClinicalOverrideCode('');
    setClinicalReviewNote('');
    setRejectReason('');
  };

  const handleSubmitReview = async () => {
    if (!reviewingOrder) return;
    if (!canReviewClinical) {
      toast.error('Chỉ Dược sĩ (PHARMACIST) hoặc Quản trị viên (ADMIN) mới có quyền thẩm định đơn Online!');
      return;
    }
    if (reviewAction === 'REJECT' && !rejectReason.trim()) {
      toast.error('Vui lòng nhập lý do từ chối đơn hàng để thông báo đến khách hàng!');
      return;
    }
    const hasWarnings =
      reviewingOrder.ClinicalSafetyStatus === 'WARNING_REQUIRES_REVIEW' ||
      (reviewingOrder.clinicalWarnings && reviewingOrder.clinicalWarnings.length > 0);
    if (reviewAction === 'APPROVE' && hasWarnings) {
      if (!clinicalOverrideCode || clinicalReviewNote.trim().length < 10) {
        toast.error(
          'Đơn thuốc có cảnh báo lâm sàng. Dược sĩ bắt buộc phải chọn mã lý do và ghi chú thẩm định tối thiểu 10 ký tự!'
        );
        return;
      }
    }

    setSubmittingReview(true);
    try {
      const idempotencyKey = `rev-${reviewingOrder.OrderID}-${Date.now()}`;
      const res = await formsApi.reviewOnlineOrder(
        reviewingOrder.OrderID,
        {
          action: reviewAction,
          clinicalOverrideCode: clinicalOverrideCode || undefined,
          clinicalReviewNote: clinicalReviewNote.trim() || undefined,
          rejectReason: rejectReason.trim() || undefined,
        },
        idempotencyKey
      );

      if (reviewAction === 'APPROVE') {
        toast.success(
          `Đã duyệt đơn #${res.order.OrderCode} thành công! Đã lập Hóa đơn xuất kho FEFO và chuyển trạng thái sang "Đã xác nhận".`
        );
      } else {
        toast.warning(
          `Đã từ chối đơn #${res.order.OrderCode}. Đã hoàn lại toàn bộ tồn kho giữ tạm về kho khả dụng!`
        );
      }
      setReviewingOrder(null);
      await loadOrders();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Lỗi khi xử lý thẩm định đơn hàng';
      toast.error(msg);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAdvanceStage = async (
    order: OnlineOrderRecord,
    nextStage: 'PACKING' | 'SHIPPING' | 'DELIVERED'
  ) => {
    setSubmittingStage(true);
    try {
      const updated = await formsApi.updateOnlineOrderStage(order.OrderID, {
        stage: nextStage,
        courierTrackingCode: courierTrackingCode.trim() || order.CourierTrackingCode || undefined,
      });
      toast.success(`Đơn #${updated.OrderCode} đã chuyển sang trạng thái: ${nextStage}`);
      if (selectedOrder && selectedOrder.OrderID === order.OrderID) {
        setSelectedOrder(updated);
      }
      await loadOrders();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể cập nhật tiến trình đơn hàng';
      toast.error(msg);
    } finally {
      setSubmittingStage(false);
    }
  };

  const handleCollectCod = async () => {
    if (!collectingCodOrder || !collectingCodOrder.InvoiceID) {
      toast.error('Đơn hàng chưa có hóa đơn xuất kho liên kết');
      return;
    }
    if (codReceivedAmount <= 0) {
      toast.error('Số tiền thu COD phải lớn hơn 0');
      return;
    }

    setSubmittingCod(true);
    try {
      const idempotencyKey = `cod-${collectingCodOrder.InvoiceID}-${Date.now()}`;
      await formsApi.collectDebt(
        collectingCodOrder.InvoiceID,
        codReceivedAmount,
        'COD',
        idempotencyKey
      );
      toast.success(
        `Đã đối soát & ghi nhận thu tiền COD ${formatVND(codReceivedAmount)} vào Sổ quỹ tiền mặt!`
      );
      setCollectingCodOrder(null);
      await loadOrders();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể ghi nhận thu tiền COD';
      toast.error(msg);
    } finally {
      setSubmittingCod(false);
    }
  };

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-300">
            <Clock className="h-3 w-3 animate-spin text-amber-600" />
            Chờ Dược sĩ duyệt
          </span>
        );
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800 border border-blue-300">
            <CheckCircle2 className="h-3 w-3 text-blue-600" />
            Đã duyệt · Chờ đóng gói
          </span>
        );
      case 'PACKING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-purple-800 border border-purple-300">
            <PackageCheck className="h-3 w-3 text-purple-600" />
            Đang đóng gói
          </span>
        );
      case 'SHIPPING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-800 border border-indigo-300">
            <Truck className="h-3 w-3 text-indigo-600" />
            Đang giao vận
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Đã giao thành công
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-800 border border-rose-300">
            <XCircle className="h-3 w-3 text-rose-600" />
            Bị từ chối
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-300">
            <XCircle className="h-3 w-3 text-slate-500" />
            Khách đã hủy
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-300">
            <Clock className="h-3 w-3 text-slate-500" />
            Hết hạn giữ kho
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
            {status}
          </span>
        );
    }
  };

  const getPaymentStatusBadge = (order: OnlineOrderRecord) => {
    if (order.PaymentStatus === 'PAID') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
          Đã thanh toán ({order.PaymentMethod})
        </span>
      );
    }
    if (order.PaymentMethod === 'COD') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
          Chờ thu COD khi giao hàng
        </span>
      );
    }
    if (order.PaymentMethod === 'CREDIT') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
          Công nợ B2B (Ghi sổ phải thu)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
        Chưa thanh toán
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Quản Trị Đơn Online & Thẩm Định Dược Lâm Sàng
            </h1>
            <span className="rounded-full bg-teal-100 text-teal-800 text-[11px] font-bold px-2.5 py-0.5 border border-teal-300">
              Phân hệ Nội bộ Dược sĩ (RBAC)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quy trình chuẩn: Khách đặt giữ kho tạm thời (15 phút) → Dược sĩ thẩm định an toàn thuốc & duyệt đơn → Đóng gói & Vận chuyển → Đối soát tiền thu COD/Công nợ độc lập.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadOrders()}
          className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-white border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Làm mới dữ liệu</span>
        </button>
      </div>

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo Mã đơn (ORD-...), Tên khách hàng, SĐT, Mã vận đơn..."
            className="w-full h-9 rounded-lg border border-slate-300 pl-9 pr-3 text-xs text-slate-900 focus:border-teal-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'ALL', label: 'Tất cả đơn' },
            { id: 'PENDING_REVIEW', label: 'Chờ duyệt' },
            { id: 'CONFIRMED', label: 'Đã duyệt' },
            { id: 'PACKING', label: 'Đang đóng gói' },
            { id: 'SHIPPING', label: 'Đang giao' },
            { id: 'DELIVERED', label: 'Đã giao' },
            { id: 'REJECTED', label: 'Từ chối' },
            { id: 'CANCELLED', label: 'Đã hủy' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Danh sách đơn hàng */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500">Đang tải danh sách đơn hàng...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Không tìm thấy đơn hàng trực tuyến nào phù hợp bộ lọc.
          </div>
        ) : (
          <div ref={orderTableRef} className="overflow-auto max-h-[560px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 shadow-[0_1px_0_0_rgba(226,232,240,0.9)]">
                <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-3.5">Mã đơn & Thời gian</th>
                  <th className="py-3 px-3.5">Khách hàng</th>
                  <th className="py-3 px-3.5">Mặt hàng đặt</th>
                  <th className="py-3 px-3.5">Tổng tiền & Thanh toán</th>
                  <th className="py-3 px-3.5">An toàn Dược học</th>
                  <th className="py-3 px-3.5">Trạng thái</th>
                  <th className="py-3 px-3.5 text-right">Thao tác xử lý</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderPaddingTop > 0 && (
                  <tr>
                    <td colSpan={7} style={{ height: `${orderPaddingTop}px`, padding: 0 }} />
                  </tr>
                )}
                {virtualOrderRows.map((vRow) => {
                  const order = filteredOrders[vRow.index];
                  const hasWarning =
                    order.ClinicalSafetyStatus === 'WARNING_REQUIRES_REVIEW' ||
                    (order.clinicalWarnings && order.clinicalWarnings.length > 0);

                  return (
                    <tr key={order.OrderID} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3.5 align-top">
                        <div className="font-bold text-teal-700">{order.OrderCode}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          {new Date(order.CreateDate).toLocaleString('vi-VN')}
                        </div>
                        <div className="mt-1">
                          <span
                            className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded ${
                              order.OrderType === 'WHOLESALE'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-teal-100 text-teal-800'
                            }`}
                          >
                            {order.OrderType === 'WHOLESALE' ? 'Đại lý B2B' : 'Khách lẻ GPP'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3.5 align-top">
                        <div className="font-semibold text-slate-900">{order.CustomerName}</div>
                        <div className="text-[11px] text-slate-500">{order.CustomerPhone}</div>
                        <div className="text-[11px] text-slate-500 max-w-xs truncate mt-0.5" title={order.ShippingAddress}>
                          📍 {order.ShippingAddress}
                        </div>
                      </td>

                      <td className="py-3 px-3.5 align-top">
                        <div className="space-y-0.5 max-w-xs">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="text-[11px] text-slate-700 truncate">
                              • <strong>{item.Quantity} {item.Unit}</strong> {item.product?.ProductName || `SP #${item.ProductID}`}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-3.5 align-top">
                        <div className="font-bold text-slate-900 tabular-nums">
                          {formatVND(order.TotalAmount)}
                        </div>
                        <div className="mt-1">{getPaymentStatusBadge(order)}</div>
                      </td>

                      <td className="py-3 px-3.5 align-top">
                        {order.ClinicalSafetyStatus === 'APPROVED_WITH_OVERRIDE' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <ShieldCheck className="h-3 w-3 text-amber-600" />
                            Đã duyệt vượt quyền
                          </span>
                        ) : hasWarning ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <AlertTriangle className="h-3 w-3 text-rose-600" />
                            Có cảnh báo dị ứng/tương tác
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <ShieldCheck className="h-3 w-3 text-emerald-600" />
                            An toàn lâm sàng
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3.5 align-top">{getStatusBadge(order.Status)}</td>

                      <td className="py-3 px-3.5 align-top text-right space-y-1.5">
                        {order.Status === 'PENDING_REVIEW' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenReview(order, 'APPROVE')}
                              className="h-7 px-2.5 rounded-lg bg-teal-600 text-white font-semibold text-[11px] hover:bg-teal-700 transition-colors shadow-2xs"
                            >
                              Duyệt đơn & Xuất kho
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenReview(order, 'REJECT')}
                              className="h-7 px-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-[11px] hover:bg-rose-100 transition-colors"
                            >
                              Từ chối
                            </button>
                          </div>
                        )}

                        {order.Status === 'CONFIRMED' && (
                          <button
                            type="button"
                            onClick={() => void handleAdvanceStage(order, 'PACKING')}
                            className="h-7 px-2.5 rounded-lg bg-purple-600 text-white font-semibold text-[11px] hover:bg-purple-700 transition-colors shadow-2xs"
                          >
                            Bắt đầu Đóng gói
                          </button>
                        )}

                        {order.Status === 'PACKING' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrder(order);
                              setCourierTrackingCode('');
                            }}
                            className="h-7 px-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-[11px] hover:bg-indigo-700 transition-colors shadow-2xs"
                          >
                            Bàn giao Giao hàng
                          </button>
                        )}

                        {order.Status === 'SHIPPING' && (
                          <button
                            type="button"
                            onClick={() => void handleAdvanceStage(order, 'DELIVERED')}
                            className="h-7 px-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-[11px] hover:bg-emerald-700 transition-colors shadow-2xs"
                          >
                            Xác nhận Đã giao
                          </button>
                        )}

                        {order.Status === 'DELIVERED' &&
                          order.PaymentMethod === 'COD' &&
                          order.PaymentStatus !== 'PAID' && (
                            <button
                              type="button"
                              onClick={() => {
                                setCollectingCodOrder(order);
                                setCodReceivedAmount(order.TotalAmount);
                              }}
                              className="h-7 px-2.5 rounded-lg bg-amber-600 text-white font-semibold text-[11px] hover:bg-amber-700 transition-colors shadow-2xs"
                            >
                              Thu tiền COD
                            </button>
                          )}

                        <div>
                          <button
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className="text-[11px] text-slate-500 hover:text-teal-700 underline"
                          >
                            Xem chi tiết
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {orderPaddingBottom > 0 && (
                  <tr>
                    <td colSpan={7} style={{ height: `${orderPaddingBottom}px`, padding: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-xs text-slate-600 bg-slate-50/60">
          <span>
            Trang <strong>{page}</strong> / {totalPages} ({total} đơn hàng)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-7 px-2.5 rounded border border-slate-300 bg-white font-semibold disabled:opacity-40 hover:bg-slate-100"
            >
              Trước
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-7 px-2.5 rounded border border-slate-300 bg-white font-semibold disabled:opacity-40 hover:bg-slate-100"
            >
              Sau
            </button>
          </div>
        </div>
      </div>

      {/* Modal Dược sĩ Thẩm định & Duyệt đơn */}
      {reviewingOrder && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-teal-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    {reviewAction === 'APPROVE'
                      ? 'Dược Sĩ Thẩm Định & Duyệt Đơn Thuốc'
                      : 'Từ Chối Đơn Đặt Hàng Trực Tuyến'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewingOrder(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">Đơn hàng: #{reviewingOrder.OrderCode}</div>
                  <div className="text-slate-600">
                    Khách hàng: {reviewingOrder.CustomerName} ({reviewingOrder.CustomerPhone})
                  </div>
                  <div className="text-slate-600">Địa chỉ: {reviewingOrder.ShippingAddress}</div>
                  {reviewingOrder.PatientAllergies && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      Tiền sử dị ứng khách khai báo: {reviewingOrder.PatientAllergies}
                    </div>
                  )}
                  <div className="text-teal-700 font-bold pt-0.5">
                    Tổng giá trị: {formatVND(reviewingOrder.TotalAmount)} ({reviewingOrder.PaymentMethod})
                  </div>
                </div>

                {/* Ảnh đơn thuốc bảo mật RBAC */}
                {(reviewingOrder.PrescriptionFileKey || rxLoading) && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                      <ImageIcon className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Hình ảnh đơn thuốc bác sĩ (Truy cập bảo mật RBAC):</span>
                    </div>
                    {rxLoading ? (
                      <div className="h-24 rounded-lg bg-slate-100 animate-pulse flex items-center justify-center text-slate-500">
                        Đang tải ảnh đơn thuốc...
                      </div>
                    ) : rxPreviewUrl ? (
                      <a href={rxPreviewUrl} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={rxPreviewUrl}
                          alt="Đơn thuốc bác sĩ"
                          className="max-h-44 w-full object-contain rounded-lg border border-indigo-200 bg-white"
                        />
                      </a>
                    ) : (
                      <div className="text-[11px] text-rose-600">
                        Không thể tải ảnh đơn thuốc hoặc thiếu quyền truy cập.
                      </div>
                    )}
                  </div>
                )}

                {/* Danh mục thuốc */}
                <div className="space-y-1">
                  <div className="font-bold text-slate-700">Mặt hàng trong đơn:</div>
                  <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 border rounded-lg p-2 bg-white">
                    {reviewingOrder.items.map((it, idx) => (
                      <div key={idx} className="py-1 flex justify-between">
                        <span>
                          {it.Quantity} {it.Unit} · {it.product?.ProductName}
                        </span>
                        <span className="font-bold tabular-nums">
                          {formatVND(it.Quantity * it.UnitPrice)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cảnh báo an toàn nếu có */}
                {reviewingOrder.clinicalWarnings && reviewingOrder.clinicalWarnings.length > 0 && (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-rose-800">
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                      <span>Cảnh báo An toàn Dược Lâm Sàng ({reviewingOrder.clinicalWarnings.length}):</span>
                    </div>
                    {reviewingOrder.clinicalWarnings.map((w, idx) => (
                      <div key={idx} className="text-rose-700 pl-4">
                        • <strong>[{w.severity}] {w.title}:</strong> {w.detail}
                        {w.ruleId && (
                          <span className="ml-1 text-[10px] font-mono text-rose-500">
                            ({w.ruleId}{w.source ? ` · ${w.source}` : ''})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Form ghi nhận */}
                {!canReviewClinical ? (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 flex items-start gap-2 text-rose-900 font-semibold">
                    <Lock className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
                    <span>Chỉ Dược sĩ (PHARMACIST) hoặc Admin mới có quyền thẩm định và duyệt xuất đơn Online.</span>
                  </div>
                ) : reviewAction === 'APPROVE' ? (
                  <div className="space-y-2">
                    {(reviewingOrder.ClinicalSafetyStatus === 'WARNING_REQUIRES_REVIEW' ||
                      (reviewingOrder.clinicalWarnings && reviewingOrder.clinicalWarnings.length > 0)) && (
                      <div className="space-y-1">
                        <label className="block font-semibold text-slate-700">
                          Mã lý do vượt cảnh báo lâm sàng (Bắt buộc):
                        </label>
                        <select
                          value={clinicalOverrideCode}
                          onChange={(e) => setClinicalOverrideCode(e.target.value)}
                          className="w-full h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs focus:border-teal-600 focus:outline-none"
                        >
                          <option value="">-- Chọn mã lý do thẩm định --</option>
                          {CLINICAL_OVERRIDE_REASONS.map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.code} - {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1">
                      <label className="block font-semibold text-slate-700">
                        Ghi chú thẩm định của Dược sĩ (Tối thiểu 10 ký tự nếu có cảnh báo):
                      </label>
                      <textarea
                        rows={2}
                        value={clinicalReviewNote}
                        onChange={(e) => setClinicalReviewNote(e.target.value)}
                        placeholder="VD: Đã liên hệ bệnh nhân xác nhận liều lượng, hướng dẫn uống cách 2 giờ..."
                        className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-teal-600 focus:outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block font-semibold text-rose-800">
                      Lý do từ chối đơn hàng (Bắt buộc):
                    </label>
                    <textarea
                      rows={2}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="VD: Thuốc thuộc danh mục kê đơn bắt buộc khám trực tiếp, hoặc tương tác nguy hiểm..."
                      className="w-full rounded-lg border border-rose-300 p-2 text-xs focus:border-rose-600 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setReviewingOrder(null)}
                  className="h-8 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={submittingReview}
                  onClick={() => void handleSubmitReview()}
                  className={`h-8 px-4 rounded-lg text-xs font-semibold text-white shadow-2xs ${
                    reviewAction === 'APPROVE'
                      ? 'bg-teal-600 hover:bg-teal-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {submittingReview
                    ? 'Đang xử lý...'
                    : reviewAction === 'APPROVE'
                    ? 'Xác nhận Duyệt & Trừ kho FEFO'
                    : 'Xác nhận Từ chối & Hoàn trả giữ kho'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Chi tiết đơn & Chuyển trạng thái giao vận */}
      {selectedOrder && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-teal-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    Chi Tiết Đơn Hàng #{selectedOrder.OrderCode}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    Trạng thái: {getStatusBadge(selectedOrder.Status)}
                  </div>
                  <div>
                    {getPaymentStatusBadge(selectedOrder)}
                  </div>
                </div>

                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                  <div><strong>Người nhận:</strong> {selectedOrder.CustomerName} ({selectedOrder.CustomerPhone})</div>
                  <div><strong>Địa chỉ:</strong> {selectedOrder.ShippingAddress}</div>
                  {selectedOrder.PatientAllergies && (
                    <div className="text-rose-700 font-bold">
                      <strong>Dị ứng khách khai báo:</strong> {selectedOrder.PatientAllergies}
                    </div>
                  )}
                  <div><strong>Phương thức vận chuyển:</strong> {selectedOrder.ShippingMethod} (Phí ship: {formatVND(selectedOrder.ShippingFee)})</div>
                  {selectedOrder.CourierTrackingCode && (
                    <div className="text-teal-700 font-mono"><strong>Mã vận đơn bưu cục:</strong> {selectedOrder.CourierTrackingCode}</div>
                  )}
                  {selectedOrder.Note && <div><strong>Ghi chú:</strong> {selectedOrder.Note}</div>}
                  {selectedOrder.ClinicalReviewNote && (
                    <div className="text-teal-800 font-semibold"><strong>Dược sĩ thẩm định:</strong> {selectedOrder.ClinicalReviewNote} ({selectedOrder.ReviewedByName})</div>
                  )}
                  {selectedOrder.RejectCancelReason && (
                    <div className="text-rose-700 font-semibold"><strong>Lý do từ chối/hủy:</strong> {selectedOrder.RejectCancelReason}</div>
                  )}
                </div>

                {selectedOrder.PrescriptionFileKey && (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-900 text-[11px]">
                      <ImageIcon className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Hình ảnh đơn thuốc đã tải lên (RBAC):</span>
                    </div>
                    {rxLoading ? (
                      <div className="h-20 rounded-lg bg-slate-100 animate-pulse flex items-center justify-center text-slate-500">
                        Đang tải ảnh đơn thuốc...
                      </div>
                    ) : rxPreviewUrl ? (
                      <a href={rxPreviewUrl} target="_blank" rel="noreferrer" className="block">
                        <img
                          src={rxPreviewUrl}
                          alt="Đơn thuốc khách tải lên"
                          className="max-h-40 w-full object-contain rounded-lg border border-indigo-200 bg-white"
                        />
                      </a>
                    ) : null}
                  </div>
                )}

                {/* Nếu đang ở trạng thái PACKING, cho phép nhập mã vận đơn để xuất giao */}
                {selectedOrder.Status === 'PACKING' && (
                  <div className="space-y-1.5 p-3 rounded-xl border border-indigo-200 bg-indigo-50/50">
                    <label className="block font-semibold text-indigo-900">
                      Mã vận đơn đơn vị vận chuyển (Ahamove / GHN / ViettelPost):
                    </label>
                    <input
                      type="text"
                      value={courierTrackingCode}
                      onChange={(e) => setCourierTrackingCode(e.target.value)}
                      placeholder="VD: AHA-883921 hoặc VNPost-99381"
                      className="w-full h-8 rounded-lg border border-indigo-300 bg-white px-2.5 text-xs text-indigo-950 focus:border-indigo-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={submittingStage}
                      onClick={() => void handleAdvanceStage(selectedOrder, 'SHIPPING')}
                      className="mt-2 h-8 w-full rounded-lg bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-700 shadow-2xs"
                    >
                      Bàn giao cho Shipper (Chuyển sang Đang giao)
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end border-t pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="h-8 px-4 rounded-lg bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Modal Thu tiền COD độc lập */}
      {collectingCodOrder && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                  <h3 className="text-base font-bold text-slate-900">Đối Soát & Thu Tiền COD</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCollectingCodOrder(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900">
                  <p>
                    Đơn hàng <strong>#{collectingCodOrder.OrderCode}</strong> đã giao thành công.
                  </p>
                  <p className="mt-1">
                    Nhập số tiền thực tế bưu tá / đơn vị giao vận nộp về quỹ để ghi nhận bút toán thanh toán COD.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700">Số tiền thu COD (VNĐ):</label>
                  <input
                    type="number"
                    value={codReceivedAmount}
                    onChange={(e) => setCodReceivedAmount(Number(e.target.value))}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-900 tabular-nums focus:border-amber-600 focus:outline-none"
                  />
                  <div className="text-[11px] text-slate-500">
                    Phải thu theo đơn: {formatVND(collectingCodOrder.TotalAmount)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setCollectingCodOrder(null)}
                  className="h-8 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={submittingCod}
                  onClick={() => void handleCollectCod()}
                  className="h-8 px-4 rounded-lg bg-amber-600 text-white font-semibold text-xs hover:bg-amber-700 shadow-2xs"
                >
                  {submittingCod ? 'Đang ghi sổ...' : 'Xác nhận Đã thu tiền COD'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
};
