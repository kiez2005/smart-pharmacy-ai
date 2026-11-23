import React, { useMemo } from 'react';
import {
  FilePlus2,
  Truck,
  ShieldCheck,
  SearchCheck,
  CalendarClock,
  ShoppingBag,
  SlidersHorizontal,
  Building2,
  RefreshCw,
  Pill,
  Layers,
  ChevronLeft,
  ChevronRight,
  MessageCircleHeart,
} from 'lucide-react';
import { Product } from '../types';
import { PublicCatalogSearchMeta } from '../services/api';
import {
  formatVND,
  getPackagingSpec,
  getStockStatusBadgeInfo,
} from '../utils/packaging';
import { SafeImage } from '../components/SafeImage';

interface HomePageProps {
  products: Product[];
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  rxFilter: 'ALL' | 'OTC' | 'RX';
  onChangeRxFilter: (next: 'ALL' | 'OTC' | 'RX') => void;
  symptomFilter: string;
  onChangeSymptomFilter: (next: string) => void;
  page: number;
  total: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  loading: boolean;
  search: string;
  searchMeta?: PublicCatalogSearchMeta;
  onRefresh: () => void;
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  onOpenPrescriptionModal: () => void;
  onOpenB2BQuoteModal: () => void;
  onOpenTrackingModal: () => void;
  onOpenAiChat?: () => void;
}

const SYMPTOM_FILTERS = [
  { id: 'ALL_SYMPTOM', label: 'Tất cả triệu chứng' },
  { id: 'FEVER_FLU', label: 'Cảm cúm & Hạ sốt' },
  { id: 'ANTIBIOTIC', label: 'Kháng sinh & Hô hấp' },
  { id: 'STOMACH', label: 'Dạ dày & Tiêu hóa' },
  { id: 'VITAMIN', label: 'Vitamin & Đề kháng' },
];

