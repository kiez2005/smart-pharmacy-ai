import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  RotateCcw,
  Printer,
  CheckCircle2,
  XCircle,
  QrCode,
  Eye,
  Copy,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formsApi } from '../services/forms.api';
import { enterpriseApi } from '../services/enterprise.api';
import { InvoiceRecord } from '../types/forms';
import {
  ColumnConfig,
  EnterprisePagination,
  EnterpriseToolbar,
} from '../components/common/EnterpriseDataToolbar';

const INVOICE_COLUMNS: ColumnConfig[] = [
  { id: 'InvoiceCode', label: 'Mã chứng từ' },
  { id: 'CustomerName', label: 'Bệnh nhân / Khách hàng' },
  { id: 'PaymentMethod', label: 'Kênh thanh toán' },
  { id: 'TotalAmount', label: 'Tổng thanh toán' },
  { id: 'Status', label: 'Trạng thái' },
];

export const InvoicesManagementPage: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // 11 Chức năng Data Grid
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const list = await formsApi.listInvoices();
      setInvoices(list);
      setSelectedIds([]);
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

  const handleDeleteOne = async (inv: InvoiceRecord) => {
    if (!window.confirm(`Xác nhận xóa chứng từ hóa đơn ${inv.InvoiceCode}?`)) return;
    try {
      await enterpriseApi.deleteRecord('invoices', inv.InvoiceID);
      toast.success(`Đã xóa hóa đơn ${inv.InvoiceCode}`);
      await loadInvoices();
    } catch {
      toast.error('Không thể xóa chứng từ hóa đơn');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 hóa đơn trong bảng');
      return;
    }
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} hóa đơn đã chọn?`)) return;
    try {
      const count = await enterpriseApi.bulkDelete('invoices', selectedIds);
      toast.success(`Đã xóa ${count} hóa đơn`);
      await loadInvoices();
    } catch {
      toast.error('Không thể xóa hàng loạt hóa đơn');
    }
  };

  const handleCloneOne = async (inv: InvoiceRecord) => {
    try {
      await enterpriseApi.cloneRecord('invoices', inv.InvoiceID);
      toast.success(`Đã nhân bản hóa đơn ${inv.InvoiceCode}`);
      await loadInvoices();
    } catch {
      toast.error('Không thể nhân bản hóa đơn');
    }
  };

  const handleBulkClone = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 hóa đơn để nhân bản');
      return;
    }
    try {
      const count = await enterpriseApi.bulkClone('invoices', selectedIds);
      toast.success(`Đã nhân bản ${count} hóa đơn`);
      await loadInvoices();
    } catch {
      toast.error('Không thể nhân bản hàng loạt');
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedInvoices = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-5">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="invoices"
        title="Quản lý Hóa Đơn Xuất Bán & Hoàn Trả Hàng (Invoices & Refunds)"
        subtitle="Tra cứu lịch sử đơn thuốc xuất bán, nhân bản đơn mẫu, xuất báo cáo Excel/JSON/XML, ẩn/hiện cột và hoàn trả tự động cộng lại tồn kho."
        createLabel="Nhân bản Đơn mẫu (Alt+N)"
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo mã hóa đơn (HD-...), tên bệnh nhân hoặc SĐT... (Alt + F)"
        columns={INVOICE_COLUMNS}
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
          if (invoices.length > 0) void handleCloneOne(invoices[0]);
        }}
        onBulkDelete={() => void handleBulkDelete()}
        onBulkClone={() => void handleBulkClone()}
        onViewSelected={() => {
          if (selectedIds.length === 1) {
            const found = invoices.find((i) => i.InvoiceID === selectedIds[0]);
            if (found) setSelectedInvoice(found);
          }
        }}
        onCloneSelected={() => {
          if (selectedIds.length === 1) {
            const found = invoices.find((i) => i.InvoiceID === selectedIds[0]);
            if (found) void handleCloneOne(found);
          }
        }}
        onReload={loadInvoices}
        extraFilters={
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
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
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
        }
      />

      {/* Bảng Hóa đơn & Chi tiết Hóa đơn */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={
                        pagedInvoices.length > 0 &&
                        pagedInvoices.every((i) => selectedIds.includes(i.InvoiceID))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(pagedInvoices.map((i) => i.InvoiceID));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                    />
                  </th>
                  {visibleColumns.InvoiceCode !== false && (
                    <th className="py-2.5 px-3">Mã chứng từ</th>
                  )}
                  {visibleColumns.CustomerName !== false && (
                    <th className="py-2.5 px-3">Bệnh nhân / Khách hàng</th>
                  )}
                  {visibleColumns.PaymentMethod !== false && (
                    <th className="py-2.5 px-3">Thanh toán</th>
                  )}
                  {visibleColumns.TotalAmount !== false && (
                    <th className="py-2.5 px-3 text-right">Tổng tiền</th>
                  )}
                  {visibleColumns.Status !== false && (
                    <th className="py-2.5 px-3 text-right">Trạng thái</th>
                  )}
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-400">
                      Đang tải danh sách chứng từ hóa đơn...
                    </td>
                  </tr>
                ) : pagedInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-400">
                      Không tìm thấy hóa đơn phù hợp.
                    </td>
                  </tr>
                ) : (
                  pagedInvoices.map((inv) => {
                    const isSelected = selectedInvoice?.InvoiceID === inv.InvoiceID;
                    return (
                      <tr
                        key={inv.InvoiceID}
                        onClick={() => setSelectedInvoice(inv)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-zinc-100/90' : 'hover:bg-zinc-50'
                        }`}
                      >
                        <td
                          className="py-3 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(inv.InvoiceID)}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(inv.InvoiceID)
                                  ? prev.filter((id) => id !== inv.InvoiceID)
                                  : [...prev, inv.InvoiceID]
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                          />
                        </td>
                        {visibleColumns.InvoiceCode !== false && (
                          <td className="py-3 px-3">
                            <div className="font-mono font-semibold text-zinc-900">
                              {inv.InvoiceCode}
                            </div>
                            <div className="text-[11px] text-zinc-400">
                              {new Date(inv.CreateDate).toLocaleString('vi-VN')}
                            </div>
                          </td>
                        )}
                        {visibleColumns.CustomerName !== false && (
                          <td className="py-3 px-3">
                            <div className="font-medium text-zinc-900">{inv.CustomerName}</div>
                            <div className="text-[11px] text-zinc-500">
                              {inv.CustomerPhone || 'Khách lẻ'} · {inv.items.length} mặt hàng
                            </div>
                          </td>
                        )}
                        {visibleColumns.PaymentMethod !== false && (
                          <td className="py-3 px-3">
                            <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-700">
                              {inv.payment?.PaymentMethod || 'CASH'}
                            </span>
                          </td>
                        )}
                        {visibleColumns.TotalAmount !== false && (
                          <td className="py-3 px-3 text-right font-semibold text-zinc-900 tabular-nums">
                            {formatVND(inv.TotalAmount)}
                          </td>
                        )}
                        {visibleColumns.Status !== false && (
                          <td className="py-3 px-3 text-right">
                            {inv.Status === 'CANCELLED' ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 border border-rose-200/60">
                                <XCircle className="h-3 w-3" />
                                Hoàn trả
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                                <CheckCircle2 className="h-3 w-3" />
                                Hoàn tất
                              </span>
                            )}
                          </td>
                        )}
                        <td
                          className="py-3 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoice(inv)}
                              title="Xem chi tiết (Alt+V)"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCloneOne(inv)}
                              title="Nhân bản (Alt+C)"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteOne(inv)}
                              title="Xóa (Alt+H)"
                              className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
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
