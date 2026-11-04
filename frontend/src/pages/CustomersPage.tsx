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
      if (list.length > 0 && !selectedCustomer) {
        setSelectedCustomer(list[0]);
      } else if (selectedCustomer) {
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

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  return (
    <div className="space-y-5">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="customers"
        title="Hồ Sơ Bệnh Nhân, Tiền Sử Dị Ứng Thuốc & Lịch Sử Điều Trị (Patient CRM)"
        subtitle="Lưu trữ thông tin dị ứng hoạt chất, bệnh lý nền (đầy đủ 11 chức năng CRUD, Nhân bản, Import/Export Excel/JSON/XML, Ẩn/Hiện cột)."
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Danh sách Bệnh nhân chuẩn 11 chức năng */}
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2.5 px-3 w-8">
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
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                    />
                  </th>
                  {visibleColumns.CustomerCode !== false && (
                    <th className="py-2.5 px-3">Mã BN</th>
                  )}
                  {visibleColumns.FullName !== false && (
                    <th className="py-2.5 px-3">Họ tên & Liên hệ</th>
                  )}
                  {visibleColumns.Allergies !== false && (
                    <th className="py-2.5 px-3">Tiền sử Dị ứng thuốc</th>
                  )}
                  {visibleColumns.ChronicCond !== false && (
                    <th className="py-2.5 px-3">Bệnh lý nền</th>
                  )}
                  {visibleColumns.LoyaltyPoints !== false && (
                    <th className="py-2.5 px-3 text-right">Điểm</th>
                  )}
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-zinc-400">
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
                    const isSelected = selectedCustomer?.CustomerID === c.CustomerID;
                    return (
                      <tr
                        key={c.CustomerID}
                        onClick={() => setSelectedCustomer(c)}
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
                            checked={selectedIds.includes(c.CustomerID)}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(c.CustomerID)
                                  ? prev.filter((id) => id !== c.CustomerID)
                                  : [...prev, c.CustomerID]
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                          />
                        </td>
                        {visibleColumns.CustomerCode !== false && (
                          <td className="py-3 px-3 font-mono font-semibold text-zinc-700">
                            {c.CustomerCode}
                          </td>
                        )}
                        {visibleColumns.FullName !== false && (
                          <td className="py-3 px-3">
                            <div className="font-semibold text-zinc-900">{c.FullName}</div>
                            <div className="text-[11px] text-zinc-500">
                              {c.Phone} · {c.Gender} ({c.BirthYear})
                            </div>
                          </td>
                        )}
                        {visibleColumns.Allergies !== false && (
                          <td className="py-3 px-3">
                            {hasAllergy ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 border border-rose-200/60">
                                <AlertTriangle className="h-3 w-3" />
                                {c.Allergies}
                              </span>
                            ) : (
                              <span className="text-zinc-500">Không ghi nhận</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.ChronicCond !== false && (
                          <td className="py-3 px-3 text-zinc-700">{c.ChronicCond || 'Không'}</td>
                        )}
                        {visibleColumns.LoyaltyPoints !== false && (
                          <td className="py-3 px-3 text-right font-semibold text-zinc-900 tabular-nums">
                            {c.LoyaltyPoints}
                          </td>
                        )}
                        <td
                          className="py-3 px-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => setSelectedCustomer(c)}
                              title="Xem hồ sơ (Alt+V)"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(c)}
                              title="Chỉnh sửa (Alt+E)"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleCloneOne(c)}
                              title="Nhân bản (Alt+C)"
                              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteOne(c)}
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

        {/* Chi tiết Hồ sơ Bệnh án & Đơn thuốc cũ */}
        <div className="lg:col-span-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs">
          {!selectedCustomer ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              Chọn một bệnh nhân để xem chi tiết tiền sử dị ứng và lịch sử đơn thuốc
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-zinc-900 text-white flex items-center justify-center font-semibold text-xs">
                    <Users className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">
                      {selectedCustomer.FullName} ({selectedCustomer.CustomerCode})
                    </h2>
                    <p className="text-xs text-zinc-500">
                      SĐT: {selectedCustomer.Phone} · Năm sinh: {selectedCustomer.BirthYear}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openEditModal(selectedCustomer)}
                  className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <Pencil className="h-3 w-3" />
                  <span>Cập nhật (Alt+E)</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5 text-xs">
                <div className="rounded-md border border-rose-200/70 bg-rose-50/50 p-3">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-800">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                    <span>Tiền sử Dị ứng Hoạt chất Thuốc:</span>
                  </div>
                  <div className="mt-1 font-medium text-rose-900">
                    {selectedCustomer.Allergies || 'Không ghi nhận'}
                  </div>
                </div>

                <div className="rounded-md border border-zinc-200/80 bg-zinc-50 p-3">
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-800">
                    <HeartPulse className="h-3.5 w-3.5 text-zinc-600" />
                    <span>Bệnh lý nền / Theo dõi định kỳ:</span>
                  </div>
                  <div className="mt-1 text-zinc-700">
                    {selectedCustomer.ChronicCond || 'Không'}
                  </div>
                </div>

                <div className="rounded-md border border-zinc-200/80 bg-zinc-50 p-3 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-zinc-700">
                    <Award className="h-3.5 w-3.5 text-amber-600" />
                    <span>Điểm tích lũy thành viên:</span>
                  </span>
                  <span className="font-bold text-zinc-900 tabular-nums">
                    {selectedCustomer.LoyaltyPoints} điểm
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Lịch sử Đơn thuốc Đã Mua ({selectedCustomer.invoices?.length || 0})
                </h3>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {!selectedCustomer.invoices || selectedCustomer.invoices.length === 0 ? (
                    <div className="text-xs text-zinc-400 py-4 text-center border border-dashed border-zinc-200 rounded-md">
                      Chưa phát sinh đơn thuốc lưu trong hồ sơ này.
                    </div>
                  ) : (
                    selectedCustomer.invoices.map((inv) => (
                      <div
                        key={inv.InvoiceID}
                        className="rounded border border-zinc-200 p-2.5 text-xs flex items-center justify-between"
                      >
                        <div>
                          <div className="font-mono font-semibold text-zinc-900">
                            {inv.InvoiceCode}
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            {new Date(inv.CreateDate).toLocaleDateString('vi-VN')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-zinc-900 tabular-nums">
                            {formatVND(inv.TotalAmount)}
                          </div>
                          <span className="text-[10px] text-emerald-700 font-medium">
                            {inv.Status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Thêm / Sửa Hồ sơ Bệnh nhân */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <form
            onSubmit={handleSaveCustomer}
            className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">
                {editingCustomer ? 'Cập nhật Hồ sơ Bệnh nhân' : 'Mở Hồ sơ Bệnh nhân Mới'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Họ và tên bệnh nhân *</label>
                <input
                  type="text"
                  required
                  value={formData.FullName}
                  onChange={(e) => setFormData({ ...formData, FullName: e.target.value })}
                  className="w-full h-8 rounded border border-zinc-300 px-2.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    value={formData.Phone}
                    onChange={(e) => setFormData({ ...formData, Phone: e.target.value })}
                    className="w-full h-8 rounded border border-zinc-300 px-2.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Năm sinh</label>
                  <input
                    type="number"
                    value={formData.BirthYear}
                    onChange={(e) =>
                      setFormData({ ...formData, BirthYear: Number(e.target.value) })
                    }
                    className="w-full h-8 rounded border border-zinc-300 px-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-rose-700 mb-1">
                  Tiền sử Dị ứng Thuốc (ngăn cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  value={formData.Allergies}
                  onChange={(e) => setFormData({ ...formData, Allergies: e.target.value })}
                  placeholder="VD: Penicillin, Amoxicillin, Ibuprofen..."
                  className="w-full h-8 rounded border border-rose-300 bg-rose-50/30 px-2.5"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Bệnh lý nền mãn tính
                </label>
                <input
                  type="text"
                  value={formData.ChronicCond}
                  onChange={(e) => setFormData({ ...formData, ChronicCond: e.target.value })}
                  placeholder="VD: Viêm dạ dày, Tăng huyết áp, Đái tháo đường..."
                  className="w-full h-8 rounded border border-zinc-300 px-2.5"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3 bg-zinc-50">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-8 rounded border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="h-8 rounded bg-zinc-900 px-4 text-xs font-medium text-white"
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
