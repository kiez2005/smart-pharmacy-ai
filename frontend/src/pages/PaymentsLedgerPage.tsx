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

      {/* 4 Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tổng thực thu ròng (Net Cash)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">
            {formatVND(stats.totalNet)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Đã cấn trừ các phiếu chi hoàn trả</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Chuyển khoản VietQR 24/7</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <QrCode className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {formatVND(stats.totalVietQr)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Đối soát tự động qua Napas247</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Quỹ Tiền mặt & Thẻ POS</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Banknote className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {formatVND(stats.totalCashAndCard)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Số dư tiền mặt tại két thu ngân</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Phiếu Chi Hoàn Tiền (Refund)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <RotateCcw className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 tabular-nums">
            {formatVND(stats.totalRefunded)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Từ các hóa đơn hủy/nhập trả kho</p>
        </div>
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
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70 sticky top-0 z-10">
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

              <div className="p-6 space-y-5 text-xs">
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
                    className="mx-auto h-52 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs"
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

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between sticky bottom-0">
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
      )}
    </div>
  );
};
