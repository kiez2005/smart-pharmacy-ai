import React, { useEffect, useMemo, useState } from 'react';
import {
  Truck,
  Plus,
  Building2,
  FilePlus2,
  Trash2,
  CheckCircle2,
  Eye,
  Pencil,
  Copy,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { enterpriseApi } from '../services/enterprise.api';
import { productApi } from '../services/product.api';
import { PurchaseOrderRecord, SupplierRecord } from '../types/enterprise';
import { Product } from '../types/product';
import {
  ColumnConfig,
  EnterprisePagination,
  EnterpriseToolbar,
} from '../components/common/EnterpriseDataToolbar';

const SUPPLIER_COLUMNS: ColumnConfig[] = [
  { id: 'SupplierCode', label: 'Mã NCC' },
  { id: 'SupplierName', label: 'Tên nhà phân phối' },
  { id: 'ContactPerson', label: 'Đại diện liên hệ' },
  { id: 'Phone', label: 'Số điện thoại' },
  { id: 'TaxCode', label: 'Mã số thuế' },
  { id: 'Address', label: 'Địa chỉ kho / trụ sở' },
  { id: 'Status', label: 'Chứng nhận GDP' },
];

export const SuppliersAndPurchaseOrdersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Tìm kiếm, Phân trang, Chọn Checkbox & Ẩn/hiện cột cho bảng Nhà cung cấp
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});

  // Modal Thêm / Sửa / Xem Chi tiết Nhà Cung Cấp
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<SupplierRecord | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    SupplierCode: '',
    SupplierName: '',
    ContactPerson: '',
    Phone: '',
    Email: '',
    TaxCode: '',
    Address: '',
  });

  // Form Tạo Phiếu Nhập Kho
  const [selectedSupplierId, setSelectedSupplierId] = useState<number>(0);
  const [poNote, setPoNote] = useState<string>('Nhập bổ sung định kỳ chuẩn GPP');
  const [poItems, setPoItems] = useState<
    Array<{
      ProductID: number;
      BatchNumber: string;
      ExpiryDate: string;
      Quantity: number;
      ImportPrice: number;
    }>
  >([]);
  const [submittingPo, setSubmittingPo] = useState<boolean>(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [supList, poList, prodRes] = await Promise.all([
        enterpriseApi.getSuppliers(),
        enterpriseApi.getPurchaseOrders(),
        productApi.list({ page: 1, limit: 100 }),
      ]);
      setSuppliers(supList);
      setPurchaseOrders(poList);
      setProducts(prodRes.items);
      setSelectedIds([]);
      if (supList.length > 0 && selectedSupplierId === 0) {
        setSelectedSupplierId(supList[0].SupplierID);
      }
      if (prodRes.items.length > 0 && poItems.length === 0) {
        const first = prodRes.items[0];
        setPoItems([
          {
            ProductID: first.ProductID,
            BatchNumber: `LOT-${new Date().getFullYear()}09`,
            ExpiryDate: '2028-12-31',
            Quantity: 50,
            ImportPrice: Math.round(first.Price * 0.75),
          },
        ]);
      }
    } catch {
      toast.error('Không thể tải dữ liệu nhà cung cấp và phiếu nhập kho');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.SupplierName.toLowerCase().includes(q) ||
        s.SupplierCode.toLowerCase().includes(q) ||
        s.Phone.toLowerCase().includes(q) ||
        (s.ContactPerson || '').toLowerCase().includes(q) ||
        (s.Address || '').toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  const totalPages = Math.max(1, Math.ceil(filteredSuppliers.length / pageSize));
  const pagedSuppliers = useMemo(
    () => filteredSuppliers.slice((page - 1) * pageSize, page * pageSize),
    [filteredSuppliers, page, pageSize]
  );

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(pagedSuppliers.map((s) => s.SupplierID));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleRow = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const openCreateModal = () => {
    setEditingSupplier(null);
    setSupplierForm({
      SupplierCode: `NCC-${Math.floor(1000 + Math.random() * 9000)}`,
      SupplierName: '',
      ContactPerson: '',
      Phone: '',
      Email: '',
      TaxCode: '',
      Address: '',
    });
    setShowSupplierModal(true);
  };

  const openEditModal = (sup: SupplierRecord) => {
    setEditingSupplier(sup);
    setSupplierForm({
      SupplierCode: sup.SupplierCode,
      SupplierName: sup.SupplierName,
      ContactPerson: sup.ContactPerson || '',
      Phone: sup.Phone,
      Email: sup.Email || '',
      TaxCode: sup.TaxCode || '',
      Address: sup.Address || '',
    });
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.SupplierName.trim() || !supplierForm.Phone.trim()) return;
    try {
      if (editingSupplier) {
        await enterpriseApi.updateSupplier(editingSupplier.SupplierID, supplierForm);
        toast.success(`Đã cập nhật nhà phân phối "${supplierForm.SupplierName}"`);
      } else {
        await enterpriseApi.createSupplier(supplierForm);
        toast.success(`Đã thêm nhà phân phối "${supplierForm.SupplierName}"`);
      }
      setShowSupplierModal(false);
      await loadAll();
    } catch {
      toast.error('Không thể lưu thông tin nhà cung cấp');
    }
  };

  const handleDeleteOne = async (sup: SupplierRecord) => {
    if (!window.confirm(`Xác nhận xóa nhà cung cấp "${sup.SupplierName}"?`)) return;
    try {
      await enterpriseApi.deleteRecord('suppliers', sup.SupplierID);
      toast.success(`Đã xóa nhà cung cấp ${sup.SupplierCode}`);
      await loadAll();
    } catch {
      toast.error('Nhà cung cấp đã có phiếu nhập kho liên kết, không thể xóa');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 dòng trong bảng');
      return;
    }
    if (!window.confirm(`Xác nhận xóa ${selectedIds.length} nhà cung cấp đã chọn?`)) return;
    try {
      const count = await enterpriseApi.bulkDelete('suppliers', selectedIds);
      toast.success(`Đã xóa ${count} nhà cung cấp`);
      await loadAll();
    } catch {
      toast.error('Một số nhà cung cấp đã có phiếu nhập kho liên kết');
    }
  };

  const handleCloneOne = async (sup: SupplierRecord) => {
    try {
      await enterpriseApi.cloneRecord('suppliers', sup.SupplierID);
      toast.success(`Đã nhân bản nhà phân phối "${sup.SupplierName}"`);
      await loadAll();
    } catch {
      toast.error('Không thể nhân bản nhà cung cấp');
    }
  };

  const handleBulkClone = async () => {
    if (selectedIds.length === 0) {
      toast.info('Vui lòng chọn ít nhất 1 dòng để nhân bản');
      return;
    }
    try {
      const count = await enterpriseApi.bulkClone('suppliers', selectedIds);
      toast.success(`Đã nhân bản ${count} nhà cung cấp`);
      await loadAll();
    } catch {
      toast.error('Lỗi khi nhân bản hàng loạt');
    }
  };

  const handleAddPoLine = () => {
    if (products.length === 0) return;
    const target = products[poItems.length % products.length];
    setPoItems((prev) => [
      ...prev,
      {
        ProductID: target.ProductID,
        BatchNumber: `LOT-${Math.floor(1000 + Math.random() * 9000)}`,
        ExpiryDate: '2028-06-30',
        Quantity: 30,
        ImportPrice: Math.round(target.Price * 0.75),
      },
    ]);
  };

  const handleCreatePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || poItems.length === 0) {
      toast.error('Vui lòng chọn nhà cung cấp và ít nhất 1 mặt hàng nhập kho');
      return;
    }
    setSubmittingPo(true);
    try {
      const created = await enterpriseApi.createPurchaseOrder({
        SupplierID: selectedSupplierId,
        Note: poNote,
        CreatedBy: 'DS. Nguyễn Văn Trung',
        items: poItems,
      });
      toast.success(
        `Đã lập phiếu nhập kho ${created.POCode} và tự động cộng tồn kho cho ${created.items.length} mặt hàng!`
      );
      await loadAll();
    } catch {
      toast.error('Không thể tạo phiếu nhập kho');
    } finally {
      setSubmittingPo(false);
    }
  };

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  const totalDraftCost = poItems.reduce((sum, i) => sum + i.Quantity * i.ImportPrice, 0);

  return (
    <div className="space-y-6">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="suppliers"
        title="Quản lý Nhà Cung Cấp & Lập Phiếu Nhập Kho (Purchase Orders)"
        subtitle="Quản lý đối tác phân phối dược phẩm chuẩn GDP (11 chức năng CRUD, Nhân bản, Import/Export, Ẩn/Hiện cột) và nhập hàng cộng tồn kho."
        createLabel="Thêm Nhà phân phối (Alt+N)"
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Tìm theo mã NCC, tên công ty dược, người liên hệ hoặc SĐT... (Alt + F)"
        columns={SUPPLIER_COLUMNS}
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
            const found = suppliers.find((s) => s.SupplierID === selectedIds[0]);
            if (found) openEditModal(found);
          }
        }}
        onViewSelected={() => {
          if (selectedIds.length === 1) {
            const found = suppliers.find((s) => s.SupplierID === selectedIds[0]);
            if (found) setViewingSupplier(found);
          }
        }}
        onCloneSelected={() => {
          if (selectedIds.length === 1) {
            const found = suppliers.find((s) => s.SupplierID === selectedIds[0]);
            if (found) void handleCloneOne(found);
          }
        }}
        onReload={loadAll}
      />

      {/* Bảng dữ liệu Nhà cung cấp chuẩn 11 chức năng */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/80 text-[11px] font-medium text-zinc-500">
                <th className="py-2.5 px-3.5 w-9">
                  <input
                    type="checkbox"
                    checked={
                      pagedSuppliers.length > 0 &&
                      pagedSuppliers.every((s) => selectedIds.includes(s.SupplierID))
                    }
                    onChange={(e) => handleToggleSelectAll(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                  />
                </th>
                {visibleColumns.SupplierCode !== false && <th className="py-2.5 px-3.5">Mã NCC</th>}
                {visibleColumns.SupplierName !== false && (
                  <th className="py-2.5 px-3.5">Tên nhà phân phối dược phẩm</th>
                )}
                {visibleColumns.ContactPerson !== false && (
                  <th className="py-2.5 px-3.5">Đại diện liên hệ</th>
                )}
                {visibleColumns.Phone !== false && <th className="py-2.5 px-3.5">Điện thoại</th>}
                {visibleColumns.TaxCode !== false && <th className="py-2.5 px-3.5">Mã số thuế</th>}
                {visibleColumns.Address !== false && (
                  <th className="py-2.5 px-3.5">Địa chỉ trụ sở / kho</th>
                )}
                {visibleColumns.Status !== false && <th className="py-2.5 px-3.5">Tiêu chuẩn</th>}
                <th className="py-2.5 px-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/60 text-xs">
              {pagedSuppliers.map((sup) => (
                <tr key={sup.SupplierID} className="hover:bg-zinc-50/80">
                  <td className="py-2.5 px-3.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(sup.SupplierID)}
                      onChange={() => handleToggleRow(sup.SupplierID)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                    />
                  </td>
                  {visibleColumns.SupplierCode !== false && (
                    <td className="py-2.5 px-3.5 font-mono font-semibold text-zinc-700">
                      {sup.SupplierCode}
                    </td>
                  )}
                  {visibleColumns.SupplierName !== false && (
                    <td className="py-2.5 px-3.5 font-semibold text-zinc-900">
                      <button
                        type="button"
                        onClick={() => setViewingSupplier(sup)}
                        className="hover:text-teal-700 text-left"
                      >
                        {sup.SupplierName}
                      </button>
                    </td>
                  )}
                  {visibleColumns.ContactPerson !== false && (
                    <td className="py-2.5 px-3.5 text-zinc-600">
                      {sup.ContactPerson || 'Phòng Kinh doanh'}
                    </td>
                  )}
                  {visibleColumns.Phone !== false && (
                    <td className="py-2.5 px-3.5 font-mono text-zinc-700">{sup.Phone}</td>
                  )}
                  {visibleColumns.TaxCode !== false && (
                    <td className="py-2.5 px-3.5 font-mono text-zinc-500">
                      {sup.TaxCode || '---'}
                    </td>
                  )}
                  {visibleColumns.Address !== false && (
                    <td className="py-2.5 px-3.5 text-zinc-600 max-w-[220px] truncate">
                      {sup.Address}
                    </td>
                  )}
                  {visibleColumns.Status !== false && (
                    <td className="py-2.5 px-3.5">
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200/60">
                        <CheckCircle2 className="h-3 w-3" />
                        Đạt GDP
                      </span>
                    </td>
                  )}
                  <td className="py-2.5 px-3.5 text-right">
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => setViewingSupplier(sup)}
                        title="Xem chi tiết (Alt+V)"
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(sup)}
                        title="Chỉnh sửa (Alt+E)"
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCloneOne(sup)}
                        title="Nhân bản (Alt+C)"
                        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteOne(sup)}
                        title="Xóa (Alt+H)"
                        className="rounded p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <EnterprisePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={filteredSuppliers.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      {/* Khu vực Lập Phiếu Nhập Kho & Lịch sử Nhập kho */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleCreatePurchaseOrder}
          className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <FilePlus2 className="h-4 w-4 text-zinc-800" />
              <h2 className="text-sm font-semibold text-zinc-900">
                Lập Phiếu Nhập Kho Dược Phẩm Mới (Tự Động Cộng Tồn Kho)
              </h2>
            </div>
            <button
              type="button"
              onClick={handleAddPoLine}
              className="inline-flex h-7 items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Thêm dòng thuốc</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Nhà phân phối cung ứng
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900"
              >
                {suppliers.map((s) => (
                  <option key={s.SupplierID} value={s.SupplierID}>
                    [{s.SupplierCode}] {s.SupplierName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Ghi chú chứng từ / Số hóa đơn VAT
              </label>
              <input
                type="text"
                value={poNote}
                onChange={(e) => setPoNote(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-xs text-zinc-900"
              />
            </div>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {poItems.map((item, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-end rounded-md border border-zinc-200/80 bg-zinc-50/50 p-2.5"
              >
                <div className="col-span-12 sm:col-span-4">
                  <label className="block text-[11px] text-zinc-500 mb-1">Dược phẩm</label>
                  <select
                    value={item.ProductID}
                    onChange={(e) => {
                      const pid = Number(e.target.value);
                      const prod = products.find((p) => p.ProductID === pid);
                      setPoItems((prev) =>
                        prev.map((row, i) =>
                          i === idx
                            ? {
                                ...row,
                                ProductID: pid,
                                ImportPrice: prod ? Math.round(prod.Price * 0.75) : row.ImportPrice,
                              }
                            : row
                        )
                      );
                    }}
                    className="w-full h-8 rounded border border-zinc-300 bg-white px-2 text-xs text-zinc-900"
                  >
                    {products.map((p) => (
                      <option key={p.ProductID} value={p.ProductID}>
                        #{p.ProductID} - {p.ProductName} (Tồn: {p.Quantity})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-6 sm:col-span-2">
                  <label className="block text-[11px] text-zinc-500 mb-1">Số lô SX</label>
                  <input
                    type="text"
                    value={item.BatchNumber}
                    onChange={(e) =>
                      setPoItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, BatchNumber: e.target.value } : row
                        )
                      )
                    }
                    className="w-full h-8 rounded border border-zinc-300 bg-white px-2 font-mono text-xs text-zinc-900"
                  />
                </div>

                <div className="col-span-6 sm:col-span-2">
                  <label className="block text-[11px] text-zinc-500 mb-1">Hạn dùng</label>
                  <input
                    type="date"
                    value={item.ExpiryDate}
                    onChange={(e) =>
                      setPoItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, ExpiryDate: e.target.value } : row
                        )
                      )
                    }
                    className="w-full h-8 rounded border border-zinc-300 bg-white px-1.5 text-xs text-zinc-900"
                  />
                </div>

                <div className="col-span-5 sm:col-span-1">
                  <label className="block text-[11px] text-zinc-500 mb-1">SL</label>
                  <input
                    type="number"
                    min={1}
                    value={item.Quantity}
                    onChange={(e) =>
                      setPoItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, Quantity: Number(e.target.value) } : row
                        )
                      )
                    }
                    className="w-full h-8 rounded border border-zinc-300 bg-white px-2 text-xs text-zinc-900 tabular-nums"
                  />
                </div>

                <div className="col-span-5 sm:col-span-2">
                  <label className="block text-[11px] text-zinc-500 mb-1">Giá vốn (VNĐ)</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={item.ImportPrice}
                    onChange={(e) =>
                      setPoItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, ImportPrice: Number(e.target.value) } : row
                        )
                      )
                    }
                    className="w-full h-8 rounded border border-zinc-300 bg-white px-2 text-xs text-zinc-900 tabular-nums"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPoItems((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={poItems.length <= 1}
                    className="h-8 w-8 inline-flex items-center justify-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
            <div>
              <span className="text-xs text-zinc-500">Tổng giá trị phiếu nhập: </span>
              <span className="text-base font-semibold text-zinc-900 tabular-nums">
                {formatVND(totalDraftCost)}
              </span>
            </div>
            <button
              type="submit"
              disabled={submittingPo || loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              <Truck className="h-3.5 w-3.5" />
              <span>{submittingPo ? 'Đang xử lý...' : 'Hoàn tất Nhập Kho & Cộng Tồn'}</span>
            </button>
          </div>
        </form>

        {/* Lịch sử Phiếu Nhập Kho */}
        <div className="lg:col-span-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-zinc-800" />
              <h2 className="text-sm font-semibold text-zinc-900">
                Chứng từ Nhập Kho Gần Đây ({purchaseOrders.length})
              </h2>
            </div>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {purchaseOrders.map((po) => (
              <div
                key={po.POID}
                className="rounded-lg border border-zinc-200/80 p-3.5 hover:bg-zinc-50/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-zinc-900">
                      {po.POCode}
                    </span>
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200/60">
                      Đã nhập kho
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-zinc-900 tabular-nums">
                    {formatVND(po.TotalCost)}
                  </span>
                </div>

                <div className="text-xs font-medium text-zinc-800">
                  {po.supplier?.SupplierName}
                </div>

                <div className="space-y-1 pt-1 border-t border-zinc-100">
                  {po.items.map((item) => (
                    <div
                      key={item.POItemID}
                      className="flex items-center justify-between text-[11px] text-zinc-600"
                    >
                      <span className="truncate max-w-[200px]">
                        • {item.product?.ProductName} (Lô: {item.BatchNumber})
                      </span>
                      <span className="font-mono font-medium text-emerald-700 tabular-nums">
                        +{item.Quantity} {item.product?.Unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Thêm / Sửa Nhà phân phối */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <form
            onSubmit={handleSaveSupplier}
            className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">
                {editingSupplier
                  ? 'Cập nhật Đối tác Phân phối'
                  : 'Thêm Đối tác Phân phối Dược phẩm'}
              </h3>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Tên công ty dược phẩm *
                </label>
                <input
                  type="text"
                  required
                  value={supplierForm.SupplierName}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, SupplierName: e.target.value })
                  }
                  placeholder="VD: Công ty CP Dược phẩm Imexpharm"
                  className="w-full h-8 rounded border border-zinc-300 px-2.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    value={supplierForm.Phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, Phone: e.target.value })}
                    className="w-full h-8 rounded border border-zinc-300 px-2.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Mã số thuế</label>
                  <input
                    type="text"
                    value={supplierForm.TaxCode}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, TaxCode: e.target.value })
                    }
                    className="w-full h-8 rounded border border-zinc-300 px-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Người liên hệ</label>
                <input
                  type="text"
                  value={supplierForm.ContactPerson}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, ContactPerson: e.target.value })
                  }
                  className="w-full h-8 rounded border border-zinc-300 px-2.5"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Địa chỉ trụ sở / kho</label>
                <input
                  type="text"
                  value={supplierForm.Address}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, Address: e.target.value })
                  }
                  className="w-full h-8 rounded border border-zinc-300 px-2.5"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3 bg-zinc-50">
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="h-8 rounded border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="h-8 rounded bg-zinc-900 px-3 text-xs font-medium text-white"
              >
                Lưu Nhà cung cấp
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Xem Chi Tiết Nhà phân phối (Alt+V) */}
      {viewingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Hồ sơ Nhà phân phối ({viewingSupplier.SupplierCode})
              </h3>
              <button
                type="button"
                onClick={() => setViewingSupplier(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-2.5 text-xs">
              <div>
                <span className="text-zinc-500">Tên doanh nghiệp: </span>
                <strong className="text-zinc-900">{viewingSupplier.SupplierName}</strong>
              </div>
              <div>
                <span className="text-zinc-500">Đại diện liên hệ: </span>
                <span className="text-zinc-800">{viewingSupplier.ContactPerson}</span>
              </div>
              <div>
                <span className="text-zinc-500">Số điện thoại: </span>
                <span className="font-mono text-zinc-800">{viewingSupplier.Phone}</span>
              </div>
              <div>
                <span className="text-zinc-500">Mã số thuế: </span>
                <span className="font-mono text-zinc-800">{viewingSupplier.TaxCode || '---'}</span>
              </div>
              <div>
                <span className="text-zinc-500">Địa chỉ kho: </span>
                <span className="text-zinc-800">{viewingSupplier.Address}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3 bg-zinc-50">
              <button
                type="button"
                onClick={() => {
                  const s = viewingSupplier;
                  setViewingSupplier(null);
                  openEditModal(s);
                }}
                className="h-8 rounded bg-zinc-900 px-3 text-xs font-medium text-white"
              >
                Chỉnh sửa (Alt+E)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
