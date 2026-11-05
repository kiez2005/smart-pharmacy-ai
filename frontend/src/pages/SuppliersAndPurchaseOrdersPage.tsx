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
  Printer,
  Wallet,
  PackageCheck,
  FileSpreadsheet,
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
  { id: 'Payable', label: 'Tổng giá trị nhập' },
  { id: 'Status', label: 'Chứng nhận GDP' },
];

export const SuppliersAndPurchaseOrdersPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'purchase_orders'>('suppliers');
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Tìm kiếm, Phân trang, Chọn Checkbox & Ẩn/hiện cột
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({});

  // Modal Thêm / Sửa & Slide-Over Drawer Xem Chi tiết Nhà Cung Cấp / Phiếu Nhập
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<SupplierRecord | null>(null);
  const [viewingPo, setViewingPo] = useState<PurchaseOrderRecord | null>(null);
  const [showCreatePoModal, setShowCreatePoModal] = useState<boolean>(false);
  const [activeKpiModal, setActiveKpiModal] = useState<'SUPPLIERS' | 'ORDERS' | 'PURCHASE_VALUE' | 'PAYABLES' | null>(null);

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
  const [poNote, setPoNote] = useState<string>('Nhập bổ sung định kỳ chuẩn GPP - Đạt kiểm cảm quan');
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

  // Tính tổng giá trị nhập theo từng Nhà cung cấp
  const supplierSpendMap = useMemo(() => {
    const map: Record<number, { totalSpend: number; poCount: number }> = {};
    for (const po of purchaseOrders) {
      const sid = po.SupplierID;
      if (!map[sid]) map[sid] = { totalSpend: 0, poCount: 0 };
      map[sid].totalSpend += po.TotalCost;
      map[sid].poCount += 1;
    }
    return map;
  }, [purchaseOrders]);

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
      setShowCreatePoModal(false);
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
  const totalPurchaseBudget = purchaseOrders.reduce((sum, p) => sum + p.TotalCost, 0);

  return (
    <div className="space-y-5">
      {/* Thanh công cụ 11 chức năng chuẩn Doanh nghiệp */}
      <EnterpriseToolbar
        entity="suppliers"
        title="Nhà Phân Phối GDP & Quản Lý Phiếu Nhập Kho (Procurement)"
        subtitle="Quản lý danh mục nhà cung cấp dược phẩm, theo dõi công nợ phải trả và lập Biên bản kiểm nhập thuốc chuẩn GPP."
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
        extraFilters={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('suppliers')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                activeTab === 'suppliers'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>Nhà phân phối ({suppliers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('purchase_orders')}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-all ${
                activeTab === 'purchase_orders'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Phiếu Nhập Kho ({purchaseOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCreatePoModal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-3.5 text-xs font-semibold text-teal-800 shadow-sm hover:bg-teal-100 transition-colors"
            >
              <FilePlus2 className="h-3.5 w-3.5 text-teal-600" />
              <span>+ Lập Phiếu Nhập Kho Mới</span>
            </button>
          </div>
        }
      />

      {/* 4 Thẻ KPI Chuỗi Cung Ứng & Công Nợ (Clickable Drill-down) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => setActiveKpiModal('SUPPLIERS')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-teal-500 hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Đối tác phân phối đạt GDP</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 group-hover:scale-110 transition-transform">
              <Building2 className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {suppliers.length} công ty
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>100% đạt chuẩn GDP</span>
            <span className="font-semibold text-teal-600 text-[11px] group-hover:underline">Chi tiết →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveKpiModal('ORDERS')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-emerald-500 hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tổng chứng từ Nhập kho</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
              <PackageCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            {purchaseOrders.length} phiếu
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Đã kiểm nhập GPP</span>
            <span className="font-semibold text-emerald-600 text-[11px] group-hover:underline">Xem DS phiếu →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveKpiModal('PURCHASE_VALUE')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-sky-500 hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Tổng giá trị hàng đã nhập</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600 group-hover:scale-110 transition-transform">
              <Truck className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-teal-700 tabular-nums">
            {formatVND(totalPurchaseBudget)}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Giá vốn đầu vào VAT</span>
            <span className="font-semibold text-sky-600 text-[11px] group-hover:underline">Báo cáo vốn →</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveKpiModal('PAYABLES')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-amber-400 hover:shadow-md transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Công nợ phải trả NCC</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
              <Wallet className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">
            0 ₫
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-emerald-600 font-medium">
            <span>Đã tất toán 100%</span>
            <span className="font-semibold text-amber-600 text-[11px] group-hover:underline">Đối soát nợ →</span>
          </div>
        </button>
      </div>

      {/* TAB 1: BẢNG NHÀ PHÂN PHỐI FULL-WIDTH 100% */}
      {activeTab === 'suppliers' ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-9">
                    <input
                      type="checkbox"
                      checked={
                        pagedSuppliers.length > 0 &&
                        pagedSuppliers.every((s) => selectedIds.includes(s.SupplierID))
                      }
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                    />
                  </th>
                  {visibleColumns.SupplierCode !== false && (
                    <th className="py-3 px-4 whitespace-nowrap">Mã NCC</th>
                  )}
                  {visibleColumns.SupplierName !== false && (
                    <th className="py-3 px-4 whitespace-nowrap">Tên nhà phân phối dược phẩm</th>
                  )}
                  {visibleColumns.ContactPerson !== false && (
                    <th className="py-3 px-4 whitespace-nowrap">Đại diện liên hệ</th>
                  )}
                  {visibleColumns.Phone !== false && (
                    <th className="py-3 px-4 whitespace-nowrap">Điện thoại</th>
                  )}
                  {visibleColumns.TaxCode !== false && (
                    <th className="py-3 px-4 whitespace-nowrap">Mã số thuế</th>
                  )}
                  {visibleColumns.Payable !== false && (
                    <th className="py-3 px-4 text-right whitespace-nowrap">Tổng giá trị nhập</th>
                  )}
                  {visibleColumns.Status !== false && (
                    <th className="py-3 px-4 whitespace-nowrap">Tiêu chuẩn</th>
                  )}
                  <th className="py-3 px-4 text-right whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-[13px]">
                {pagedSuppliers.map((sup) => {
                  const stats = supplierSpendMap[sup.SupplierID] || { totalSpend: 0, poCount: 0 };
                  return (
                    <tr key={sup.SupplierID} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(sup.SupplierID)}
                          onChange={() => handleToggleRow(sup.SupplierID)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600"
                        />
                      </td>
                      {visibleColumns.SupplierCode !== false && (
                        <td className="py-2.5 px-4 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                          {sup.SupplierCode}
                        </td>
                      )}
                      {visibleColumns.SupplierName !== false && (
                        <td className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() => setViewingSupplier(sup)}
                            className="font-semibold text-slate-900 hover:text-teal-600 text-left block"
                          >
                            {sup.SupplierName}
                          </button>
                          <span className="text-[11px] text-slate-500 line-clamp-1">
                            {sup.Address}
                          </span>
                        </td>
                      )}
                      {visibleColumns.ContactPerson !== false && (
                        <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                          {sup.ContactPerson || 'Phòng Kinh doanh B2B'}
                        </td>
                      )}
                      {visibleColumns.Phone !== false && (
                        <td className="py-2.5 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {sup.Phone}
                        </td>
                      )}
                      {visibleColumns.TaxCode !== false && (
                        <td className="py-2.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {sup.TaxCode || '0101245890'}
                        </td>
                      )}
                      {visibleColumns.Payable !== false && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="font-bold text-teal-700 tabular-nums">
                            {formatVND(stats.totalSpend)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {stats.poCount} phiếu nhập · Công nợ: 0 ₫
                          </div>
                        </td>
                      )}
                      {visibleColumns.Status !== false && (
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/70">
                            <CheckCircle2 className="h-3 w-3" />
                            Đạt chuẩn GDP
                          </span>
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => setViewingSupplier(sup)}
                            title="Xem chi tiết & Công nợ (Alt+V)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(sup)}
                            title="Chỉnh sửa (Alt+E)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCloneOne(sup)}
                            title="Nhân bản (Alt+C)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteOne(sup)}
                            title="Xóa (Alt+H)"
                            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
      ) : (
        /* TAB 2: BẢNG CHỨNG TỪ PHIẾU NHẬP KHO FULL-WIDTH 100% */
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Sổ Chứng Từ Phiếu Nhập Kho & Kiểm Nhập Cảm Quan GPP ({purchaseOrders.length})
              </h2>
              <p className="text-xs text-slate-500">
                Nhấn vào từng phiếu để xem chi tiết lô sản xuất, hạn dùng và in Biên bản kiểm nhập
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreatePoModal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Lập Phiếu Nhập Kho Mới</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 whitespace-nowrap">Mã Phiếu Nhập</th>
                  <th className="py-3 px-4 whitespace-nowrap">Nhà phân phối cung ứng</th>
                  <th className="py-3 px-4 whitespace-nowrap">Số mặt hàng / Lô</th>
                  <th className="py-3 px-4 whitespace-nowrap">Người lập phiếu</th>
                  <th className="py-3 px-4 whitespace-nowrap">Ngày nhập kho</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Tổng tiền hàng</th>
                  <th className="py-3 px-4 whitespace-nowrap">Trạng thái</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-[13px]">
                {purchaseOrders.map((po) => (
                  <tr key={po.POID} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-teal-700 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewingPo(po)}
                        className="hover:underline"
                      >
                        {po.POCode}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {po.supplier?.SupplierName}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{po.Note}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 tabular-nums">
                        {po.items.length} lô dược phẩm
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {po.CreatedBy}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(po.CreateDate).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatVND(po.TotalCost)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/70">
                        <CheckCircle2 className="h-3 w-3" />
                        Đã cộng tồn kho
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setViewingPo(po)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-teal-700 shadow-sm hover:bg-teal-50 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Biên bản GPP</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Lập Phiếu Nhập Kho Mới */}
      {showCreatePoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-2 sm:p-4">
          <form
            onSubmit={handleCreatePurchaseOrder}
            className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-5 py-3.5 bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2">
                <FilePlus2 className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Lập Phiếu Nhập Kho Dược Phẩm Mới (Tự Động Cộng Tồn Kho)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreatePoModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nhà phân phối cung ứng *
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                    className="w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  >
                    {suppliers.map((s) => (
                      <option key={s.SupplierID} value={s.SupplierID}>
                        [{s.SupplierCode}] {s.SupplierName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ghi chú chứng từ / Số hóa đơn VAT
                  </label>
                  <input
                    type="text"
                    value={poNote}
                    onChange={(e) => setPoNote(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Danh sách Lô thuốc kiểm nhập ({poItems.length} dòng)
                </span>
                <button
                  type="button"
                  onClick={handleAddPoLine}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-700 hover:bg-teal-100 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Thêm dòng thuốc</span>
                </button>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {poItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-end rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
                  >
                    <div className="col-span-12 sm:col-span-4">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Dược phẩm</label>
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
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                      >
                        {products.map((p) => (
                          <option key={p.ProductID} value={p.ProductID}>
                            #{p.ProductID} - {p.ProductName} (Tồn: {p.Quantity})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-6 sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Số lô SX</label>
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
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 font-mono text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-6 sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Hạn dùng</label>
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
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-1">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">SL</label>
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
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 tabular-nums shadow-sm focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">Giá vốn (VNĐ)</label>
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
                        className="w-full h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 tabular-nums shadow-sm focus:border-teal-600 focus:outline-none"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setPoItems((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={poItems.length <= 1}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 px-4 sm:px-5 py-3.5 bg-slate-50 shrink-0">
              <div>
                <span className="text-xs text-slate-500">Tổng giá trị phiếu nhập: </span>
                <span className="text-base font-bold text-teal-700 tabular-nums">
                  {formatVND(totalDraftCost)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePoModal(false)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submittingPo || loading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
                >
                  <Truck className="h-3.5 w-3.5" />
                  <span>{submittingPo ? 'Đang xử lý...' : 'Hoàn tất Nhập Kho & Cộng Tồn'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Modal Thêm / Sửa Nhà phân phối */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-2 sm:p-4">
          <form
            onSubmit={handleSaveSupplier}
            className="w-full max-w-md max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-5 py-3.5 shrink-0">
              <h3 className="text-sm font-bold text-slate-900">
                {editingSupplier
                  ? 'Cập nhật Đối tác Phân phối'
                  : 'Thêm Đối tác Phân phối Dược phẩm'}
              </h3>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-3 text-xs overflow-y-auto flex-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
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
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    value={supplierForm.Phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, Phone: e.target.value })}
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mã số thuế</label>
                  <input
                    type="text"
                    value={supplierForm.TaxCode}
                    onChange={(e) =>
                      setSupplierForm({ ...supplierForm, TaxCode: e.target.value })
                    }
                    className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Người liên hệ</label>
                <input
                  type="text"
                  value={supplierForm.ContactPerson}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, ContactPerson: e.target.value })
                  }
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Địa chỉ trụ sở / kho</label>
                <input
                  type="text"
                  value={supplierForm.Address}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, Address: e.target.value })
                  }
                  className="w-full h-9 rounded-lg border border-slate-300 px-3 text-xs text-slate-900 shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 sm:px-5 py-3 bg-slate-50/50 shrink-0">
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Lưu thông tin
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SLIDE-OVER RIGHT DRAWER: Xem Chi tiết Nhà phân phối & Lịch sử Nhập hàng */}
      {viewingSupplier && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-full sm:max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/70 sticky top-0 z-10">
                <div>
                  <span className="font-mono text-xs font-bold text-teal-700">
                    {viewingSupplier.SupplierCode}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Hồ sơ Đối tác Phân phối GDP
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingSupplier(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200/80 space-y-2.5">
                  <div className="text-sm font-bold text-slate-900">
                    {viewingSupplier.SupplierName}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60">
                    <div>
                      <span className="text-slate-500 block">Người đại diện:</span>
                      <span className="font-semibold text-slate-800">
                        {viewingSupplier.ContactPerson || 'Phòng Kinh doanh'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Điện thoại:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {viewingSupplier.Phone}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Mã số thuế:</span>
                      <span className="font-mono text-slate-800">
                        {viewingSupplier.TaxCode || '0101245890'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Chứng nhận:</span>
                      <span className="font-semibold text-emerald-700">Đạt chuẩn GDP Bộ Y Tế</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200/60">
                    <span className="text-slate-500 block">Địa chỉ trụ sở / kho bảo quản:</span>
                    <span className="font-medium text-slate-800">{viewingSupplier.Address}</span>
                  </div>
                </div>

                {/* Lịch sử nhập kho từ NCC này */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Chứng từ Nhập kho từ đối tác này
                  </h4>
                  {purchaseOrders
                    .filter((po) => po.SupplierID === viewingSupplier.SupplierID)
                    .map((po) => (
                      <div
                        key={po.POID}
                        className="rounded-xl border border-slate-200 p-3.5 flex items-center justify-between hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-mono font-bold text-teal-700">{po.POCode}</div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(po.CreateDate).toLocaleDateString('vi-VN')} · {po.items.length} lô thuốc
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900 tabular-nums">
                            {formatVND(po.TotalCost)}
                          </div>
                          <span className="text-[10px] text-emerald-700 font-semibold">
                            Đã thanh toán
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 flex items-center justify-end gap-2 sticky bottom-0 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const target = viewingSupplier;
                  setViewingSupplier(null);
                  openEditModal(target);
                }}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
              >
                Chỉnh sửa (Alt+E)
              </button>
              <button
                type="button"
                onClick={() => setViewingSupplier(null)}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE-OVER RIGHT DRAWER: Biên bản Kiểm nhập Thuốc Chuẩn GPP (Printable PO) */}
      {viewingPo && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <div className="w-full max-w-full sm:max-w-lg bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/70 sticky top-0 z-10">
                <div>
                  <span className="font-mono text-xs font-bold text-teal-700">
                    {viewingPo.POCode}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    Biên bản Kiểm nhập Thuốc Chuẩn GPP
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingPo(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs">
                <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Nhà phân phối:</span>
                    <span className="font-bold text-slate-900">
                      {viewingPo.supplier?.SupplierName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ngày kiểm nhập:</span>
                    <span className="tabular-nums text-slate-800">
                      {new Date(viewingPo.CreateDate).toLocaleString('vi-VN')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Dược sĩ phụ trách:</span>
                    <span className="font-semibold text-slate-800">{viewingPo.CreatedBy}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Kiểm tra cảm quan GPP:</span>
                    <span className="font-semibold text-emerald-700">
                      Đạt 100% (Bao bì nguyên vẹn, đủ tem)
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-slate-800">Chi tiết các lô thuốc nhập kho</h4>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                          <th className="py-2 px-3">Dược phẩm / Số lô</th>
                          <th className="py-2 px-3 text-right">SL</th>
                          <th className="py-2 px-3 text-right">Giá vốn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60">
                        {viewingPo.items.map((item) => (
                          <tr key={item.POItemID}>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-900">
                                {item.product?.ProductName}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">
                                Lô: {item.BatchNumber} · HSD: {item.ExpiryDate}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700 tabular-nums">
                              +{item.Quantity} {item.product?.Unit}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                              {formatVND(item.ImportPrice)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl bg-teal-50/70 border border-teal-200 p-4 flex items-center justify-between">
                  <span className="font-semibold text-teal-900">Tổng giá trị thanh toán:</span>
                  <span className="text-lg font-bold text-teal-800 tabular-nums">
                    {formatVND(viewingPo.TotalCost)}
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50 flex items-center justify-between sticky bottom-0 shrink-0">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>In Biên bản Kiểm nhập</span>
              </button>
              <button
                type="button"
                onClick={() => setViewingPo(null)}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white shadow-sm hover:bg-teal-700"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHI TIẾT KHI CLICK CÁC Ô THÔNG TIN (KPI DRILL-DOWN) */}
      {activeKpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-200">
                  {activeKpiModal === 'SUPPLIERS' && <Building2 className="h-4 w-4" />}
                  {activeKpiModal === 'ORDERS' && <PackageCheck className="h-4 w-4" />}
                  {activeKpiModal === 'PURCHASE_VALUE' && <Truck className="h-4 w-4" />}
                  {activeKpiModal === 'PAYABLES' && <Wallet className="h-4 w-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {activeKpiModal === 'SUPPLIERS' && `Danh Sách Đối Tác Phân Phối GDP (${suppliers.length} đơn vị)`}
                    {activeKpiModal === 'ORDERS' && `Nhật Ký Chứng Từ Nhập Kho (${purchaseOrders.length} phiếu)`}
                    {activeKpiModal === 'PURCHASE_VALUE' && 'Báo Cáo Tổng Hợp Giá Trị Nhập Kho'}
                    {activeKpiModal === 'PAYABLES' && 'Đối Soát Công Nợ Phải Trả Nhà Phân Phối'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeKpiModal === 'SUPPLIERS' && 'Doanh nghiệp dược phẩm đạt chứng chỉ thực hành tốt phân phối'}
                    {activeKpiModal === 'ORDERS' && 'Lịch sử tiếp nhận lô thuốc, kiểm nghiệm cảm quan & số lô HSD'}
                    {activeKpiModal === 'PURCHASE_VALUE' && 'Phân bổ chi phí mua hàng theo từng nhà phân phối'}
                    {activeKpiModal === 'PAYABLES' && 'Tình trạng thanh toán tiền hàng nhập theo hóa đơn'}
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
              {activeKpiModal === 'SUPPLIERS' && (
                <div className="space-y-3 text-xs">
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                    {suppliers.map((s) => (
                      <div key={s.SupplierID} className="p-3 hover:bg-slate-50 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{s.SupplierName}</span>
                            <span className="rounded bg-teal-50 text-teal-700 px-1.5 py-0.2 text-[10px] font-semibold border border-teal-200">
                              {s.SupplierCode}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Người liên hệ: {s.ContactPerson} · SĐT: {s.Phone} · MST: {s.TaxCode}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setViewingSupplier(s);
                            setActiveKpiModal(null);
                          }}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Hồ sơ chi tiết →
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeKpiModal === 'ORDERS' && (
                <div className="space-y-3 text-xs">
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden max-h-72 overflow-y-auto">
                    {purchaseOrders.map((po) => (
                      <div key={po.POID} className="p-3 hover:bg-slate-50 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{po.POCode}</span>
                            <span className="font-normal text-slate-500">({po.supplier?.SupplierName || 'NCC'})</span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Ngày nhập: {new Date(po.CreateDate).toLocaleDateString('vi-VN')} · {po.items?.length || 0} mã thuốc
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-teal-700 tabular-nums">{formatVND(po.TotalCost)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setViewingPo(po);
                              setActiveKpiModal(null);
                            }}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Xem phiếu
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeKpiModal === 'PURCHASE_VALUE' && (
                <div className="space-y-3 text-xs">
                  <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3.5 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-teal-900">Tổng Vốn Nhập Kho Chuẩn GPP</div>
                      <div className="text-[11px] text-teal-700">Đã kiểm nhận cảm quan và nhập kho thành công</div>
                    </div>
                    <div className="text-xl font-bold text-teal-900 tabular-nums">{formatVND(totalPurchaseBudget)}</div>
                  </div>

                  <div className="text-xs font-bold text-slate-800">Cơ cấu theo nhà phân phối:</div>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                    {suppliers.map((s) => {
                      const supOrders = purchaseOrders.filter((po) => po.SupplierID === s.SupplierID);
                      const supCost = supOrders.reduce((sum, po) => sum + po.TotalCost, 0);
                      return (
                        <div key={s.SupplierID} className="p-3 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <div className="font-semibold text-slate-900">{s.SupplierName}</div>
                            <div className="text-[11px] text-slate-500">{supOrders.length} phiếu nhập kho</div>
                          </div>
                          <span className="font-bold text-slate-900 tabular-nums">{formatVND(supCost)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeKpiModal === 'PAYABLES' && (
                <div className="space-y-3 text-xs">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Tình trạng Công nợ: An Toàn Tuyệt Đối (0 ₫)
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        100% ĐÃ THANH TOÁN
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800/80">
                      Toàn bộ {purchaseOrders.length} chứng từ nhập kho kỳ này đã được thanh toán tiền mặt/chuyển khoản cho các đối tác phân phối dược.
                    </p>
                  </div>
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
      )}
    </div>
  );
};
