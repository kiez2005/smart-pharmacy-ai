import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Search,
  RotateCcw,
  Printer,
  CheckCircle2,
  XCircle,
  QrCode,
} from 'lucide-react';
import { toast } from 'sonner';
import { formsApi } from '../services/forms.api';
import { InvoiceRecord } from '../types/forms';

export const InvoicesManagementPage: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const list = await formsApi.listInvoices();
      setInvoices(list);
      if (list.length > 0 && !selectedInvoice) {
        setSelectedInvoice(list[0]);
      } else if (selectedInvoice) {
        const updated = list.find((i) => i.InvoiceID === selectedInvoice.InvoiceID);
        if (updated) setSelectedInvoice(updated);
      }
    } catch {
      toast.error('Không thể tải danh sách hóa đơn xuất bán');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelAndRefund = async (invoice: InvoiceRecord) => {
    if (
      !window.confirm(
        `Xác nhận HỦY & HOÀN TRẢ hóa đơn ${invoice.InvoiceCode}? Toàn bộ số lượng thuốc trong đơn sẽ được cộng trả lại vào tồn kho.`
      )
    ) {
      return;
    }
    setCancellingId(invoice.InvoiceID);
    try {
      const updated = await formsApi.cancelInvoice(invoice.InvoiceID);
      toast.success(
        `Đã hoàn trả đơn ${updated.InvoiceCode} và cộng lại tồn kho cho ${updated.items.length} mặt hàng!`
      );
      await loadInvoices();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Không thể hoàn trả hóa đơn';
      toast.error(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchStatus = statusFilter === 'ALL' || inv.Status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchQuery =
        !q ||
        inv.InvoiceCode.toLowerCase().includes(q) ||
        inv.CustomerName.toLowerCase().includes(q) ||
        (inv.CustomerPhone || '').toLowerCase().includes(q);
      return matchStatus && matchQuery;
    });
  }, [invoices, statusFilter, search]);

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            Quản lý Hóa Đơn Xuất Bán & Hoàn Trả Hàng (Invoices & Refunds)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tra cứu lịch sử đơn thuốc xuất bán, in lại phiếu hướng dẫn liều dùng GPP và xử lý hoàn trả tự động cộng lại tồn kho.
          </p>
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
            placeholder="Tìm theo mã hóa đơn (HD-...), tên bệnh nhân hoặc SĐT..."
            className="w-full h-8 rounded-md border border-zinc-300 pl-9 pr-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {[
            { id: 'ALL', label: `Tất cả (${invoices.length})` },
            {
              id: 'COMPLETED',
              label: `Hoàn tất (${invoices.filter((i) => i.Status === 'COMPLETED').length})`,
            },
            {
              id: 'CANCELLED',
              label: `Đã hoàn trả (${invoices.filter((i) => i.Status === 'CANCELLED').length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bảng Hóa đơn & Chi tiết Hóa đơn */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2.5 px-3.5">Mã chứng từ</th>
                  <th className="py-2.5 px-3.5">Bệnh nhân / Khách hàng</th>
                  <th className="py-2.5 px-3.5">Thanh toán</th>
                  <th className="py-2.5 px-3.5 text-right">Tổng tiền</th>
                  <th className="py-2.5 px-3.5 text-right">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-zinc-400">
                      Đang tải danh sách chứng từ hóa đơn...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-zinc-400">
                      Không tìm thấy hóa đơn phù hợp.
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => {
                    const isSelected = selectedInvoice?.InvoiceID === inv.InvoiceID;
                    return (
                      <tr
                        key={inv.InvoiceID}
                        onClick={() => setSelectedInvoice(inv)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-zinc-100/90' : 'hover:bg-zinc-50'
                        }`}
                      >
                        <td className="py-3 px-3.5">
                          <div className="font-mono font-semibold text-zinc-900">
                            {inv.InvoiceCode}
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            {new Date(inv.CreateDate).toLocaleString('vi-VN')}
                          </div>
                        </td>
                        <td className="py-3 px-3.5">
                          <div className="font-medium text-zinc-900">{inv.CustomerName}</div>
                          <div className="text-[11px] text-zinc-500">
                            {inv.CustomerPhone || 'Khách lẻ'} · {inv.items.length} mặt hàng
                          </div>
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-700">
                            {inv.payment?.PaymentMethod || 'CASH'}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right font-semibold text-zinc-900 tabular-nums">
                          {formatVND(inv.TotalAmount)}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          {inv.Status === 'CANCELLED' ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 border border-rose-200/60">
                              <XCircle className="h-3 w-3" />
                              Đã hoàn trả
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                              <CheckCircle2 className="h-3 w-3" />
                              Hoàn tất
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chi tiết Phiếu Xuất Thuốc GPP */}
        <div className="lg:col-span-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs">
          {!selectedInvoice ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              Chọn một hóa đơn bên trái để xem chi tiết phiếu xuất thuốc GPP
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-zinc-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-zinc-900" />
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Phiếu Xuất Thuốc #{selectedInvoice.InvoiceCode}
                    </h2>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Lập lúc: {new Date(selectedInvoice.CreateDate).toLocaleString('vi-VN')}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>In phiếu</span>
                  </button>
                  {selectedInvoice.Status === 'COMPLETED' && (
                    <button
                      type="button"
                      disabled={cancellingId === selectedInvoice.InvoiceID}
                      onClick={() => void handleCancelAndRefund(selectedInvoice)}
                      className="inline-flex h-7 items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Hoàn trả & Nhập lại kho</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-md bg-zinc-50 p-3 border border-zinc-200/70 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Họ tên người bệnh:</span>
                  <span className="font-semibold text-zinc-900">
                    {selectedInvoice.CustomerName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Số điện thoại:</span>
                  <span className="text-zinc-800">{selectedInvoice.CustomerPhone || '---'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Ghi chú dược sĩ:</span>
                  <span className="text-zinc-800">{selectedInvoice.Note || '---'}</span>
                </div>
              </div>

              <div className="divide-y divide-zinc-100">
                {selectedInvoice.items.map((item) => (
                  <div key={item.ItemID} className="py-2.5 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-medium text-zinc-900">
                      <span>
                        {item.product?.ProductName} × {item.Quantity} {item.product?.Unit}
                      </span>
                      <span className="tabular-nums">
                        {formatVND(item.Quantity * item.UnitPrice)}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Liều dùng: {item.DosageNote || 'Uống theo hướng dẫn của dược sĩ'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-zinc-200 pt-3 space-y-1.5 text-xs">
                {selectedInvoice.Discount ? (
                  <div className="flex justify-between text-zinc-500">
                    <span>Chiết khấu giảm giá:</span>
                    <span className="tabular-nums">-{formatVND(selectedInvoice.Discount)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-sm font-semibold text-zinc-900">
                  <span>Tổng thanh toán:</span>
                  <span className="tabular-nums">{formatVND(selectedInvoice.TotalAmount)}</span>
                </div>
              </div>

              {selectedInvoice.payment?.PaymentMethod === 'VIETQR' &&
                selectedInvoice.Status === 'COMPLETED' && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 flex items-center gap-3">
                    <img
                      src={`https://img.vietqr.io/image/MB-0388889999-compact2.png?amount=${selectedInvoice.TotalAmount}&addInfo=${encodeURIComponent(
                        selectedInvoice.InvoiceCode
                      )}`}
                      alt="VietQR"
                      className="h-20 w-20 rounded border border-zinc-200 bg-white p-1 shrink-0"
                    />
                    <div className="text-xs space-y-1">
                      <div className="font-semibold text-zinc-900 flex items-center gap-1">
                        <QrCode className="h-3.5 w-3.5" />
                        <span>Mã giao dịch: {selectedInvoice.payment.TransactionCode}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Chứng từ đã được đối soát tự động vào Sổ quỹ Thanh toán VietQR.
                      </p>
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
