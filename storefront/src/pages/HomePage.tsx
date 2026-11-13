import React, { useMemo, useState } from 'react';
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
} from 'lucide-react';
import { Product } from '../types';
import {
  formatVND,
  getAvailableBaseStock,
  getEffectivePrice,
  getPackagingSpec,
} from '../utils/packaging';

interface HomePageProps {
  products: Product[];
  loading: boolean;
  search: string;
  buyerMode: 'RETAIL' | 'WHOLESALE';
  onRefresh: () => void;
  onSelectProduct: (product: Product) => void;
  onQuickAdd: (product: Product) => void;
  onOpenPrescriptionModal: () => void;
  onOpenTrackingModal: () => void;
}

const SYMPTOM_FILTERS = [
  { id: 'ALL_SYMPTOM', label: 'Tất cả triệu chứng', keywords: [] as string[] },
  {
    id: 'FEVER_FLU',
    label: 'Cảm cúm & Hạ sốt',
    keywords: ['paracetamol', 'panadol', 'hạ sốt', 'cảm', 'sốt', 'giảm đau', 'efferalgan'],
  },
  {
    id: 'ANTIBIOTIC',
    label: 'Kháng sinh & Hô hấp',
    keywords: ['amoxicillin', 'augmentin', 'azithromycin', 'kháng sinh', 'ho', 'hô hấp'],
  },
  {
    id: 'STOMACH',
    label: 'Dạ dày & Tiêu hóa',
    keywords: ['omeprazol', 'dạ dày', 'men tiêu hóa', 'gaviscon', 'tiêu hóa', 'enterogermina'],
  },
  {
    id: 'VITAMIN',
    label: 'Vitamin & Đề kháng',
    keywords: ['vitamin', 'kẽm', 'zinc', 'sắt', 'omega', 'tăng đề kháng', 'canxi'],
  },
];

