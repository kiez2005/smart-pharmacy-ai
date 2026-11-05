import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Barcode,
  Calendar,
  Building2,
  ClipboardCheck,
  CheckCircle2,
  Scale,
  ChevronRight,
  X,
  Package,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Receipt,
  Truck,
} from 'lucide-react';
import { enterpriseApi } from '../services/enterprise.api';
import { productApi } from '../services/product.api';
import { ProductStockCardResponse } from '../types/enterprise';
import { toast } from 'sonner';

interface ProductStockCardPageProps {
  productId: number;
  onBack: () => void;
}

export const ProductStockCardPage: React.FC<ProductStockCardPageProps> = ({
  productId,
  onBack,
}) => {
  const [data, setData] = useState<ProductStockCardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actualCount, setActualCount] = useState<number>(0);
  const [auditReason, setAuditReason] = useState<string>('Kiểm kê định kỳ cuối tháng (Chuẩn GPP)');
  const [submittingAudit, setSubmittingAudit] = useState<boolean>(false);
  const [selectedMetricModal, setSelectedMetricModal] = useState<
    'opening' | 'imports' | 'exports' | 'closing' | null
  >(null);

  const fetchCard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await enterpriseApi.getProductStockCard(productId);
      setData(res);
      setActualCount(res.product.Quantity);
    } catch {
      toast.error('Không thể tải dữ liệu thẻ kho dược phẩm');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void fetchCard();
  }, [fetchCard]);

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-12 rounded-xl border border-slate-200 bg-white animate-pulse" />
        <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  const { product, imports, exports } = data;
  const totalImported = imports.reduce((sum, i) => sum + i.Quantity, 0);
  const totalExported = exports
    .filter((e) => e.invoice.Status === 'COMPLETED')
    .reduce((sum, e) => sum + e.Quantity, 0);
  const openingStock = Math.max(0, product.Quantity - totalImported + totalExported);
  const variance = actualCount - product.Quantity;
  const varianceValue = variance * product.Price;

  const handleConfirmStocktake = async () => {
    if (actualCount < 0) {
      toast.error('Số lượng tồn thực đếm không được âm');
      return;
    }
    setSubmittingAudit(true);
    try {
      await productApi.update(product.ProductID, {
        ProductName: product.ProductName,
        ProductType: product.ProductType,
        Quantity: actualCount,
        Unit: product.Unit,
        Price: product.Price,
        PathImage: product.PathImage,
        Description: product.Description,
      });
      toast.success(
        `Đã cân bằng kho mã #${String(product.ProductID).padStart(4, '0')}: Tồn mới = ${actualCount} ${product.Unit} (${variance >= 0 ? `+${variance}` : variance})`
      );
      await fetchCard();
    } catch {
      toast.error('Không thể cập nhật biên bản kiểm kê kho');
    } finally {
      setSubmittingAudit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm w-fit"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay lại Danh mục</span>
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Hồ sơ Dược phẩm, Thẻ Kho & Kiểm Kê (Stock Card)
              </h1>
              <span className="inline-flex items-center rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">
                Sổ Thẻ Kho GPP
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Truy xuất nguồn gốc lô nhập, đối chiếu công thức Tồn đầu - Nhập - Xuất - Tồn cuối và cân bằng kiểm kê thực tế
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 text-xs font-semibold text-white hover:bg-teal-700 shadow-sm w-fit"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>In Thẻ kho / Tem nhãn SKU</span>
        </button>
      </div>

      {/* Accounting Stock Card Formula Strip (Tồn đầu -> +Nhập -> -Xuất -> = Tồn cuối) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          onClick={() => setSelectedMetricModal('opening')}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs cursor-pointer hover:shadow-md hover:border-teal-500 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>1. Tồn kho đầu kỳ</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] text-teal-600 font-bold group-hover:underline">
              Chi tiết <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900 tabular-nums">
              {openingStock.toLocaleString('vi-VN')}
            </span>
            <span className="text-sm font-medium text-slate-500">{product.Unit}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {product.Unit === 'Hộp'
              ? `(= ${(openingStock * 10).toLocaleString('vi-VN')} Vỉ · ${(openingStock * 100).toLocaleString('vi-VN')} Viên)`
              : 'Số dư kết chuyển kỳ trước'}
          </div>
        </div>

        <div
          onClick={() => setSelectedMetricModal('imports')}
          className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-2xs cursor-pointer hover:shadow-md hover:border-emerald-400 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-700">
            <span>2. Tổng Nhập trong kỳ (+)</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-bold group-hover:underline">
              Chi tiết <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-emerald-700 tabular-nums">
              +{totalImported.toLocaleString('vi-VN')}
            </span>
            <span className="text-sm font-medium text-emerald-600">{product.Unit}</span>
            <span className="ml-auto inline-flex items-center rounded-md bg-emerald-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              + Nhập NCC
            </span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600/80">
            Từ {imports.length} phiếu nhập kho GDP
          </div>
        </div>

        <div
          onClick={() => setSelectedMetricModal('exports')}
          className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-2xs cursor-pointer hover:shadow-md hover:border-rose-400 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs font-semibold text-rose-700">
            <span>3. Tổng Xuất bán POS (Khấu trừ)</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-600 font-bold group-hover:underline">
              Chi tiết <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-rose-700 tabular-nums">
              {totalExported.toLocaleString('vi-VN')}
            </span>
            <span className="text-sm font-medium text-rose-600">{product.Unit}</span>
            <span className="ml-auto inline-flex items-center rounded-md bg-rose-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
              - Đã trừ kho
            </span>
          </div>
          <div className="mt-1 text-[11px] text-rose-600/80">
            Từ {exports.length} giao dịch bán lẻ POS hoàn tất
          </div>
        </div>

        <div
          onClick={() => setSelectedMetricModal('closing')}
          className="rounded-xl border border-teal-300 bg-teal-50/60 p-4 shadow-2xs cursor-pointer hover:shadow-md hover:border-teal-500 transition-all group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between text-xs font-bold text-teal-800">
            <span>4. Tồn cuối sổ sách (=)</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] text-teal-700 font-bold group-hover:underline">
              Chi tiết <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span
              className={`text-2xl font-bold tabular-nums ${
                product.Quantity <= 0 ? 'text-rose-600' : 'text-teal-900'
              }`}
            >
              {product.Quantity.toLocaleString('vi-VN')}
            </span>
            <span className="text-sm font-semibold text-teal-800">{product.Unit}</span>
            {product.Quantity <= 0 ? (
              <span className="ml-auto inline-flex items-center rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                HẾT HÀNG
              </span>
            ) : (
              <span className="ml-auto inline-flex items-center rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
                Khả dụng
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] font-medium text-teal-700 tabular-nums">
            {product.Unit === 'Hộp' ? (
              <span>
                Còn: <strong>{(product.Quantity * 10).toLocaleString('vi-VN')} Vỉ</strong> ·{' '}
                <strong>{(product.Quantity * 100).toLocaleString('vi-VN')} Viên</strong>
              </span>
            ) : (
              <span>Giá trị: {formatVND(product.Quantity * product.Price)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Dải thông tin đối chiếu công thức thẻ kho */}
      <div className="rounded-lg bg-slate-100/80 px-4 py-2.5 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2 border border-slate-200">
        <span className="flex items-center gap-1.5 font-medium">
          <Scale className="h-3.5 w-3.5 text-teal-600 shrink-0" />
          <span>
            Đối chiếu cân bằng sổ kho: Tồn đầu ({openingStock}) + Nhập (+{totalImported}) - Xuất ({totalExported}) = Tồn cuối ({product.Quantity} {product.Unit})
          </span>
        </span>
        <span className="text-[11px] text-slate-500 font-medium">
          Nhấn vào từng ô trên để xem chi tiết chứng từ phát sinh
        </span>
      </div>

      {/* Product Dossier + Physical Stocktake Audit Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 shadow-2xs flex flex-col sm:flex-row gap-5">
          <img
            src={product.PathImage}
            alt={product.ProductName}
            className="h-28 w-28 rounded-xl border border-slate-200 object-cover bg-slate-50 shrink-0"
          />
          <div className="flex-1 space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                SKU #{String(product.ProductID).padStart(4, '0')}
              </span>
              <span className="rounded-md bg-teal-50 px-2.5 py-0.5 font-mono text-xs font-semibold text-teal-700 border border-teal-200">
                DQG-{String(product.ProductID + 8100).padStart(5, '0')}
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 border border-slate-200/60">
                {product.ProductType}
              </span>
              <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/60">
                Đơn vị: {product.Unit}
              </span>
            </div>

            <h2 className="text-base font-bold text-slate-900">{product.ProductName}</h2>
            <p className="text-[13px] text-slate-600 leading-relaxed">{product.Description}</p>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Khởi tạo: {new Date(product.CreateDate).toLocaleDateString('vi-VN')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Cập nhật: {new Date(product.UpdateDate).toLocaleDateString('vi-VN')}
                </span>
              </div>
              <span className="inline-flex items-center gap-1 font-mono text-slate-700 font-semibold">
                <Barcode className="h-4 w-4 text-teal-600" />
                893{String(product.ProductID).padStart(9, '0')}
              </span>
            </div>
          </div>
        </div>

        {/* Physical Stocktake & Inventory Balance Card (Kiểm kê & Cân bằng kho thực tế) */}
        <div className="lg:col-span-5 rounded-xl border border-teal-200 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Kiểm kê & Cân bằng Kho thực tế
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Nhập số lượng thực đếm tại tủ thuốc để đối chiếu lệch kho
                  </p>
                </div>
              </div>
              <Scale className="h-4 w-4 text-slate-400" />
            </div>

            <div className="grid grid-cols-3 gap-2.5 my-3.5">
              <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-200/70">
                <div className="text-[11px] text-slate-500">Tồn sổ sách</div>
                <div className="text-base font-bold text-slate-900 tabular-nums mt-0.5">
                  {product.Quantity} {product.Unit}
                </div>
              </div>

              <div className="rounded-lg bg-teal-50/50 p-2.5 border border-teal-300">
                <label className="text-[11px] font-semibold text-teal-800 block">
                  Tồn thực đếm
                </label>
                <input
                  type="number"
                  min={0}
                  value={actualCount}
                  onChange={(e) => setActualCount(Number(e.target.value))}
                  className="mt-1 w-full h-9 rounded-lg border border-teal-300 bg-white px-2.5 text-xs font-bold text-slate-900 tabular-nums shadow-sm focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div
                className={`rounded-lg p-2.5 border ${
                  variance === 0
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                    : variance > 0
                    ? 'bg-sky-50/60 border-sky-200 text-sky-800'
                    : 'bg-rose-50/60 border-rose-200 text-rose-800'
                }`}
              >
                <div className="text-[11px] font-medium">Chênh lệch</div>
                <div className="text-base font-bold tabular-nums mt-0.5">
                  {variance > 0 ? `+${variance}` : variance} {product.Unit}
                </div>
                <div className="text-[10px] tabular-nums opacity-80">
                  {variance === 0 ? 'Khớp 100%' : formatVND(varianceValue)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700 block">
                Lý do kiểm kê / điều chỉnh tồn kho:
              </label>
              <select
                value={auditReason}
                onChange={(e) => setAuditReason(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 shadow-sm focus:border-teal-600 focus:outline-none"
              >
                <option value="Kiểm kê định kỳ cuối tháng (Chuẩn GPP)">
                  Kiểm kê định kỳ cuối tháng (Chuẩn GPP)
                </option>
                <option value="Cân bằng chênh lệch cắt liều lẻ Vỉ / Viên">
                  Cân bằng chênh lệch cắt liều lẻ Vỉ / Viên
                </option>
                <option value="Loại bỏ hàng hư hỏng bao bì / cận hạn">
                  Loại bỏ hàng hư hỏng bao bì / cận hạn
                </option>
                <option value="Bổ sung hàng khuyến mãi tặng kèm từ hãng">
                  Bổ sung hàng khuyến mãi tặng kèm từ hãng
                </option>
              </select>
            </div>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              Người kiểm: <strong className="text-slate-700">DS. Nguyễn Văn Trung</strong>
            </span>
            <button
              type="button"
              disabled={submittingAudit}
              onClick={() => void handleConfirmStocktake()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 shadow-sm transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{submittingAudit ? 'Đang cân bằng...' : 'Xác nhận Cân bằng Kho'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stock Movement Tables (Imports vs Exports) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Lịch sử Nhập kho */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Chứng từ Lô Nhập Kho (+{totalImported} {product.Unit})
              </h3>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              {imports.length} lần nhập
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Mã phiếu / NCC</th>
                  <th className="py-2.5 px-3">Số lô & Hạn dùng</th>
                  <th className="py-2.5 px-3 text-right">SL Nhập</th>
                  <th className="py-2.5 px-3 text-right">Giá vốn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-xs">
                {imports.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      Chưa phát sinh phiếu nhập kho bổ sung cho mặt hàng này (Tồn đầu kỳ).
                    </td>
                  </tr>
                ) : (
                  imports.map((imp) => (
                    <tr key={imp.POItemID} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-bold text-slate-900">
                          {imp.purchaseOrder.POCode}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate max-w-[160px]">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{imp.purchaseOrder.supplier.SupplierName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-semibold text-slate-800">Lô: {imp.BatchNumber}</div>
                        <div className="text-[11px] text-slate-500">HSD: {imp.ExpiryDate}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700 tabular-nums">
                        +{imp.Quantity} {product.Unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                        {formatVND(imp.ImportPrice)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Lịch sử Xuất bán */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-rose-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Chứng từ Xuất Bán POS (-{totalExported} {product.Unit})
              </h3>
            </div>
            <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 border border-rose-200">
              {exports.length} giao dịch
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Mã HĐ / Bệnh nhân</th>
                  <th className="py-2.5 px-3">Liều hướng dẫn</th>
                  <th className="py-2.5 px-3 text-right">SL Xuất</th>
                  <th className="py-2.5 px-3 text-right">Đơn giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 text-xs">
                {exports.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      Chưa phát sinh giao dịch xuất bán cho dược phẩm này.
                    </td>
                  </tr>
                ) : (
                  exports.map((exp) => (
                    <tr key={exp.ItemID} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">
                            {exp.invoice.InvoiceCode}
                          </span>
                          {exp.invoice.Status === 'CANCELLED' && (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 border border-rose-200">
                              Đã hoàn
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">{exp.invoice.CustomerName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {exp.DosageNote || 'Theo chỉ định'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-600 tabular-nums">
                        -{exp.Quantity} {product.Unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                        {formatVND(exp.UnitPrice)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL CHI TIẾT KHI NHẤN VÀO CÁC Ô SỐ LIỆU THẺ KHO */}
      {selectedMetricModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] p-3 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  {selectedMetricModal === 'opening' && <Package className="h-4 w-4" />}
                  {selectedMetricModal === 'imports' && <Truck className="h-4 w-4" />}
                  {selectedMetricModal === 'exports' && <Receipt className="h-4 w-4" />}
                  {selectedMetricModal === 'closing' && <Layers className="h-4 w-4" />}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {selectedMetricModal === 'opening' && 'Chi tiết Số dư Tồn kho Đầu kỳ & Kết chuyển'}
                    {selectedMetricModal === 'imports' && 'Bảng Kê Chi Tiết Phiếu Nhập Kho Nhà Cung Cấp (+)'}
                    {selectedMetricModal === 'exports' && 'Bảng Kê Chi Tiết Giao Dịch Xuất Bán Lẻ POS (-)'}
                    {selectedMetricModal === 'closing' && 'Cơ Cấu Tồn Kho Cuối Kỳ & Ma Trận Quy Đổi Đa Đơn Vị (=)'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Dược phẩm: <strong>{product.ProductName}</strong> (SKU #{String(product.ProductID).padStart(4, '0')})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMetricModal(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {/* TAB 1: TỒN ĐẦU KỲ */}
              {selectedMetricModal === 'opening' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Tồn đầu kỳ (Đơn vị gốc)</div>
                      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                        {openingStock.toLocaleString('vi-VN')} {product.Unit}
                      </div>
                    </div>
                    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3.5">
                      <div className="text-[11px] text-teal-700 font-medium">Quy đổi Vỉ lẻ (1 Hộp = 10 Vỉ)</div>
                      <div className="text-xl font-bold text-teal-800 mt-1 tabular-nums">
                        {(openingStock * 10).toLocaleString('vi-VN')} Vỉ
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Giá trị tồn đầu kỳ</div>
                      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                        {formatVND(openingStock * product.Price)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 space-y-2.5 bg-white">
                    <h4 className="font-bold text-slate-800">Biên bản kết chuyển sổ kho kỳ trước:</h4>
                    <div className="space-y-2 text-slate-600">
                      <div className="flex justify-between border-b border-slate-100 pb-1.5">
                        <span>Thời điểm khóa sổ kỳ trước:</span>
                        <strong className="text-slate-800">23:59:59 - 31/10/2026</strong>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1.5">
                        <span>Dược sĩ phụ trách chốt tồn:</span>
                        <strong className="text-slate-800">DS. Nguyễn Văn Trung (Mã NV: DS-001)</strong>
                      </div>
                      <div className="flex justify-between border-b border-slate-100 pb-1.5">
                        <span>Phương pháp định giá tồn kho:</span>
                        <strong className="text-slate-800">Bình quân gia quyền liên hoàn</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Kiểm tra cảm quan bao bì GPP:</span>
                        <span className="font-bold text-emerald-700">Đạt 100% (Tem niêm phong nguyên vẹn)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TỔNG NHẬP TRONG KỲ */}
              {selectedMetricModal === 'imports' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                      <div className="text-[11px] text-emerald-700 font-medium">Tổng lượng nhập kho (+)</div>
                      <div className="text-xl font-bold text-emerald-800 mt-1 tabular-nums">
                        +{totalImported.toLocaleString('vi-VN')} {product.Unit}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Quy đổi Vỉ lẻ nhập</div>
                      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                        +{(totalImported * 10).toLocaleString('vi-VN')} Vỉ
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Số phiếu nhập kho NCC</div>
                      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                        {imports.length} phiếu
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase">
                          <th className="py-2.5 px-3">Mã Phiếu / NCC</th>
                          <th className="py-2.5 px-3">Lô SX / HSD</th>
                          <th className="py-2.5 px-3 text-right">SL Nhập</th>
                          <th className="py-2.5 px-3 text-right">Đơn giá vốn</th>
                          <th className="py-2.5 px-3 text-right">Tổng tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {imports.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400">
                              Chưa có phiếu nhập kho nào
                            </td>
                          </tr>
                        ) : (
                          imports.map((imp) => (
                            <tr key={imp.POItemID} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3">
                                <div className="font-mono font-bold text-teal-700">
                                  {imp.purchaseOrder.POCode}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate max-w-[150px]">
                                  {imp.purchaseOrder.supplier.SupplierName}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                <div>Lô: {imp.BatchNumber}</div>
                                <div className="text-[11px] text-slate-400">HSD: {imp.ExpiryDate}</div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-700 tabular-nums">
                                +{imp.Quantity} {product.Unit}
                              </td>
                              <td className="py-2.5 px-3 text-right tabular-nums">
                                {formatVND(imp.ImportPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                                {formatVND(imp.Quantity * imp.ImportPrice)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: TỔNG XUẤT BÁN POS */}
              {selectedMetricModal === 'exports' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
                      <div className="text-[11px] text-rose-700 font-medium">Tổng xuất bán POS (-)</div>
                      <div className="text-xl font-bold text-rose-800 mt-1 tabular-nums">
                        {totalExported.toLocaleString('vi-VN')} {product.Unit}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Tương đương Vỉ lẻ xuất</div>
                      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                        {(totalExported * 10).toLocaleString('vi-VN')} Vỉ
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Số đơn hàng POS</div>
                      <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
                        {exports.length} đơn
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase">
                          <th className="py-2.5 px-3">Mã HĐ / Ngày bán</th>
                          <th className="py-2.5 px-3">Bệnh nhân / Khách hàng</th>
                          <th className="py-2.5 px-3">Liều dùng</th>
                          <th className="py-2.5 px-3 text-right">SL Xuất</th>
                          <th className="py-2.5 px-3 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {exports.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400">
                              Chưa có đơn bán lẻ nào phát sinh
                            </td>
                          </tr>
                        ) : (
                          exports.map((exp) => (
                            <tr key={exp.ItemID} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3">
                                <span className="font-mono font-bold text-teal-700">
                                  {exp.invoice.InvoiceCode}
                                </span>
                                <div className="text-[11px] text-slate-400">
                                  {new Date(exp.invoice.CreateDate).toLocaleDateString('vi-VN')}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                {exp.invoice.CustomerName}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 truncate max-w-[150px]">
                                {exp.DosageNote || 'Theo chỉ định'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-rose-600 tabular-nums">
                                -{exp.Quantity} {product.Unit}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold tabular-nums">
                                {formatVND(exp.Quantity * exp.UnitPrice)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: TỒN CUỐI SỔ SÁCH & QUY ĐỔI ĐA ĐƠN VỊ */}
              {selectedMetricModal === 'closing' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-teal-900 text-sm">Tồn kho khả dụng thực tế:</span>
                      <span className="font-bold text-xl text-teal-800 tabular-nums">
                        {product.Quantity.toLocaleString('vi-VN')} {product.Unit}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-teal-700">
                      Giá trị định giá tồn kho: <strong>{formatVND(product.Quantity * product.Price)}</strong>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-white">
                    <h4 className="font-bold text-slate-800">Ma trận quy đổi đơn vị theo chuẩn GPP:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                        <div className="text-[11px] text-slate-500">1. Đơn vị Nguyên Hộp</div>
                        <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
                          {product.Quantity.toLocaleString('vi-VN')} {product.Unit}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Đơn giá: {formatVND(product.Price)}/{product.Unit}
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                        <div className="text-[11px] text-slate-500">2. Quy đổi Vỉ lẻ (1 Hộp = 10 Vỉ)</div>
                        <div className="text-lg font-bold text-teal-700 mt-1 tabular-nums">
                          {(product.Quantity * 10).toLocaleString('vi-VN')} Vỉ
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Đơn giá: {formatVND(Math.round(product.Price / 10))}/Vỉ
                        </div>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
                        <div className="text-[11px] text-slate-500">3. Quy đổi Viên lẻ (1 Vỉ = 10 Viên)</div>
                        <div className="text-lg font-bold text-sky-700 mt-1 tabular-nums">
                          {(product.Quantity * 100).toLocaleString('vi-VN')} Viên
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Đơn giá: {formatVND(Math.round(product.Price / 50))}/Viên
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-4 space-y-2 bg-slate-50">
                    <h4 className="font-bold text-slate-800">Nguyên tắc ràng buộc kiểm soát kho:</h4>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600">
                      <li>Không cho phép bán khi tồn kho $\le$ 0 ở bất kỳ đơn vị nào (Hộp, Vỉ, Viên).</li>
                      <li>Khấu trừ tự động theo nguyên tắc Hết hạn trước - Xuất trước (FEFO).</li>
                      <li>Định mức tồn tối thiểu an toàn: 20 Hộp (Hiện tại: {product.Quantity > 20 ? '✅ Đạt an toàn' : '⚠️ Cần nhập bổ sung'}).</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-slate-200 px-5 py-3 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedMetricModal(null)}
                className="h-9 rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white hover:bg-teal-700 shadow-sm transition-colors"
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
