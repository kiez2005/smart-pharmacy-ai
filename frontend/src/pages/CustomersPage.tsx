import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  AlertTriangle,
  HeartPulse,
  Award,
  Pencil,
  Copy,
  Trash2,
  Eye,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { enterpriseApi } from '../services/enterprise.api';
import { CustomerRecord } from '../types/enterprise';
import {
  ColumnConfig,
  EnterprisePagination,
  EnterpriseToolbar,
} from '../components/common/EnterpriseDataToolbar';

const CUSTOMER_COLUMNS: ColumnConfig[] = [
  { id: 'CustomerCode', label: 'Mã bệnh nhân' },
  { id: 'FullName', label: 'Họ tên & Liên hệ' },
  { id: 'Allergies', label: 'Tiền sử dị ứng thuốc' },
  { id: 'ChronicCond', label: 'Bệnh lý nền' },
  { id: 'LoyaltyPoints', label: 'Điểm tích lũy' },
];

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);

  // 11 Chức năng Data Grid
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});

  // Modal Tạo / Sửa Hồ sơ Bệnh nhân
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [formData, setFormData] = useState({
    FullName: '',
    Phone: '',
    Email: '',
    BirthYear: 1985,
    Gender: 'Nam',
    Allergies: 'Không ghi nhận',
    ChronicCond: 'Không',
  });

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const list = await enterpriseApi.getCustomers();
      setCustomers(list);
      setSelectedIds([]);
      if (selectedCustomer) {
        const updated = list.find((c) => c.CustomerID === selectedCustomer.CustomerID);
        if (updated) setSelectedCustomer(updated);
      }
    } catch {
      toast.error('Không thể tải hồ sơ bệnh nhân');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormData({
      FullName: '',
      Phone: '',
      Email: '',
      BirthYear: 1990,
      Gender: 'Nữ',
      Allergies: 'Không ghi nhận',
      ChronicCond: 'Không',
    });
    setShowModal(true);
  };

  const openEditModal = (cust: CustomerRecord) => {
    setEditingCustomer(cust);
    setFormData({
      FullName: cust.FullName,
      Phone: cust.Phone,
      Email: cust.Email || '',
      BirthYear: cust.BirthYear || 1990,
      Gender: cust.Gender || 'Nam',
      Allergies: cust.Allergies || 'Không ghi nhận',
      ChronicCond: cust.ChronicCond || 'Không',
    });
    setShowModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.FullName.trim() || !formData.Phone.trim()) return;
    try {
      if (editingCustomer) {
        const updated = await enterpriseApi.updateCustomer(editingCustomer.CustomerID, formData);
        toast.success(`Đã cập nhật hồ sơ bệnh nhân ${updated.FullName}`);
        setSelectedCustomer(updated);
      } else {
        const created = await enterpriseApi.createCustomer(formData);
        toast.success(`Đã mở hồ sơ bệnh nhân mới ${created.CustomerCode}`);
        setSelectedCustomer(created);
      }
      setShowModal(false);
      await loadCustomers();
    } catch {
      toast.error('Số điện thoại đã tồn tại hoặc dữ liệu không hợp lệ');
    }
  };

  const handleDeleteOne = async (c: CustomerRecord) => {
    if (!window.confirm(`Xác nhận xóa hồ sơ bệnh nhân "${c.FullName}"?`)) return;
    try {
      await enterpriseApi.deleteRecord('customers', c.CustomerID);
      toast.success(`Đã xóa hồ sơ ${c.CustomerCode}`);
      if (selectedCustomer?.CustomerID === c.CustomerID) setSelectedCustomer(null);
      await loadCustomers();
    } catch {
      toast.error('Bệnh nhân đã có hóa đơn liên kết, không thể xóa');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 hồ sơ bệnh nhân');
      return;
    }
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} hồ sơ đã chọn?`)) return;
    try {
      const count = await enterpriseApi.bulkDelete('customers', selectedIds);
      toast.success(`Đã xóa ${count} hồ sơ bệnh nhân`);
      await loadCustomers();
    } catch {
      toast.error('Không thể xóa hồ sơ đã có hóa đơn');
    }
  };

  const handleCloneOne = async (c: CustomerRecord) => {
    try {
      await enterpriseApi.cloneRecord('customers', c.CustomerID);
      toast.success(`Đã nhân bản hồ sơ "${c.FullName}"`);
      await loadCustomers();
    } catch {
      toast.error('Không thể nhân bản hồ sơ bệnh nhân');
    }
  };

  const handleBulkClone = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 hồ sơ để nhân bản');
      return;
    }
    try {
      const count = await enterpriseApi.bulkClone('customers', selectedIds);
      toast.success(`Đã nhân bản ${count} hồ sơ bệnh nhân`);
      await loadCustomers();
    } catch {
      toast.error('Không thể nhân bản hàng loạt');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.FullName.toLowerCase().includes(q) ||
        c.Phone.toLowerCase().includes(q) ||
        c.CustomerCode.toLowerCase().includes(q) ||
        (c.Allergies || '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedCustomers = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  const allergyCount = useMemo(
    () =>
      customers.filter(
        (c) =>
          c.Allergies &&
          c.Allergies !== 'Không ghi nhận' &&
          c.Allergies !== 'Không' &&
          c.Allergies !== 'Không có'
      ).length,
    [customers]
  );

  const chronicCount = useMemo(
    () =>
      customers.filter(
        (c) => c.ChronicCond && c.ChronicCond !== 'Không' && c.ChronicCond !== 'Không có'
      ).length,
    [customers]
  );

  const totalLoyaltyPoints = useMemo(
    () => customers.reduce((sum, c) => sum + (c.LoyaltyPoints || 0), 0),
    [customers]
  );

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-5">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="customers"
        title="Hồ Sơ Bệnh Nhân, Tiền Sử Dị Ứng Thuốc & Lịch Sử Điều Trị (Patient CRM)"
        subtitle="Lưu trữ thông tin dị ứng hoạt chất, bệnh lý nền mãn tính và lịch sử đơn thuốc (đầy đủ 11 chức năng CRUD, Nhân bản, Import/Export)."
        createLabel="Mở Hồ sơ mới (Alt+N)"
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo họ tên, SĐT, mã BN hoặc hoạt chất dị ứng... (Alt + F)"
        columns={CUSTOMER_COLUMNS}
        visibleColumns={visibleColumns}
        onToggleColumn={(colId) =>
          setVisibleColumns((prev) => ({
            ...prev,
            [colId]: prev[colId] === false ? true : false,
          }))
        }
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
        onOpenCreate={openCreateModal}
        onBulkDelete={() => void handleBulkDelete()}
        onBulkClone={() => void handleBulkClone()}
        onEditSelected={() => {
          if (selectedIds.length === 1) {
            const found = customers.find((c) => c.CustomerID === selectedIds[0]);
            if (found) openEditModal(found);
          }
        }}
        onViewSelected={() => {
          if (selectedIds.length === 1) {
            const found = customers.find((c) => c.CustomerID === selectedIds[0]);
            if (found) setSelectedCustomer(found);
          }
        }}
        onCloneSelected={() => {
          if (selectedIds.length === 1) {
            const found = customers.find((c) => c.CustomerID === selectedIds[0]);
            if (found) void handleCloneOne(found);
          }
        }}
        onReload={loadCustomers}
      />

      {/* 4 Thẻ KPI Hồ sơ Bệnh nhân & Cảnh báo Dị ứng */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tổng hồ sơ bệnh nhân</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {customers.length} hồ sơ
          </div>
          <div className="mt-1 text-xs text-slate-500">Đang theo dõi điều trị tại nhà thuốc</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Cảnh báo Dị ứng Hoạt chất</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-600 tabular-nums">
            {allergyCount} bệnh nhân
          </div>
          <div className="mt-1 text-xs text-slate-500">Tự động chặn khi kê đơn tại POS</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Bệnh lý nền mãn tính</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <HeartPulse className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {chronicCount} bệnh nhân
          </div>
          <div className="mt-1 text-xs text-slate-500">Cấp phát thuốc định kỳ hàng tháng</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tổng điểm thành viên</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Award className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">
            {totalLoyaltyPoints.toLocaleString('vi-VN')} điểm
          </div>
          <div className="mt-1 text-xs text-slate-500">Quy đổi chiết khấu trực tiếp tại POS</div>
        </div>
      </div>

      {/* BẢNG HỒ SƠ BỆNH NHÂN FULL-WIDTH 100% */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4 w-9">
                  <input
                    type="checkbox"
                    checked={
                      pagedCustomers.length > 0 &&
                      pagedCustomers.every((c) => selectedIds.includes(c.CustomerID))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(pagedCustomers.map((c) => c.CustomerID));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                  />
                </th>
                {visibleColumns.CustomerCode !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Mã BN</th>
                )}
                {visibleColumns.FullName !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Họ tên & Liên hệ</th>
                )}
                {visibleColumns.Allergies !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Tiền sử Dị ứng thuốc</th>
                )}
                {visibleColumns.ChronicCond !== false && (
                  <th className="py-3 px-4 whitespace-nowrap">Bệnh lý nền</th>
                )}
                {visibleColumns.LoyaltyPoints !== false && (
                  <th className="py-3 px-4 text-right whitespace-nowrap">Điểm tích lũy</th>
                )}
                <th className="py-3 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Đang tải hồ sơ bệnh nhân...
                  </td>
                </tr>
              ) : (
                pagedCustomers.map((c) => {
                  const hasAllergy =
                    c.Allergies &&
                    c.Allergies !== 'Không ghi nhận' &&
                    c.Allergies !== 'Không' &&
                    c.Allergies !== 'Không có';
                  return (
                    <tr
                      key={c.CustomerID}
                      onClick={() => setSelectedCustomer(c)}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    >
                      <td
                        className="py-3 px-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(c.CustomerID)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(c.CustomerID)
                                ? prev.filter((id) => id !== c.CustomerID)
                                : [...prev, c.CustomerID]
                            )
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                        />
                      </td>
                      {visibleColumns.CustomerCode !== false && (
                        <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                          {c.CustomerCode}
                        </td>
                      )}
                      {visibleColumns.FullName !== false && (
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{c.FullName}</div>
                          <div className="text-[11px] text-slate-500">
                            {c.Phone} · {c.Gender} ({c.BirthYear})
                          </div>
                        </td>
                      )}
                      {visibleColumns.Allergies !== false && (
                        <td className="py-3 px-4 whitespace-nowrap">
                          {hasAllergy ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200/70">
                              <AlertTriangle className="h-3 w-3" />
                              {c.Allergies}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">Không ghi nhận</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.ChronicCond !== false && (
                        <td className="py-3 px-4 text-xs font-medium text-slate-700">
                          {c.ChronicCond || 'Không'}
                        </td>
                      )}
                      {visibleColumns.LoyaltyPoints !== false && (
                        <td className="py-3 px-4 text-right font-bold text-teal-700 tabular-nums whitespace-nowrap">
                          {c.LoyaltyPoints} điểm
                        </td>
                      )}
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCustomer(c)}
                            title="Xem bệnh án & Đơn thuốc (Alt+V)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(c)}
                            title="Chỉnh sửa (Alt+E)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCloneOne(c)}
                            title="Nhân bản (Alt+C)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteOne(c)}
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

      {/* SLIDE-OVER RIGHT DRAWER: Chi tiết Hồ sơ Bệnh án & Đơn thuốc cũ */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-full sm:max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/70 sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="font-mono text-xs font-bold text-teal-700">
                      {selectedCustomer.CustomerCode}
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedCustomer.FullName}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-500 block">Số điện thoại:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {selectedCustomer.Phone}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Giới tính & Năm sinh:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedCustomer.Gender} · {selectedCustomer.BirthYear}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                    <div className="flex items-center gap-1.5 font-bold text-rose-800">
                      <AlertTriangle className="h-4 w-4 text-rose-600" />
                      <span>Tiền sử Dị ứng Hoạt chất Thuốc:</span>
                    </div>
                    <div className="mt-1.5 text-sm font-bold text-rose-900">
                      {selectedCustomer.Allergies || 'Không ghi nhận'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800">
                      <HeartPulse className="h-4 w-4 text-teal-600" />
                      <span>Bệnh lý nền / Theo dõi định kỳ:</span>
                    </div>
                    <div className="mt-1.5 text-sm font-semibold text-slate-800">
                      {selectedCustomer.ChronicCond || 'Không'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold text-teal-900">
                      <Award className="h-4 w-4 text-teal-600" />
                      <span>Điểm tích lũy thành viên:</span>
                    </span>
                    <span className="text-base font-bold text-teal-700 tabular-nums">
                      {selectedCustomer.LoyaltyPoints} điểm
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Lịch sử Đơn thuốc Đã Cấp Phát ({selectedCustomer.invoices?.length || 0})
                  </h4>
                  <div className="space-y-2">
                    {!selectedCustomer.invoices || selectedCustomer.invoices.length === 0 ? (
                      <div className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                        Chưa phát sinh đơn thuốc lưu trong hồ sơ này.
                      </div>
                    ) : (
                      selectedCustomer.invoices.map((inv) => (
                        <div
                          key={inv.InvoiceID}
                          className="rounded-xl border border-slate-200 p-3.5 flex items-center justify-between hover:bg-slate-50"
                        >
                          <div>
                            <div className="font-mono font-bold text-teal-700">
                              {inv.InvoiceCode}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {new Date(inv.CreateDate).toLocaleDateString('vi-VN')}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-slate-900 tabular-nums">
                              {formatVND(inv.TotalAmount)}
                            </div>
                            <span className="text-[10px] text-emerald-700 font-semibold">
                              {inv.Status}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 flex items-center justify-end gap-2 sticky bottom-0 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const target = selectedCustomer;
                  setSelectedCustomer(null);
                  openEditModal(target);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Cập nhật Hồ sơ (Alt+E)</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thêm / Sửa Hồ sơ Bệnh nhân */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-2 sm:p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="w-full max-w-md max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-5 py-3.5 shrink-0">
              <h3 className="text-sm font-bold text-slate-900">
                {editingCustomer ? 'Cập nhật Hồ sơ Bệnh nhân' : 'Mở Hồ sơ Bệnh nhân Mới'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-3 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Họ và tên bệnh nhân *
                </label>
                <input
                  type="text"
                  required
                  value={formData.FullName}
                  onChange={(e) => setFormData({ ...formData, FullName: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    value={formData.Phone}
                    onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Năm sinh</label>
                  <input
                    type="number"
                    value={formData.BirthYear}
                    onChange={(e) =>
                      setFormData({ ...formData, BirthYear: Number(e.target.value) })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-rose-700 mb-1">
                  Tiền sử Dị ứng Thuốc (ngăn cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  value={formData.Allergies}
                  onChange={(e) => setFormData({ ...formData, Allergies: e.target.value })}
                  placeholder="VD: Penicillin, Amoxicillin, Ibuprofen..."
                  className="w-full h-9 rounded-lg border border-rose-300 bg-rose-50/30 px-3 text-xs text-slate-900 shadow-sm focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Bệnh lý nền mãn tính
                </label>
                <input
                  type="text"
                  value={formData.ChronicCond}
                  onChange={(e) => setFormData({ ...formData, ChronicCond: e.target.value })}
                  placeholder="VD: Viêm dạ dày, Tăng huyết áp, Đái tháo đường..."
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-4 sm:px-5 py-3 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Lưu Hồ sơ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