export const HomePage: React.FC<HomePageProps> = ({
  products,
  categories: serverCategories,
  selectedCategory,
  onSelectCategory,
  rxFilter,
  onChangeRxFilter,
  symptomFilter,
  onChangeSymptomFilter,
  page,
  total,
  totalPages,
  onPageChange,
  loading,
  search,
  searchMeta,
  onRefresh,
  onSelectProduct,
  onQuickAdd,
  onOpenPrescriptionModal,
  onOpenB2BQuoteModal,
  onOpenTrackingModal,
  onOpenAiChat,
}) => {
  const categories = useMemo(
    () =>
      serverCategories.length > 0
        ? ['ALL', ...serverCategories]
        : ['ALL', ...Array.from(new Set(products.map((p) => p.ProductType).filter(Boolean)))],
    [serverCategories, products]
  );

  const filteredProducts = products;

  return (
    <main className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5 sm:space-y-6">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-5 sm:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-200 shrink-0" />
              <span>Nhà thuốc Chuẩn GPP • Dược sĩ Kiểm duyệt 100% Đơn Hàng</span>
            </div>
            <h1 className="text-xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
              Mua Thuốc Chính Hãng — Giao Nhanh Trong 2 Giờ
            </h1>
            <p className="text-xs sm:text-base text-teal-50 leading-relaxed">
              Đặt thuốc không kê đơn (OTC) linh hoạt theo Hộp / Vỉ / Viên hoặc tải lên toa thuốc bác sĩ để Dược sĩ chuyên môn tư vấn & giữ hàng ưu tiên 15 phút.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onOpenPrescriptionModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-bold text-teal-800 shadow-sm hover:bg-teal-50 transition-colors"
              >
                <FilePlus2 className="h-4 w-4 text-teal-600" />
                Gửi Đơn Thuốc (Rx)
              </button>
              <button
                type="button"
                onClick={onOpenTrackingModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/20 backdrop-blur-xs transition-colors"
              >
                <SearchCheck className="h-4 w-4" />
                Tra cứu đơn
              </button>
              {onOpenAiChat && (
                <button
                  type="button"
                  onClick={onOpenAiChat}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/60 bg-emerald-500/35 px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-500/50 backdrop-blur-xs transition-colors"
                >
                  <MessageCircleHeart className="h-4 w-4 text-emerald-100" />
                  Hỏi Dược sĩ AI
                </button>
              )}
              <button
                type="button"
                onClick={onOpenB2BQuoteModal}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-indigo-600/70 px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-indigo-600 transition-colors lg:hidden"
              >
                <Building2 className="h-4 w-4" />
                Báo giá B2B
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 shrink-0 sm:w-80">
            <div className="rounded-xl sm:rounded-2xl bg-white/12 p-3 sm:p-3.5 backdrop-blur-xs border border-white/15">
              <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-200 mb-1" />
              <div className="text-xs sm:text-sm font-bold">Giao hỏa tốc 2H</div>
              <div className="text-[10px] sm:text-[11px] text-teal-100">Miễn phí đơn &ge; 300k</div>
            </div>
            <div className="rounded-xl sm:rounded-2xl bg-white/12 p-3 sm:p-3.5 backdrop-blur-xs border border-white/15">
              <Pill className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-200 mb-1" />
              <div className="text-xs sm:text-sm font-bold">Bán lẻ Vỉ / Viên</div>
              <div className="text-[10px] sm:text-[11px] text-teal-100">Đúng liều theo toa</div>
            </div>
            <div className="rounded-xl sm:rounded-2xl bg-white/12 p-3 sm:p-3.5 backdrop-blur-xs border border-white/15">
              <CalendarClock className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-200 mb-1" />
              <div className="text-xs sm:text-sm font-bold">Xuất kho FEFO</div>
              <div className="text-[10px] sm:text-[11px] text-teal-100">Ưu tiên lô date chuẩn</div>
            </div>
            <div className="rounded-xl sm:rounded-2xl bg-white/12 p-3 sm:p-3.5 backdrop-blur-xs border border-white/15">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-200 mb-1" />
              <div className="text-xs sm:text-sm font-bold">Cung ứng sỉ B2B</div>
              <div className="text-[10px] sm:text-[11px] text-teal-100">Báo giá riêng qua Dược sĩ</div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Bar (Compact mobile-friendly horizontal scroll chips - U5) */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {SYMPTOM_FILTERS.map((sym) => (
              <button
                key={sym.id}
                type="button"
                onClick={() => onChangeSymptomFilter(sym.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold shrink-0 transition-colors ${
                  symptomFilter === sym.id
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {sym.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between md:justify-end gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
              {[
                { key: 'ALL' as const, label: 'Tất cả' },
                { key: 'OTC' as const, label: 'OTC' },
                { key: 'RX' as const, label: 'Kê đơn (Rx)' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onChangeRxFilter(opt.key)}
                  className={`rounded-lg px-2.5 py-1 transition-all ${
                    rxFilter === opt.key
                      ? 'bg-white text-teal-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onRefresh}
              title="Làm mới tồn kho thời gian thực"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Đồng bộ</span>
            </button>
          </div>
        </div>

        {/* Dynamic ProductType Category Chips */}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 mr-1 shrink-0">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Nhóm:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium shrink-0 transition-colors ${
                selectedCategory === cat
                  ? 'border-teal-600 bg-teal-50 text-teal-800 font-semibold'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat === 'ALL' ? 'Tất cả danh mục' : cat}
            </button>
          ))}
        </div>
      </section>

      {/* Catalog Grid */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Danh mục dược phẩm ({total})
            </h2>
            {search.trim() && searchMeta && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  searchMeta.semanticDegraded
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-teal-50 text-teal-800 border border-teal-200'
                }`}
                title={searchMeta.warning || ''}
              >
                {searchMeta.engine === 'hybrid-rrf'
                  ? 'Tìm kiếm thông minh theo tên thuốc & công dụng'
                  : searchMeta.warning || 'Khớp từ khóa trực tiếp'}
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500">
            Trang <strong>{page}</strong> / {totalPages}
          </span>
        </div>

        {loading && products.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="h-72 sm:h-80 animate-pulse rounded-2xl border border-slate-200 bg-white p-3 sm:p-4"
              >
                <div className="h-32 sm:h-40 rounded-xl bg-slate-100" />
                <div className="mt-3 h-4 w-3/4 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
                <div className="mt-5 h-8 rounded-xl bg-slate-100" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm font-bold text-slate-700">
              Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Bạn có thể xóa bộ lọc hoặc gửi ảnh đơn thuốc để Dược sĩ tìm giúp.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelectCategory('ALL');
                  onChangeRxFilter('ALL');
                  onChangeSymptomFilter('ALL_SYMPTOM');
                }}
                className="rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Đặt lại bộ lọc
              </button>
              <button
                type="button"
                onClick={onOpenPrescriptionModal}
                className="rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-700"
              >
                Gửi đơn thuốc hỏi Dược sĩ
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {filteredProducts.map((product) => {
              const spec = getPackagingSpec(product);
              const stockBadge = getStockStatusBadgeInfo(product);
              const isOutOfStock = product.InStock === false;

              return (
                <article
                  key={product.ProductID}
                  className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition-all hover:border-teal-300 hover:shadow-md"
                >
                  <div>
                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      className="relative block h-36 sm:h-44 w-full overflow-hidden bg-slate-50 text-left"
                    >
                      <SafeImage
                        src={product.PathImage}
                        alt={product.ProductName}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                        {product.IsRx ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50/95 px-2 py-0.5 text-[10px] font-bold text-rose-700 shadow-2xs">
                            Kê đơn (Rx)
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50/95 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-2xs">
                            OTC
                          </span>
                        )}
                      </div>

                      {isOutOfStock && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45">
                          <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-900">
                            Tạm hết hàng
                          </span>
                        </div>
                      )}
                    </button>

                    <div className="p-3 sm:p-4 space-y-1.5 sm:space-y-2">
                      <div className="flex items-center justify-between gap-1.5 text-[10px] sm:text-[11px] font-semibold">
                        <span className="truncate text-teal-700">{product.ProductType}</span>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.2 ${stockBadge.className}`}>
                          {stockBadge.label}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="line-clamp-2 text-left text-xs sm:text-sm font-bold text-slate-900 hover:text-teal-700"
                      >
                        {product.ProductName}
                      </button>

                      <p className="hidden sm:line-clamp-2 text-xs text-slate-500 leading-relaxed">
                        {product.Description}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/50 p-3 sm:p-4 pt-2.5 sm:pt-3 space-y-2">
                    <div>
                      <span className="text-sm sm:text-base font-extrabold text-teal-700 tabular-nums">
                        {formatVND(product.Price)}
                      </span>
                      <span className="ml-1 text-[11px] text-slate-500">/ {product.Unit}</span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="hidden sm:inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Layers className="h-3.5 w-3.5 text-teal-600" />
                        {spec.AllowFractionalSale ? 'Hộp/Vỉ/Viên' : 'Chi tiết'}
                      </button>
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => onQuickAdd(product)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-teal-600 px-2.5 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:bg-slate-300"
                      >
                        <ShoppingBag className="h-3.5 w-3.5" />
                        Chọn mua
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Server-side Pagination Controls (P1) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
            <span>
              Hiển thị trang <strong>{page}</strong> / {totalPages} ({total} sản phẩm)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(Math.max(1, page - 1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Trước
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Sau
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};
