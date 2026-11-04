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
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="text-xs font-medium text-slate-500">1. Tồn kho đầu kỳ</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {openingStock.toLocaleString('vi-VN')} <span className="text-sm font-medium text-slate-500">{product.Unit}</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Số dư kết chuyển kỳ trước</div>
        </div>

        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-emerald-700">2. Tổng Nhập trong kỳ (+)</div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 tabular-nums">
            +{totalImported.toLocaleString('vi-VN')} <span className="text-sm font-medium">{product.Unit}</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600/80">Từ {imports.length} phiếu nhập kho NCC</div>
        </div>

        <div className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-rose-700">3. Tổng Xuất bán POS (-)</div>
          <div className="mt-1.5 text-2xl font-bold text-rose-700 tabular-nums">
            -{totalExported.toLocaleString('vi-VN')} <span className="text-sm font-medium">{product.Unit}</span>
          </div>
          <div className="mt-1 text-[11px] text-rose-600/80">Từ {exports.length} giao dịch xuất bán</div>
        </div>

        <div className="rounded-xl border border-teal-300 bg-teal-50/60 p-4 shadow-2xs">
          <div className="text-xs font-bold text-teal-800">4. Tồn cuối sổ sách (=)</div>
          <div className="mt-1.5 text-2xl font-bold text-teal-900 tabular-nums">
            {product.Quantity.toLocaleString('vi-VN')} <span className="text-sm font-semibold">{product.Unit}</span>
          </div>
          <div className="mt-1 text-[11px] font-medium text-teal-700 tabular-nums">
            Giá trị: {formatVND(product.Quantity * product.Price)}
          </div>
        </div>
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
    </div>
  );
};
