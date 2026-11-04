import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Package,
  AlertTriangle,
  Users,
  ArrowUpRight,
  Truck,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { enterpriseApi } from '../services/enterprise.api';
import { DashboardAnalytics } from '../types/enterprise';
import { toast } from 'sonner';

interface DashboardPageProps {
  onOpenStockCard: (productId: number) => void;
  onNavigateToImports: () => void;
  onNavigateToPos: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenStockCard,
  onNavigateToImports,
  onNavigateToPos,
}) => {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await enterpriseApi.getDashboard();
      setData(res);
    } catch {
      toast.error('Không thể tải dữ liệu phân tích điều hành');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const formatVND = (val: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

  if (loading || !data) {
    return (
      <div className="space-y-5">
        <div className="h-14 rounded-lg border border-zinc-200 bg-white animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-lg border border-zinc-200 bg-white animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const maxCategoryValue = Math.max(...data.categoryBreakdown.map((c) => c.value), 1);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            Tổng quan Điều hành & Phân tích Tài chính
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Theo dõi chỉ số doanh thu bán lẻ, giá trị tồn kho dược phẩm, luồng nhập hàng và cảnh báo định mức.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAnalytics}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
            <span>Làm mới số liệu</span>
          </button>
          <button
            type="button"
            onClick={onNavigateToPos}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 shadow-2xs"
          >
            <span>Mở Quầy Thu ngân POS</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Enterprise KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-zinc-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Doanh thu bán lẻ thực thu</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">
              {formatVND(data.totalRevenue)}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Từ <span className="font-semibold text-zinc-800">{data.completedInvoicesCount}</span> đơn xuất bán hoàn tất
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Tổng giá trị tồn kho hiện tại</span>
            <Package className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">
              {formatVND(data.totalInventoryValue)}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            <span className="font-semibold text-zinc-800">{data.totalProducts}</span> mặt hàng ({data.totalStockUnits.toLocaleString('vi-VN')} đơn vị)
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Tổng ngân sách nhập hàng</span>
            <Truck className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">
              {formatVND(data.totalPurchaseCost)}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Tổng giá vốn các lô nhập kho GPP
          </p>
        </div>

        <div className="rounded-lg border border-zinc-200/80 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
            <span>Hồ sơ bệnh nhân & Cảnh báo kho</span>
            <Users className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums">
              {data.totalCustomers} hồ sơ
            </span>
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border ${
                data.lowStockProducts.length > 0
                  ? 'bg-amber-50 text-amber-700 border-amber-200/60'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
              }`}
            >
              {data.lowStockProducts.length} sắp hết
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Theo dõi dị ứng thuốc & tích điểm khách hàng
          </p>
        </div>
      </div>

      {/* Middle Section: Category Distribution & Top Selling */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Category Distribution */}
        <div className="lg:col-span-7 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Cơ cấu Giá trị Tồn kho theo Nhóm Dược lý
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Phân bổ vốn tồn kho và số lượng SKU theo từng danh mục điều trị
              </p>
            </div>
          </div>

          <div className="space-y-3.5">
            {data.categoryBreakdown.map((cat) => {
              const widthPct = Math.max(6, Math.round((cat.value / maxCategoryValue) * 100));
              return (
                <div key={cat.type} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-800">{cat.type}</span>
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 tabular-nums">
                        {cat.count} SKU · {cat.quantity.toLocaleString('vi-VN')} đv
                      </span>
                    </div>
                    <span className="font-semibold text-zinc-900 tabular-nums">
                      {formatVND(cat.value)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-zinc-900 transition-all duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Selling Products */}
        <div className="lg:col-span-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Dược phẩm Xuất bán Hàng đầu
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Xếp hạng theo doanh thu thực tế từ hóa đơn POS
                </p>
              </div>
            </div>

            <div className="divide-y divide-zinc-100">
              {data.topSelling.map((item, idx) => (
                <div key={item.ProductID} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 font-mono text-xs font-semibold text-zinc-700">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onOpenStockCard(item.ProductID)}
                        className="text-[13px] font-medium text-zinc-900 hover:underline truncate block text-left"
                      >
                        {item.ProductName}
                      </button>
                      <span className="text-[11px] text-zinc-500">
                        Đã xuất: {item.soldQty} {item.Unit}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-zinc-900 tabular-nums">
                      {formatVND(item.revenue)}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenStockCard(item.ProductID)}
                      className="text-[11px] text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-0.5"
                    >
                      <FileText className="h-3 w-3" />
                      <span>Thẻ kho</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
            <span>Nhấn vào tên thuốc để tra cứu Thẻ kho Nhập/Xuất</span>
          </div>
        </div>
      </div>

      {/* Bottom Table: Low Stock Alert */}
      <div className="rounded-lg border border-zinc-200 bg-white shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">
                Danh sách Dược phẩm Cần Nhập Bổ sung (Tồn kho &lt; 30 đơn vị)
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToImports}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
          >
            <Truck className="h-3.5 w-3.5 text-zinc-600" />
            <span>Tạo Phiếu Nhập Kho Bổ Sung</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/70 text-[12px] font-medium text-zinc-500">
                <th className="py-2.5 px-4">Mã SKU</th>
                <th className="py-2.5 px-4">Tên dược phẩm</th>
                <th className="py-2.5 px-4">Nhóm dược lý</th>
                <th className="py-2.5 px-4 text-right">Tồn hiện tại</th>
                <th className="py-2.5 px-4 text-right">Đơn giá bán</th>
                <th className="py-2.5 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200/70 text-[13px]">
              {data.lowStockProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-zinc-400">
                    Tất cả dược phẩm trong kho đều đạt định mức an toàn (&ge; 30 đơn vị).
                  </td>
                </tr>
              ) : (
                data.lowStockProducts.map((p) => (
                  <tr key={p.ProductID} className="hover:bg-zinc-50/80">
                    <td className="py-2.5 px-4 font-mono text-xs text-zinc-500">
                      #{String(p.ProductID).padStart(4, '0')}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-zinc-900">{p.ProductName}</td>
                    <td className="py-2.5 px-4 text-xs text-zinc-600">{p.ProductType}</td>
                    <td className="py-2.5 px-4 text-right">
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200/60 tabular-nums">
                        {p.Quantity} {p.Unit}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-zinc-900 tabular-nums">
                      {formatVND(p.Price)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenStockCard(p.ProductID)}
                          className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          Xem thẻ kho
                        </button>
                        <button
                          type="button"
                          onClick={onNavigateToImports}
                          className="rounded bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                        >
                          Nhập hàng
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
