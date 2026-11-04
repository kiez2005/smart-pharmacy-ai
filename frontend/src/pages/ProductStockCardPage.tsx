import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Barcode,
  Calendar,
  Building2,
} from 'lucide-react';
import { enterpriseApi } from '../services/enterprise.api';
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

  useEffect(() => {
    const fetchCard = async () => {
      setLoading(true);
      try {
        const res = await enterpriseApi.getProductStockCard(productId);
        setData(res);
      } catch {
        toast.error('Không thể tải dữ liệu thẻ kho dược phẩm');
      } finally {
        setLoading(false);
      }
    };
    fetchCard();
  }, [productId]);

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="h-12 rounded-lg border border-zinc-200 bg-white animate-pulse" />
        <div className="h-64 rounded-lg border border-zinc-200 bg-white animate-pulse" />
      </div>
    );
  }

  const { product, imports, exports } = data;
  const totalImported = imports.reduce((sum, i) => sum + i.Quantity, 0);
  const totalExported = exports
    .filter((e) => e.invoice.Status === 'COMPLETED')
    .reduce((sum, e) => sum + e.Quantity, 0);

  return (
    <div className="space-y-6">
      {/* Top Navigation & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Quay lại Danh mục</span>
          </button>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
              Hồ sơ Dược phẩm & Thẻ Kho (Stock Card)
            </h1>
            <p className="text-xs text-zinc-500">
              Truy xuất nguồn gốc lô nhập, hạn dùng và lịch sử xuất bán của mã SKU #{String(product.ProductID).padStart(4, '0')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
        >
          <Printer className="h-3.5 w-3.5" />
          <span>In Thẻ kho / Tem nhãn SKU</span>
        </button>
      </div>

      {/* Product Dossier & Barcode Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs flex flex-col sm:flex-row gap-5">
          <img
            src={product.PathImage}
            alt={product.ProductName}
            className="h-28 w-28 rounded-lg border border-zinc-200 object-cover bg-zinc-50 shrink-0"
          />
          <div className="flex-1 space-y-2.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-zinc-900 px-2 py-0.5 font-mono text-xs font-medium text-white">
                SKU #{String(product.ProductID).padStart(4, '0')}
              </span>
              <span className="rounded-md bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200/60">
                {product.ProductType}
              </span>
              <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200/60">
                Đơn vị: {product.Unit}
              </span>
            </div>

            <h2 className="text-base font-semibold text-zinc-900">{product.ProductName}</h2>
            <p className="text-[13px] text-zinc-600 leading-relaxed">{product.Description}</p>

            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Khởi tạo: {new Date(product.CreateDate).toLocaleString('vi-VN')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Cập nhật: {new Date(product.UpdateDate).toLocaleString('vi-VN')}
              </span>
            </div>
          </div>
        </div>

        {/* Printable SKU Barcode & Stock Summary */}
        <div className="lg:col-span-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-dashed border-zinc-200 pb-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Tem định danh GPP
              </div>
              <div className="text-sm font-semibold text-zinc-900 truncate max-w-[200px]">
                {product.ProductName}
              </div>
            </div>
            <Barcode className="h-8 w-8 text-zinc-800" />
          </div>

          <div className="grid grid-cols-2 gap-3 my-3">
            <div className="rounded-md bg-zinc-50 p-2.5 border border-zinc-200/60">
              <div className="text-[11px] text-zinc-500">Tồn kho thực tế</div>
              <div className="text-lg font-semibold text-zinc-900 tabular-nums">
                {product.Quantity} {product.Unit}
              </div>
            </div>
            <div className="rounded-md bg-zinc-50 p-2.5 border border-zinc-200/60">
              <div className="text-[11px] text-zinc-500">Đơn giá niêm yết</div>
              <div className="text-lg font-semibold text-zinc-900 tabular-nums">
                {formatVND(product.Price)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-zinc-100">
            <span>Tổng giá trị tồn mặt hàng:</span>
            <span className="font-semibold text-zinc-900 tabular-nums">
              {formatVND(product.Quantity * product.Price)}
            </span>
          </div>
        </div>
      </div>

      {/* Stock Movement Tables (Imports vs Exports) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Lịch sử Nhập kho */}
        <div className="rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-zinc-900">
                Lịch sử Lô Nhập Kho (+{totalImported} {product.Unit})
              </h3>
            </div>
            <span className="text-xs text-zinc-500">{imports.length} lần nhập</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2 px-3">Mã phiếu / NCC</th>
                  <th className="py-2 px-3">Số lô & Hạn dùng</th>
                  <th className="py-2 px-3 text-right">SL Nhập</th>
                  <th className="py-2 px-3 text-right">Giá vốn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {imports.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-400">
                      Chưa phát sinh phiếu nhập kho bổ sung cho mặt hàng này (Tồn đầu kỳ).
                    </td>
                  </tr>
                ) : (
                  imports.map((imp) => (
                    <tr key={imp.POItemID} className="hover:bg-zinc-50">
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-semibold text-zinc-900">
                          {imp.purchaseOrder.POCode}
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-1 truncate max-w-[160px]">
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{imp.purchaseOrder.supplier.SupplierName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-zinc-800">Lô: {imp.BatchNumber}</div>
                        <div className="text-[11px] text-zinc-500">HSD: {imp.ExpiryDate}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 tabular-nums">
                        +{imp.Quantity} {product.Unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-zinc-900 tabular-nums">
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
        <div className="rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/50">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4 text-rose-600" />
              <h3 className="text-sm font-semibold text-zinc-900">
                Lịch sử Xuất Bán POS (-{totalExported} {product.Unit})
              </h3>
            </div>
            <span className="text-xs text-zinc-500">{exports.length} giao dịch</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[11px] font-medium text-zinc-500">
                  <th className="py-2 px-3">Mã HĐ / Bệnh nhân</th>
                  <th className="py-2 px-3">Liều hướng dẫn</th>
                  <th className="py-2 px-3 text-right">SL Xuất</th>
                  <th className="py-2 px-3 text-right">Đơn giá</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/60 text-xs">
                {exports.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-400">
                      Chưa phát sinh giao dịch xuất bán cho dược phẩm này.
                    </td>
                  </tr>
                ) : (
                  exports.map((exp) => (
                    <tr key={exp.ItemID} className="hover:bg-zinc-50">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold text-zinc-900">
                            {exp.invoice.InvoiceCode}
                          </span>
                          {exp.invoice.Status === 'CANCELLED' && (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 border border-rose-200">
                              Đã hoàn
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500">{exp.invoice.CustomerName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-zinc-600">
                        {exp.DosageNote || 'Theo chỉ định'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-rose-600 tabular-nums">
                        -{exp.Quantity} {product.Unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-zinc-900 tabular-nums">
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
