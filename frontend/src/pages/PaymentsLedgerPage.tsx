import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  QrCode,
  Banknote,
  RotateCcw,
  CheckCircle2,
  Eye,
  Trash2,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
} from 'lucide-react';
import { toast } from 'sonner';
import { enterpriseApi } from '../services/enterprise.api';
import { PaymentRecord } from '../types/enterprise';
import {
  ColumnConfig,
  EnterprisePagination,
  EnterpriseToolbar,
} from '../components/common/EnterpriseDataToolbar';
import { ModalPortal } from '../components/common/ModalPortal';

const PAYMENT_COLUMNS: ColumnConfig[] = [
  { id: 'TransactionCode', label: 'Mã bút toán' },
  { id: 'VoucherType', label: 'Loại phiếu thu/chi' },
  { id: 'InvoiceCode', label: 'Chứng từ gốc' },
  { id: 'CustomerName', label: 'Đối tượng nộp/nhận' },
  { id: 'PaymentMethod', label: 'Phương thức' },
  { id: 'PaymentDate', label: 'Thời gian ghi nhận' },
  { id: 'PaidAmount', label: 'Số tiền' },
  { id: 'Status', label: 'Trạng thái đối soát' },
];

export const PaymentsLedgerPage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [previewQrPayment, setPreviewQrPayment] = useState<PaymentRecord | null>(null);
  const [activeKpiModal, setActiveKpiModal] = useState<'NET' | 'VIETQR' | 'CASH' | 'REFUND' | null>(null);

  // 11 Chức năng Data Grid
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});

  const loadPayments = async () => {
    setLoading(true);
    try {
      const list = await enterpriseApi.getPayments();
      setPayments(list);
      setSelectedIds([]);
    } catch {
      toast.error('Không thể tải dữ liệu sổ quỹ thanh toán');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, []);

  const stats = useMemo(() => {
    const paidList = payments.filter((p) => p.Status === 'PAID');
    const refundedList = payments.filter((p) => p.Status === 'REFUNDED');

    const totalNet = paidList.reduce((s, p) => s + p.PaidAmount, 0);
    const totalVietQr = paidList
      .filter((p) => p.PaymentMethod === 'VIETQR')
      .reduce((s, p) => s + p.PaidAmount, 0);
    const totalCashAndCard = paidList
      .filter((p) => p.PaymentMethod !== 'VIETQR')
      .reduce((s, p) => s + p.PaidAmount, 0);
    const totalRefunded = refundedList.reduce((s, p) => s + p.PaidAmount, 0);

    return { totalNet, totalVietQr, totalCashAndCard, totalRefunded };
  }, [payments]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const matchMethod = methodFilter === 'ALL' || p.PaymentMethod === methodFilter;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        (p.TransactionCode || '').toLowerCase().includes(q) ||
        (p.invoice?.InvoiceCode || '').toLowerCase().includes(q) ||
        (p.invoice?.CustomerName || '').toLowerCase().includes(q);
      return matchMethod && matchSearch;
    });
  }, [payments, methodFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedPayments = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  const handleDeleteOne = async (p: PaymentRecord) => {
    if (!window.confirm(`Xác nhận xóa bút toán thanh toán ${p.TransactionCode}?`)) return;
    try {
      await enterpriseApi.deleteRecord('payments', p.PaymentID);
      toast.success(`Đã xóa bút toán ${p.TransactionCode}`);
      await loadPayments();
    } catch {
      toast.error('Không thể xóa bút toán');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 bút toán trong bảng');
      return;
    }
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} bút toán đã chọn?`)) return;
    try {
      const count = await enterpriseApi.bulkDelete('payments', selectedIds);
      toast.success(`Đã xóa ${count} bút toán thanh toán`);
      await loadPayments();
    } catch {
      toast.error('Không thể xóa hàng loạt bút toán');
    }
  };

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-5">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="payments"
        title="Sổ Quỹ Thu Chi & Đối Soát Giao Dịch (Cashflow & VietQR Ledger)"
        subtitle="Quản lý dòng tiền Phiếu Thu POS, Phiếu Chi hoàn trả, đối soát tự động giao dịch VietQR Napas247 và xuất sổ quỹ kế toán."
        createLabel="Đối soát VietQR (Alt+N)"
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo mã bút toán (VQR-...), mã hóa đơn hoặc tên khách... (Alt + F)"
        columns={PAYMENT_COLUMNS}
        visibleColumns={visibleColumns}
        onToggleColumn={(colId) =>
          setVisibleColumns((prev) => ({
            ...prev,
            [colId]: prev[colId] === false ? true : false,
          }))
        }
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onOpenCreate={() => {
          if (payments.length > 0) setPreviewQrPayment(payments[0]);
        }}
        onBulkDelete={() => void handleBulkDelete()}
        onBulkClone={() => toast.info('Bút toán ngân hàng VietQR là duy nhất, không nhân bản')}
        onViewSelected={() => {
          if (selectedIds.length === 1) {
            const found = payments.find((p) => p.PaymentID === selectedIds[0]);
            if (found) setPreviewQrPayment(found);
          }
        }}
        onReload={loadPayments}
        extraFilters={
          <div className="flex items-center gap-1.5">
            {[
              { id: 'ALL', label: 'Tất cả kênh' },
              { id: 'VIETQR', label: 'VietQR 24/7' },
              { id: 'CASH', label: 'Tiền mặt' },
              { id: 'CARD', label: 'Thẻ POS' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethodFilter(m.id);
                  setPage(1);
                }}
                className={`h-9 rounded-lg px-3.5 text-xs font-semibold transition-all shadow-sm ${
                  methodFilter === m.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      />

      {/* 4 Financial KPIs (Clickable Drill-down) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => setActiveKpiModal('NET')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-teal-500 hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tổng thực thu ròng (Net Cash)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 group-hover:scale-110 transition-transform">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">
            {formatVND(stats.totalNet)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Đã cấn trừ phiếu hoàn</span>
            <span className="font-semibold text-teal-600 text-[11px] group-hover:underline">Chi tiết →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveKpiModal('VIETQR')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-emerald-500 hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Chuyển khoản VietQR 24/7</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
              <QrCode className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {formatVND(stats.totalVietQr)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Đối soát Napas247</span>
            <span className="font-semibold text-emerald-600 text-[11px] group-hover:underline">Báo cáo QR →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveKpiModal('CASH')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-sky-500 hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Quỹ Tiền mặt & Thẻ POS</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 group-hover:scale-110 transition-transform">
              <Banknote className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {formatVND(stats.totalCashAndCard)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Két tiền mặt quầy</span>
            <span className="font-semibold text-sky-600 text-[11px] group-hover:underline">Kiểm két →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveKpiModal('REFUND')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-rose-400 hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Phiếu Chi Hoàn Tiền (Refund)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 group-hover:scale-110 transition-transform">
              <RotateCcw className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 tabular-nums">
            {formatVND(stats.totalRefunded)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Hóa đơn trả hàng</span>
            <span className="font-semibold text-rose-600 text-[11px] group-hover:underline">Xem phiếu chi →</span>
          </div>
        </button>
      </div>

      {/* Bảng Sổ Quỹ Full-Width 100% */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-9">
                  <input
                    type="checkbox"
                    checked={
                      pagedPayments.length > 0 &&
                      pagedPayments.every((p) => selectedIds.includes(p.PaymentID))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(pagedPayments.map((p) => p.PaymentID));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                  />
                </th>
                {visibleColumns.TransactionCode !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Mã bút toán</th>
                )}
                {visibleColumns.VoucherType !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Loại phiếu thu/chi</th>
                )}
                {visibleColumns.InvoiceCode !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Chứng từ gốc</th>
                )}
                {visibleColumns.CustomerName !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Đối tượng nộp/nhận</th>
                )}
                {visibleColumns.PaymentMethod !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Phương thức</th>
                )}
                {visibleColumns.PaymentDate !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Thời gian ghi nhận</th>
                )}
                {visibleColumns.PaidAmount !== false && (
                  <th className="py-3 px-4 text-right whitespace-nowrap">Số tiền</th>
                )}
                {visibleColumns.Status !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Trạng thái</th>
                )}
                <th className="py-3 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">
                    Đang tải sổ quỹ giao dịch...
                  </td>
                </tr>
              ) : pagedPayments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">
                    Chưa có bút toán thanh toán phù hợp.
                  </td>
                </tr>
              ) : (
                pagedPayments.map((p) => {
                  const isRefund = p.Status === 'REFUNDED';
                  return (
                    <tr
                      key={p.PaymentID}
                      onClick={() => setPreviewQrPayment(p)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td
                        className="py-3 px-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(p.PaymentID)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(p.PaymentID)
                                ? prev.filter((id) => id !== p.PaymentID)
                                : [...prev, p.PaymentID]
                            )
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                        />
                      </td>
                      {visibleColumns.TransactionCode !== false && (
                        <td className="py-3 px-4 font-mono text-xs font-bold text-slate-900 whitespace-nowrap">
                          {p.TransactionCode || `PAY-${p.PaymentID}`}
                        </td>
                      )}
                      {visibleColumns.VoucherType !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isRefund ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                              <ArrowUpRight className="h-3 w-3" />
                              Phiếu Chi Hoàn Trả
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                              <ArrowDownLeft className="h-3 w-3" />
                              Phiếu Thu Bán Lẻ
                            </span>
                          )}
                        </td>
                      )}
                      {visibleColumns.InvoiceCode !== false && (
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-teal-700 whitespace-nowrap">
                          {p.invoice?.InvoiceCode || `#${p.InvoiceID}`}
                        </td>
                      )}
                      {visibleColumns.CustomerName !== false && (
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {p.invoice?.CustomerName || 'Khách vãng lai'}
                        </td>
                      )}
                      {visibleColumns.PaymentMethod !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800 border border-slate-200/60">
                            {p.PaymentMethod}
                          </span>
                        </td>
                      )}
                      {visibleColumns.PaymentDate !== false && (
                        <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                          {new Date(p.PaymentDate).toLocaleString('vi-VN')}
                        </td>
                      )}
                      {visibleColumns.PaidAmount !== false && (
                        <td
                          className={`py-3 px-4 text-right font-bold tabular-nums whitespace-nowrap ${
                            isRefund ? 'text-rose-600' : 'text-teal-700'
                          }`}
                        >
                          {isRefund ? '-' : '+'}
                          {formatVND(p.PaidAmount)}
                        </td>
                      )}
                      {visibleColumns.Status !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isRefund ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200/60">
                              Đã xuất quỹ hoàn
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/60">
                              <CheckCircle2 className="h-3 w-3" />
                              Đã khớp lệnh
                            </span>
                          )}
                        </td>
                      )}
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewQrPayment(p)}
                            title="Xem chứng từ VietQR (Alt+V)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteOne(p)}
                            title="Xóa bút toán (Alt+H)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

        <EnterprisePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* SLIDE-OVER RIGHT DRAWER: Xem Chứng từ Thu/Chi & Mã VietQR Đối soát */}
      {previewQrPayment && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex justify-end bg-slate-950/60 backdrop-blur-xs">
            <div className="w-full max-w-full sm:max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/70 sticky top-0 z-10 shrink-0">
                <div>
                  <span className="font-mono text-xs font-bold text-teal-700">
                    {previewQrPayment.TransactionCode}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Chứng từ Bút toán Sổ Quỹ & Đối soát
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewQrPayment(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Loại chứng từ:</span>
                    <span className="font-bold text-slate-900">
                      {previewQrPayment.Status === 'REFUNDED'
                        ? 'Phiếu Chi Hoàn Tiền Khách'
                        : 'Phiếu Thu Bán Lẻ POS'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hóa đơn gốc:</span>
                    <span className="font-mono font-bold text-teal-700">
                      {previewQrPayment.invoice?.InvoiceCode || `#${previewQrPayment.InvoiceID}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Người nộp / nhận:</span>
                    <span className="font-semibold text-slate-900">
                      {previewQrPayment.invoice?.CustomerName || 'Khách vãng lai'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phương thức:</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {previewQrPayment.PaymentMethod}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thời gian khớp lệnh:</span>
                    <span className="tabular-nums text-slate-800">
                      {new Date(previewQrPayment.PaymentDate).toLocaleString('vi-VN')}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 text-center space-y-3 bg-slate-50/50">
                  <div className="text-xs font-bold text-slate-700">
                    Mã QR Chứng từ Đối soát Napas247
                  </div>
                  <img
                    src={`https://img.vietqr.io/image/MB-0388889999-compact2.png?amount=${previewQrPayment.PaidAmount}&addInfo=${encodeURIComponent(
                      previewQrPayment.invoice?.InvoiceCode || 'PHARMACORE'
                    )}`}
                    alt="VietQR"
                    className="mx-auto h-44 w-44 sm:h-52 sm:w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs"
                  />
                  <div className="text-xs text-slate-600">
                    Giá trị bút toán:{' '}
                    <strong className="text-base font-bold text-teal-700 tabular-nums">
                      {formatVND(previewQrPayment.PaidAmount)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 flex items-center justify-between sticky bottom-0 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>In Phiếu Thu/Chi</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewQrPayment(null)}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* MODAL CHI TIẾT SỔ QUỸ KHI CLICK CÁC Ô THÔNG TIN (KPI DRILL-DOWN) */}
      {activeKpiModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
                  {activeKpiModal === 'NET' && <Wallet className="h-4 w-4" />}
                  {activeKpiModal === 'VIETQR' && <QrCode className="h-4 w-4" />}
                  {activeKpiModal === 'CASH' && <Banknote className="h-4 w-4" />}
                  {activeKpiModal === 'REFUND' && <RotateCcw className="h-4 w-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {activeKpiModal === 'NET' && 'Báo Cáo Sổ Quỹ Dòng Tiền Thuần (Net Cash)'}
                    {activeKpiModal === 'VIETQR' && 'Nhật Ký Đối Soát Tự Động VietQR 24/7 Napas'}
                    {activeKpiModal === 'CASH' && 'Biên Bản Kiểm Kê Tiền Mặt & Thẻ POS Quầy'}
                    {activeKpiModal === 'REFUND' && 'Danh Sách Phiếu Chi Hoàn Trả Tiền Cho Khách'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeKpiModal === 'NET' && 'Tổng hợp phiếu thu bán lẻ và các khoản chi hoàn'}
                    {activeKpiModal === 'VIETQR' && 'Khớp lệnh biến động số dư qua mã QR động'}
                    {activeKpiModal === 'CASH' && 'Đối chiếu số dư thực tế trong két tiền mặt'}
                    {activeKpiModal === 'REFUND' && 'Chi tiết các khoản hoàn trả khi hủy đơn thuốc'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveKpiModal(null)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {activeKpiModal === 'NET' && (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                      <div className="font-semibold text-teal-800">Thực thu ròng</div>
                      <div className="mt-1 text-lg font-bold text-teal-900 tabular-nums">{formatVND(stats.totalNet)}</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="font-semibold text-emerald-800">Tổng thu vào</div>
                      <div className="mt-1 text-lg font-bold text-emerald-900 tabular-nums">
                        {formatVND(stats.totalNet + stats.totalRefunded)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                      <div className="font-semibold text-rose-800">Tổng chi ra</div>
                      <div className="mt-1 text-lg font-bold text-rose-900 tabular-nums">
                        -{formatVND(stats.totalRefunded)}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs font-bold text-slate-800">Cơ cấu nguồn thu:</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <QrCode className="h-3.5 w-3.5 text-teal-600" />
                        Chuyển khoản VietQR
                      </span>
                      <span className="font-bold text-slate-900 tabular-nums">{formatVND(stats.totalVietQr)}</span>
                    </div>
                    <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                        Tiền mặt & Quẹt thẻ quầy
                      </span>
                      <span className="font-bold text-slate-900 tabular-nums">{formatVND(stats.totalCashAndCard)}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeKpiModal === 'VIETQR' && (
                <div className="space-y-3 text-xs">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-emerald-900">Cổng Thanh Toán MB Bank · Napas247</div>
                      <div className="text-[11px] text-emerald-700">Tài khoản: 0388889999 · PHARMACORE PHARMACY</div>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      Đã kết nối
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden max-h-72 overflow-y-auto">
                    {payments
                      .filter((p) => p.PaymentMethod === 'VIETQR')
                      .map((p) => (
                        <div key={p.PaymentID} className="flex items-center justify-between p-3 hover:bg-slate-50">
                          <div>
                            <div className="font-bold text-slate-900">{p.TransactionCode} · {p.invoice?.CustomerName || 'Khách lẻ'}</div>
                            <div className="text-[11px] text-slate-500">{new Date(p.PaymentDate).toLocaleString('vi-VN')} · Đơn: {p.invoice?.InvoiceCode}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-teal-700 tabular-nums">{formatVND(p.PaidAmount)}</div>
                            <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.2 text-[10px] font-semibold">
                              {p.Status}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {activeKpiModal === 'CASH' && (
                <div className="space-y-3 text-xs">
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 space-y-1">
                    <div className="font-bold text-sky-900">Két Tiền Mặt Tại Quầy GPP</div>
                    <p className="text-[11px] text-sky-700">
                      Dành cho thu ngân kiểm đếm tiền mặt trước khi bàn giao ca trực.
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden max-h-72 overflow-y-auto">
                    {payments
                      .filter((p) => p.PaymentMethod !== 'VIETQR' && p.Status === 'PAID')
                      .map((p) => (
                        <div key={p.PaymentID} className="flex items-center justify-between p-3 hover:bg-slate-50">
                          <div>
                            <div className="font-bold text-slate-900">{p.TransactionCode} · {p.invoice?.CustomerName || 'Khách vãng lai'}</div>
                            <div className="text-[11px] text-slate-500">Hình thức: {p.PaymentMethod} · {new Date(p.PaymentDate).toLocaleDateString('vi-VN')}</div>
                          </div>
                          <span className="font-bold text-slate-900 tabular-nums">{formatVND(p.PaidAmount)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {activeKpiModal === 'REFUND' && (
                <div className="space-y-3 text-xs">
                  {stats.totalRefunded === 0 ? (
                    <div className="text-center py-8 text-slate-500">Chưa có giao dịch chi hoàn nào.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 rounded-xl border border-rose-200 overflow-hidden">
                      {payments
                        .filter((p) => p.Status === 'REFUNDED')
                        .map((p) => (
                          <div key={p.PaymentID} className="flex items-center justify-between p-3 hover:bg-rose-50/30">
                            <div>
                              <div className="font-bold text-rose-700">{p.TransactionCode} · {p.invoice?.CustomerName}</div>
                              <div className="text-[11px] text-slate-500">Hóa đơn gốc: {p.invoice?.InvoiceCode} · Hoàn trả thuốc</div>
                            </div>
                            <span className="font-bold text-rose-600 tabular-nums">-{formatVND(p.PaidAmount)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 px-5 py-3 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveKpiModal(null)}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 shadow-sm"
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
