import React, { useEffect, useMemo, useState } from 'react';
import {
  Wallet,
  QrCode,
  Banknote,
  RotateCcw,
  Search,
  CheckCircle2,
  Eye,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { enterpriseApi } from '../services/enterprise.api';
import { PaymentRecord } from '../types/enterprise';

export const PaymentsLedgerPage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [previewQrPayment, setPreviewQrPayment] = useState<PaymentRecord | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const list = await enterpriseApi.getPayments();
      setPayments(list);
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

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
          Sổ Quỹ Thanh Toán & Đối Soát Giao Dịch (Payments Ledger)
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">
          Quản lý dòng tiền thực thu theo phương thức VietQR Napas247, tiền mặt tại quầy, thẻ ngân hàng và chứng từ hoàn tiền.
        </p>
      </div>

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

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-3.5 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã giao dịch (VQR-...), mã hóa đơn hoặc tên khách..."
            className="w-full h-8 rounded-md border border-zinc-300 pl-9 pr-3 text-xs"
          />
        </div>

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
              onClick={() => setMethodFilter(m.id)}
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
      </div>

      {/* Bảng Sổ Quỹ */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                <th className="py-2.5 px-4">Mã giao dịch</th>
                <th className="py-2.5 px-4">Hóa đơn tham chiếu</th>
                <th className="py-2.5 px-4">Khách hàng</th>
                <th className="py-2.5 px-4">Phương thức</th>
                <th className="py-2.5 px-4">Thời gian ghi nhận</th>
                <th className="py-2.5 px-4 text-right">Số tiền</th>
                <th className="py-2.5 px-4 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-zinc-400">
                    Đang tải sổ quỹ giao dịch...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-zinc-400">
                    Chưa có bút toán thanh toán phù hợp.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.PaymentID} className="hover:bg-zinc-50">
                    <td className="py-3 px-4 font-mono font-semibold text-zinc-900">
                      {p.TransactionCode || `PAY-${p.PaymentID}`}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-700">
                      {p.invoice?.InvoiceCode || `#${p.InvoiceID}`}
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-900">
                      {p.invoice?.CustomerName || 'Khách vãng lai'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-800">
                        {p.PaymentMethod}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 tabular-nums">
                      {new Date(p.PaymentDate).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-zinc-900 tabular-nums">
                      {formatVND(p.PaidAmount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
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
                        {p.PaymentMethod === 'VIETQR' && (
                          <button
                            type="button"
                            onClick={() => setPreviewQrPayment(p)}
                            title="Xem mã QR chứng từ"
                            className="rounded border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Xem lại Mã VietQR */}
      {previewQrPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h3 className="text-xs font-semibold text-zinc-900">
                Chứng từ VietQR ({previewQrPayment.TransactionCode})
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
                Số tiền:{' '}
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