export const HomePage: React.FC<HomePageProps> = ({
  products,
  loading,
  search,
  buyerMode,
  onRefresh,
  onSelectProduct,
  onQuickAdd,
  onOpenPrescriptionModal,
  onOpenTrackingModal,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [rxFilter, setRxFilter] = useState<'ALL' | 'OTC' | 'RX'>('ALL');
  const [symptomFilter, setSymptomFilter] = useState<string>('ALL_SYMPTOM');

  const categories = useMemo(
    () => ['ALL', ...Array.from(new Set(products.map((p) => p.ProductType).filter(Boolean)))],
    [products]
  );

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const activeSymptom = SYMPTOM_FILTERS.find((s) => s.id === symptomFilter);

    return products.filter((p) => {
      if (selectedCategory !== 'ALL' && p.ProductType !== selectedCategory) return false;
      if (rxFilter === 'OTC' && p.IsRx) return false;
      if (rxFilter === 'RX' && !p.IsRx) return false;

      if (keyword) {
        const hay = `${p.ProductName} ${p.ProductType} ${p.Description}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }

      if (activeSymptom && activeSymptom.keywords.length > 0) {
        const hay = `${p.ProductName} ${p.ProductType} ${p.Description}`.toLowerCase();
        const hit = activeSymptom.keywords.some((kw) => hay.includes(kw));
        if (!hit) return false;
      }

      return true;
    });
  }, [products, selectedCategory, rxFilter, search, symptomFilter]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 p-6 sm:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-xs">
              <ShieldCheck className="h-4 w-4 text-emerald-200" />
              <span>Nhà thuốc Chuẩn GPP • Dược sĩ Kiểm duyệt 100% Đơn Hàng</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
              {buyerMode === 'WHOLESALE'
                ? 'Kênh Cung Ứng Thuốc Sỉ B2B & Phòng Khám GDP'
                : 'Mua Thuốc Chính Hãng — Giao Nhanh Trong 2 Giờ'}
            </h1>
            <p className="text-sm text-teal-50 sm:text-base leading-relaxed">
              {buyerMode === 'WHOLESALE'
                ? 'Chiết khấu bậc thang theo Thùng / Hộp, hỗ trợ công nợ B2B, xuất hóa đơn VAT và vận chuyển xe lạnh GDP toàn quốc.'
                : 'Đặt thuốc không kê đơn (OTC) chọn linh hoạt Hộp / Vỉ / Viên hoặc tải lên toa thuốc bác sĩ để Dược sĩ chuyên môn tư vấn & giữ kho nguyên tử 15 phút.'}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={onOpenPrescriptionModal}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-teal-800 shadow-sm hover:bg-teal-50 transition-colors"
              >
                <FilePlus2 className="h-4 w-4 text-teal-600" />
                Gửi Ảnh Đơn Thuốc (Rx)
              </button>
              <button
                type="button"
                onClick={onOpenTrackingModal}
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 backdrop-blur-xs transition-colors"
              >
                <SearchCheck className="h-4 w-4" />
                Tra cứu đơn đã đặt
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 shrink-0 sm:w-80">
            <div className="rounded-2xl bg-white/12 p-3.5 backdrop-blur-xs border border-white/15">
              <Truck className="h-5 w-5 text-emerald-200 mb-1.5" />
              <div className="text-sm font-bold">Giao hỏa tốc 2H</div>
              <div className="text-[11px] text-teal-100">Giữ kho nguyên tử 15p</div>
            </div>
            <div className="rounded-2xl bg-white/12 p-3.5 backdrop-blur-xs border border-white/15">
              <Pill className="h-5 w-5 text-emerald-200 mb-1.5" />
              <div className="text-sm font-bold">Bán lẻ Vỉ / Viên</div>
              <div className="text-[11px] text-teal-100">Đúng liều theo toa</div>
            </div>
            <div className="rounded-2xl bg-white/12 p-3.5 backdrop-blur-xs border border-white/15">
              <CalendarClock className="h-5 w-5 text-emerald-200 mb-1.5" />
              <div className="text-sm font-bold">Lô FEFO mới nhất</div>
              <div className="text-[11px] text-teal-100">Minh bạch hạn sử dụng</div>
            </div>
            <div className="rounded-2xl bg-white/12 p-3.5 backdrop-blur-xs border border-white/15">
              <Building2 className="h-5 w-5 text-emerald-200 mb-1.5" />
              <div className="text-sm font-bold">Giá sỉ từ {products.length > 0 ? 'B2B' : ''}</div>
              <div className="text-[11px] text-teal-100">Hóa đơn VAT chuẩn</div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Bar: Pathology Pills + Category & Rx Filter */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {SYMPTOM_FILTERS.map((sym) => (
              <button
                key={sym.id}
                type="button"
                onClick={() => setSymptomFilter(sym.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  symptomFilter === sym.id
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {sym.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
              {[
                { key: 'ALL' as const, label: 'Tất cả' },
                { key: 'OTC' as const, label: 'OTC (Không kê đơn)' },
                { key: 'RX' as const, label: 'Rx (Kê đơn)' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRxFilter(opt.key)}
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
              <span className="hidden sm:inline">Đồng bộ kho</span>
            </button>
          </div>
        </div>

        {/* Dynamic ProductType Category Chips */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 mr-1">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Nhóm dược phẩm:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
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
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Danh mục sản phẩm ({filteredProducts.length})
          </h2>
          {buyerMode === 'WHOLESALE' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
              <Building2 className="h-3.5 w-3.5" />
              Đang áp dụng bảng giá Sỉ B2B
            </span>
          )}
        </div>

        {loading && products.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="h-40 rounded-xl bg-slate-100" />
                <div className="mt-4 h-4 w-3/4 rounded bg-slate-100" />
                <div className="mt-2 h-3 w-1/2 rounded bg-slate-100" />
                <div className="mt-6 h-9 rounded-xl bg-slate-100" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-sm font-bold text-slate-700">
              Không tìm thấy sản phẩm phù hợp với bộ lọc hiện tại
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Bạn có thể xóa bộ lọc hoặc gửi ảnh đơn thuốc để Dược sĩ tìm giúp.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('ALL');
                  setRxFilter('ALL');
                  setSymptomFilter('ALL_SYMPTOM');
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredProducts.map((product) => {
              const availBase = getAvailableBaseStock(product);
              const spec = getPackagingSpec(product);
              const price = getEffectivePrice(product, 'BASE', 1, buyerMode);
              const earliestLot = product.stockLots?.[0];
              const isOutOfStock = availBase <= 0 && spec.LooseUnits - spec.ReservedLooseUnits <= 0;

              return (
                <article
                  key={product.ProductID}
                  className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs transition-all hover:border-teal-300 hover:shadow-md"
                >
                  <div>
                    {/* Thumbnail */}
                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      className="relative block h-44 w-full overflow-hidden bg-slate-50 text-left"
                    >
                      <img
                        src={product.PathImage}
                        alt={product.ProductName}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
                        {product.IsRx ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50/95 px-2 py-0.5 text-[10px] font-bold text-rose-700 shadow-2xs">
                            Thuốc kê đơn (Rx)
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50/95 px-2 py-0.5 text-[10px] font-bold text-emerald-700 shadow-2xs">
                            Không kê đơn (OTC)
                          </span>
                        )}
                      </div>

                      {buyerMode === 'WHOLESALE' && price < product.Price && (
                        <span className="absolute right-2.5 top-2.5 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                          Giá sỉ B2B
                        </span>
                      )}

                      {isOutOfStock && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45">
                          <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-900">
                            Tạm hết tồn khả dụng
                          </span>
                        </div>
                      )}
                    </button>

                    {/* Content */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-teal-700">
                        <span className="truncate">{product.ProductType}</span>
                        <span className="shrink-0 text-slate-500 tabular-nums">
                          Còn {availBase} {product.Unit}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="line-clamp-2 text-left text-sm font-bold text-slate-900 hover:text-teal-700"
                      >
                        {product.ProductName}
                      </button>

                      <p className="line-clamp-2 text-xs text-slate-500 leading-relaxed">
                        {product.Description}
                      </p>

                      {earliestLot && (
                        <div className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                          <CalendarClock className="h-3 w-3 text-teal-600" />
                          <span>
                            Lô {earliestLot.BatchNumber} • HSD{' '}
                            {new Date(earliestLot.ExpiryDate).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price & Actions */}
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 pt-3 space-y-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <span className="text-base font-extrabold text-teal-700 tabular-nums">
                          {formatVND(price)}
                        </span>
                        <span className="ml-1 text-xs text-slate-500">/ {product.Unit}</span>
                      </div>
                      {buyerMode === 'WHOLESALE' && price < product.Price && (
                        <span className="text-xs text-slate-400 line-through tabular-nums">
                          {formatVND(product.Price)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        <Layers className="h-3.5 w-3.5 text-teal-600" />
                        {spec.AllowFractionalSale ? 'Chọn Hộp/Vỉ/Viên' : 'Chi tiết'}
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
      </section>
    </main>
  );
};
