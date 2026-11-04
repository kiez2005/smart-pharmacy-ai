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
  { id: 'TransactionCode', label: 'Mã giao dịch' },
  { id: 'InvoiceCode', label: 'Hóa đơn tham chiếu' },
  { id: 'CustomerName', label: 'Khách hàng' },
  { id: 'PaymentMethod', label: 'Phương thức' },
  { id: 'PaymentDate', label: 'Thời gian ghi nhận' },
  { id: 'PaidAmount', label: 'Số tiền' },
  { id: 'Status', label: 'Trạng thái' },
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
        title="Sổ Quỹ Thanh Toán & Đối Soát Giao Dịch (Payments Ledger)"
        subtitle="Quản lý dòng tiền thực thu VietQR Napas247, tiền mặt, thẻ ngân hàng, xuất báo cáo đối soát Excel/JSON/XML và tùy chỉnh cột."
        createLabel="Đối soát VietQR (Alt+N)"
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo mã giao dịch (VQR-...), mã hóa đơn hoặc tên khách... (Alt + F)"
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
              { id: 'VIETQR', label: 'VietQR' },
              { id: 'CASH', label: 'Tiền mặt' },
              { id: 'CARD', label: 'Thẻ ngân hàng' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethodFilter(m.id);
                  setPage(1);
                }}
                className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                  methodFilter === m.id
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      />

      {/* 4 Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Tổng thực thu trong kỳ</span>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
            {formatVND(stats.totalNet)}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">Đã trừ các giao dịch hoàn trả</p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Chuyển khoản VietQR 24/7</span>
            <QrCode className="h-4 w-4 text-zinc-700" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
            {formatVND(stats.totalVietQr)}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">Đối soát mã giao dịch tự động</p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Tiền mặt & Thẻ POS</span>
            <Banknote className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">
            {formatVND(stats.totalCashAndCard)}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">Quỹ tiền mặt tại két thu ngân</p>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Tổng hoàn tiền (Refunded)</span>
            <RotateCcw className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-rose-600 tabular-nums">
            {formatVND(stats.totalRefunded)}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">Từ các hóa đơn hủy/trả hàng</p>
        </div>
      </div>

      {/* Bảng Sổ Quỹ chuẩn 11 chức năng */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                <th className="py-2.5 px-3.5 w-8">
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
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                  />
                </th>
                {visibleColumns.TransactionCode !== false && (
                  <th className="py-2.5 px-3.5">Mã giao dịch</th>
                )}
                {visibleColumns.InvoiceCode !== false && (
                  <th className="py-2.5 px-3.5">Hóa đơn tham chiếu</th>
                )}
                {visibleColumns.CustomerName !== false && (
                  <th className="py-2.5 px-3.5">Khách hàng</th>
                )}
                {visibleColumns.PaymentMethod !== false && (
                  <th className="py-2.5 px-3.5">Phương thức</th>
                )}
                {visibleColumns.PaymentDate !== false && (
                  <th className="py-2.5 px-3.5">Thời gian ghi nhận</th>
                )}
                {visibleColumns.PaidAmount !== false && (
                  <th className="py-2.5 px-3.5 text-right">Số tiền</th>
                )}
                {visibleColumns.Status !== false && (
                  <th className="py-2.5 px-3.5 text-right">Trạng thái</th>
                )}
                <th className="py-2.5 px-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-zinc-400">
                    Đang tải sổ quỹ giao dịch...
                  </td>
                </tr>
              ) : pagedPayments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-zinc-400">
                    Chưa có bút toán thanh toán phù hợp.
                  </td>
                </tr>
              ) : (
                pagedPayments.map((p) => (
                  <tr key={p.PaymentID} className="hover:bg-zinc-50">
                    <td className="py-3 px-3.5">
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
                        className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                      />
                    </td>
                    {visibleColumns.TransactionCode !== false && (
                      <td className="py-3 px-3.5 font-mono font-semibold text-zinc-900">
                        {p.TransactionCode || `PAY-${p.PaymentID}`}
                      </td>
                    )}
                    {visibleColumns.InvoiceCode !== false && (
                      <td className="py-3 px-3.5 font-mono text-zinc-700">
                        {p.invoice?.InvoiceCode || `#${p.InvoiceID}`}
                      </td>
                    )}
                    {visibleColumns.CustomerName !== false && (
                      <td className="py-3 px-3.5 font-medium text-zinc-900">
                        {p.invoice?.CustomerName || 'Khách vãng lai'}
                      </td>
                    )}
                    {visibleColumns.PaymentMethod !== false && (
                      <td className="py-3 px-3.5">
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-800">
                          {p.PaymentMethod}
                        </span>
                      </td>
                    )}
                    {visibleColumns.PaymentDate !== false && (
                      <td className="py-3 px-3.5 text-zinc-500 tabular-nums">
                        {new Date(p.PaymentDate).toLocaleString('vi-VN')}
                      </td>
                    )}
                    {visibleColumns.PaidAmount !== false && (
                      <td className="py-3 px-3.5 text-right font-semibold text-zinc-900 tabular-nums">
                        {formatVND(p.PaidAmount)}
                      </td>
                    )}
                    {visibleColumns.Status !== false && (
                      <td className="py-3 px-3.5 text-right">
                        {p.Status === 'REFUNDED' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 border border-rose-200/60">
                            Đã hoàn tiền
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                            <CheckCircle2 className="h-3 w-3" />
                            Đã đối soát
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-3 px-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setPreviewQrPayment(p)}
                          title="Xem chứng từ VietQR (Alt+V)"
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteOne(p)}
                          title="Xóa bút toán (Alt+H)"
                          className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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

      {/* Modal Xem lại Mã VietQR */}
      {previewQrPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h3 className="text-xs font-semibold text-zinc-900">
                Chứng từ Thanh toán ({previewQrPayment.TransactionCode})
              </h3>
              <button
                type="button"
                onClick={() => setPreviewQrPayment(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 text-center space-y-3">
              <img
                src={`https://img.vietqr.io/image/MB-0388889999-compact2.png?amount=${previewQrPayment.PaidAmount}&addInfo=${encodeURIComponent(
                  previewQrPayment.invoice?.InvoiceCode || 'PHARMACORE'
                )}`}
                alt="VietQR"
                className="mx-auto h-52 w-52 rounded border border-zinc-200 p-1"
              />
              <div className="text-xs text-zinc-600">
                Số tiền đối soát:{' '}
                <strong className="text-zinc-900 tabular-nums">
                  {formatVND(previewQrPayment.PaidAmount)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
