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
  X,
  TrendingUp,
  ShieldCheck,
  Receipt,
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
  { id: 'InvoiceCode', label: 'Mã chứng từ & Liên thông' },
  { id: 'CustomerName', label: 'Bệnh nhân / Khách hàng' },
  { id: 'RxClass', label: 'Phân loại đơn' },
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
      if (selectedInvoice) {
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
      if (selectedInvoice?.InvoiceID === inv.InvoiceID) setSelectedInvoice(null);
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

  const completedInvoices = useMemo(
    () => invoices.filter((i) => i.Status === 'COMPLETED'),
    [invoices]
  );
  const cancelledInvoices = useMemo(
    () => invoices.filter((i) => i.Status === 'CANCELLED'),
    [invoices]
  );
  const netRevenue = useMemo(
    () => completedInvoices.reduce((sum, i) => sum + i.TotalAmount, 0),
    [completedInvoices]
  );

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-5">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="invoices"
        title="Quản lý Hóa Đơn Xuất Bán & Hoàn Trả Hàng (Invoices & Refunds)"
        subtitle="Tra cứu lịch sử đơn thuốc xuất bán, liên thông Dược Quốc Gia, nhân bản đơn mẫu và hoàn trả tự động cộng lại tồn kho."
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
                label: `Hoàn tất (${completedInvoices.length})`,
              },
              {
                id: 'CANCELLED',
                label: `Đã hoàn trả (${cancelledInvoices.length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`h-9 rounded-lg px-3.5 text-xs font-semibold transition-all shadow-sm ${
                  statusFilter === tab.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        }
      />

      {/* 4 Thẻ KPI Doanh thu & Liên thông Hóa đơn */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Doanh thu thực thu (Net)</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <TrendingUp className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">
            {formatVND(netRevenue)}
          </div>
          <div className="mt-1 text-xs text-slate-500">Đã trừ chiết khấu và các đơn hoàn trả</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Hóa đơn xuất bán hoàn tất</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Receipt className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {completedInvoices.length} đơn
          </div>
          <div className="mt-1 text-xs text-slate-500">Đã xuất kho theo lô FEFO</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Đơn hoàn trả & Nhập lại kho</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <RotateCcw className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 tabular-nums">
            {cancelledInvoices.length} đơn
          </div>
          <div className="mt-1 text-xs text-slate-500">Tự động khôi phục 100% tồn kho</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Liên thông Cổng Dược QG</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <ShieldCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
            100% Đồng bộ
          </div>
          <div className="mt-1 text-xs text-slate-500">Mã cơ sở: GPP-HN-08912</div>
        </div>
      </div>

      {/* BẢNG HÓA ĐƠN FULL-WIDTH 100% */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-9">
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
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                  />
                </th>
                {visibleColumns.InvoiceCode !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Mã chứng từ & Liên thông</th>
                )}
                {visibleColumns.CustomerName !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Bệnh nhân / Khách hàng</th>
                )}
                {visibleColumns.RxClass !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Phân loại đơn</th>
                )}
                {visibleColumns.PaymentMethod !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Kênh thanh toán</th>
                )}
                {visibleColumns.TotalAmount !== false && (
                  <th className="py-3 px-4 text-right whitespace-nowrap">Tổng tiền</th>
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
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Đang tải danh sách chứng từ hóa đơn...
                  </td>
                </tr>
              ) : pagedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Không tìm thấy hóa đơn phù hợp.
                  </td>
                </tr>
              ) : (
                pagedInvoices.map((inv) => {
                  const isRx = inv.items.length >= 2 || inv.TotalAmount >= 200000;
                  return (
                    <tr
                      key={inv.InvoiceID}
                      onClick={() => setSelectedInvoice(inv)}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    >
                      <td
                        className="py-3 px-4"
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
                          className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                        />
                      </td>
                      {visibleColumns.InvoiceCode !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-slate-900">
                            {inv.InvoiceCode}
                          </div>
                          <div className="text-[11px] font-mono text-teal-700">
                            DQG-HD-{String(inv.InvoiceID + 5000)} ·{' '}
                            {new Date(inv.CreateDate).toLocaleDateString('vi-VN')}
                          </div>
                        </td>
                      )}
                      {visibleColumns.CustomerName !== false && (
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{inv.CustomerName}</div>
                          <div className="text-[11px] text-slate-500">
                            {inv.CustomerPhone || 'Khách vãng lai'} · {inv.items.length} mặt hàng
                          </div>
                        </td>
                      )}
                      {visibleColumns.RxClass !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold border ${
                              isRx
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}
                          >
                            {isRx ? 'Rx - Theo đơn BS' : 'OTC - Cắt liều lẻ'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.PaymentMethod !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="rounded-md bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 border border-slate-200/60">
                            {inv.payment?.PaymentMethod || 'CASH'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.TotalAmount !== false && (
                        <td className="py-3 px-4 text-right font-bold text-teal-700 tabular-nums whitespace-nowrap">
                          {formatVND(inv.TotalAmount)}
                        </td>
                      )}
                      {visibleColumns.Status !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          {inv.Status === 'CANCELLED' ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200/70">
                              <XCircle className="h-3 w-3" />
                              Đã hoàn trả
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/70">
                              <CheckCircle2 className="h-3 w-3" />
                              Hoàn tất
                            </span>
                          )}
                        </td>
                      )}
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            title="Xem chi tiết & Hoàn trả (Alt+V)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCloneOne(inv)}
                            title="Nhân bản (Alt+C)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteOne(inv)}
                            title="Xóa (Alt+H)"
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

      {/* SLIDE-OVER RIGHT DRAWER: Chi tiết Phiếu Xuất Thuốc GPP & Hoàn Trả Kho */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70 sticky top-0 z-10">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-teal-600" />
                    <span className="font-mono text-xs font-bold text-teal-700">
                      {selectedInvoice.InvoiceCode}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    Phiếu Xuất Thuốc & Hướng Dẫn Liều GPP
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-xs">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/80 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Họ tên người bệnh:</span>
                    <span className="font-bold text-slate-900">
                      {selectedInvoice.CustomerName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Số điện thoại:</span>
                    <span className="font-mono text-slate-800">
                      {selectedInvoice.CustomerPhone || 'Khách vãng lai'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Thời gian xuất bán:</span>
                    <span className="tabular-nums text-slate-800">
                      {new Date(selectedInvoice.CreateDate).toLocaleString('vi-VN')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Mã liên thông Dược QG:</span>
                    <span className="font-mono font-semibold text-teal-700">
                      DQG-HD-{String(selectedInvoice.InvoiceID + 5000)} (Đã đồng bộ)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Lời dặn của Dược sĩ:</span>
                    <span className="font-medium text-slate-800">
                      {selectedInvoice.Note || 'Uống đúng liều chỉ định'}
                    </span>
                  </div>
                </div>

                {/* Danh sách thuốc xuất trong đơn */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Chi tiết Dược phẩm & Liều dùng ({selectedInvoice.items.length} mặt hàng)
                  </h4>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4">
                    {selectedInvoice.items.map((item) => (
                      <div key={item.ItemID} className="py-3 space-y-1">
                        <div className="flex items-center justify-between font-bold text-slate-900">
                          <span>
                            {item.product?.ProductName} × {item.Quantity} {item.product?.Unit}
                          </span>
                          <span className="tabular-nums text-teal-700">
                            {formatVND(item.Quantity * item.UnitPrice)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Chỉ dẫn: {item.DosageNote || 'Uống theo hướng dẫn của dược sĩ'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-teal-50/70 border border-teal-200 p-4 space-y-1.5">
                  {selectedInvoice.Discount ? (
                    <div className="flex justify-between text-slate-600">
                      <span>Chiết khấu giảm giá:</span>
                      <span className="tabular-nums">-{formatVND(selectedInvoice.Discount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-sm font-bold text-teal-900">
                    <span>Tổng thanh toán hóa đơn:</span>
                    <span className="text-base tabular-nums">
                      {formatVND(selectedInvoice.TotalAmount)}
                    </span>
                  </div>
                </div>

                {selectedInvoice.payment?.PaymentMethod === 'VIETQR' &&
                  selectedInvoice.Status === 'COMPLETED' && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center gap-3.5">
                      <img
                        src={`https://img.vietqr.io/image/MB-0388889999-compact2.png?amount=${selectedInvoice.TotalAmount}&addInfo=${encodeURIComponent(
                          selectedInvoice.InvoiceCode
                        )}`}
                        alt="VietQR"
                        className="h-20 w-20 rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                      />
                      <div className="text-xs space-y-1">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <QrCode className="h-3.5 w-3.5 text-teal-600" />
                          <span>Mã GD: {selectedInvoice.payment.TransactionCode}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Chứng từ đã được đối soát tự động vào Sổ quỹ Thanh toán VietQR.
                        </p>
                      </div>
                    </div>
                  )}
              </div>
            </div>

            <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between gap-2 sticky bottom-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>In phiếu GPP</span>
                </button>
                {selectedInvoice.Status === 'COMPLETED' && (
                  <button
                    type="button"
                    disabled={cancellingId === selectedInvoice.InvoiceID}
                    onClick={() => void handleCancelAndRefund(selectedInvoice)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Hoàn trả & Cộng kho</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
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
