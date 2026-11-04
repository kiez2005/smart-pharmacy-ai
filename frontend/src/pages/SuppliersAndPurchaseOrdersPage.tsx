import React, { useEffect, useState } from 'react';
import {
  Truck,
  Plus,
  Building2,
  FilePlus2,
  Trash2,
  CheckCircle2,
  Phone,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { enterpriseApi } from '../services/enterprise.api';
import { productApi } from '../services/product.api';
import { PurchaseOrderRecord, SupplierRecord } from '../types/enterprise';
import { Product } from '../types/product';

export const SuppliersAndPurchaseOrdersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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

  // Modal Thêm Nhà Cung Cấp
  const [showSupplierModal, setShowSupplierModal] = useState<boolean>(false);
  const [newSupplier, setNewSupplier] = useState({
    SupplierName: '',
    ContactPerson: '',
    Phone: '',
    Email: '',
    TaxCode: '',
    Address: '',
  });

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

  const handleRemovePoLine = (idx: number) => {
    setPoItems((prev) => prev.filter((_, i) => i !== idx));
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

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.SupplierName.trim() || !newSupplier.Phone.trim()) return;
    try {
      const created = await enterpriseApi.createSupplier(newSupplier);
      toast.success(`Đã thêm nhà phân phối "${created.SupplierName}"`);
      setShowSupplierModal(false);
      setNewSupplier({
        SupplierName: '',
        ContactPerson: '',
        Phone: '',
        Email: '',
        TaxCode: '',
        Address: '',
      });
      await loadAll();
    } catch {
      toast.error('Không thể thêm nhà cung cấp');
    }
  };

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  const totalDraftCost = poItems.reduce((sum, i) => sum + i.Quantity * i.ImportPrice, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            Quản lý Nhà Cung Cấp & Lập Phiếu Nhập Kho (Purchase Orders)
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Quản lý đối tác phân phối dược phẩm GPP, kiểm soát số lô sản xuất, hạn dùng và tự động cộng tồn kho khi nhập hàng.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSupplierModal(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Thêm Nhà phân phối mới</span>
        </button>
      </div>

      {/* Danh sách Nhà phân phối */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {suppliers.map((sup) => (
          <div
            key={sup.SupplierID}
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-2xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-700">
                  {sup.SupplierCode}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200/60">
                  <CheckCircle2 className="h-3 w-3" />
                  Đạt chuẩn GDP
                </span>
              </div>
              <h3 className="mt-2 text-[13px] font-semibold text-zinc-900 line-clamp-2">
                {sup.SupplierName}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Đại diện: <span className="text-zinc-700 font-medium">{sup.ContactPerson || 'Phòng Kinh doanh'}</span>
              </p>
            </div>
            <div className="mt-3 pt-2.5 border-t border-zinc-100 space-y-1 text-[11px] text-zinc-500">
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-zinc-400" />
                <span>{sup.Phone}</span>
                {sup.TaxCode && <span className="text-zinc-400">· MST: {sup.TaxCode}</span>}
              </div>
              {sup.Address && (
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="h-3 w-3 text-zinc-400 shrink-0" />
                  <span className="truncate">{sup.Address}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Khu vực Lập Phiếu Nhập Kho & Lịch sử Nhập kho */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Lập Phiếu Nhập Kho */}
        <form
          onSubmit={handleCreatePurchaseOrder}
          className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs space-y-4"
        >
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <div className="flex items-center gap-2">
              <FilePlus2 className="h-4 w-4 text-zinc-800" />
              <h2 className="text-sm font-semibold text-zinc-900">
                Lập Phiếu Nhập Kho Dược Phẩm Mới
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
                className="w-full h-9 rounded-md border border-zinc-300 bg-white px-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
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
                className="w-full h-9 rounded-md border border-zinc-300 px-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none"
              />
            </div>
          </div>

          {/* Chi tiết các dòng thuốc nhập */}
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
                    onClick={() => handleRemovePoLine(idx)}
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

                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                  <span>Người lập: {po.CreatedBy || 'DS. Nguyễn Văn Trung'}</span>
                  <span>{new Date(po.CreateDate).toLocaleString('vi-VN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal Thêm Nhà phân phối */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <form
            onSubmit={handleCreateSupplier}
            className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden"
          >
            <div className="border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Thêm Đối tác Phân phối Dược phẩm
              </h3>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-zinc-700 mb-1">
                  Tên công ty dược phẩm *
                </label>
                <input
                  type="text"
                  required
                  value={newSupplier.SupplierName}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, SupplierName: e.target.value })
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
                    value={newSupplier.Phone}
                    onChange={(e) => setNewSupplier({ ...newSupplier, Phone: e.target.value })}
                    placeholder="0283..."
                    className="w-full h-8 rounded border border-zinc-300 px-2.5"
                  />
                </div>
                <div>
                  <label className="block font-medium text-zinc-700 mb-1">Mã số thuế</label>
                  <input
                    type="text"
                    value={newSupplier.TaxCode}
                    onChange={(e) => setNewSupplier({ ...newSupplier, TaxCode: e.target.value })}
                    placeholder="0100..."
                    className="w-full h-8 rounded border border-zinc-300 px-2.5"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Người liên hệ</label>
                <input
                  type="text"
                  value={newSupplier.ContactPerson}
                  onChange={(e) =>
                    setNewSupplier({ ...newSupplier, ContactPerson: e.target.value })
                  }
                  placeholder="Họ tên trình dược viên / quản lý"
                  className="w-full h-8 rounded border border-zinc-300 px-2.5"
                />
              </div>
              <div>
                <label className="block font-medium text-zinc-700 mb-1">Địa chỉ trụ sở / kho</label>
                <input
                  type="text"
                  value={newSupplier.Address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, Address: e.target.value })}
                  placeholder="Số nhà, đường, quận/huyện, tỉnh/thành..."
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
    </div>
  );
};
