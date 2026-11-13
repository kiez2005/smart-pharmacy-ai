import React from 'react';
import {
  Search,
  ShoppingBag,
  PhoneCall,
  FilePlus2,
  SearchCheck,
  ShieldCheck,
  Building2,
  Truck,
} from 'lucide-react';
import { formatVND } from '../utils/packaging';

interface HeaderProps {
  search: string;
  onSearchChange: (val: string) => void;
  cartCount: number;
  cartTotal: number;
  onOpenCart: () => void;
  onOpenPrescriptionModal: () => void;
  onOpenB2BQuoteModal: () => void;
  onOpenTrackingModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  search,
  onSearchChange,
  cartCount,
  cartTotal,
  onOpenCart,
  onOpenPrescriptionModal,
  onOpenB2BQuoteModal,
  onOpenTrackingModal,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Top Info Bar gọn nhẹ, không trùng lặp link ERP nội bộ (U5) */}
      <div className="bg-teal-800 text-teal-50 text-[11px] font-medium py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-4 min-w-0">
            <span className="inline-flex items-center gap-1 truncate">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-300 shrink-0" />
              <span className="truncate">Nhà thuốc Chuẩn GPP · CS1 Trung Tâm</span>
            </span>
            <span className="hidden md:inline-flex items-center gap-1 shrink-0">
              <Truck className="h-3.5 w-3.5 text-teal-300" />
              Miễn phí giao đơn từ 300.000đ
            </span>
          </div>

          <a
            href="tel:18006868"
            className="inline-flex items-center gap-1 text-amber-200 font-semibold shrink-0 hover:underline"
          >
            <PhoneCall className="h-3 w-3" />
            <span>Dược sĩ: 1800-6868</span>
          </a>
        </div>
      </div>

      {/* Main Header (U5 Streamlined Mobile + Desktop) */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col lg:flex-row lg:items-center gap-2.5 sm:gap-3 justify-between">
        {/* Brand + Action row on mobile */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center shadow-md font-extrabold text-base sm:text-lg shrink-0">
              P+
            </div>
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 leading-none truncate">
                PharmaCore Direct
              </div>
              <div className="text-[11px] font-semibold text-teal-600 mt-0.5 truncate">
                Nhà thuốc Trực tuyến Chính hãng
              </div>
            </div>
          </div>

          {/* Mobile Compact Quick Actions */}
          <div className="flex items-center gap-1.5 lg:hidden shrink-0">
            <button
              type="button"
              onClick={onOpenTrackingModal}
              title="Tra cứu đơn hàng"
              className="h-9 px-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold inline-flex items-center gap-1"
            >
              <SearchCheck className="h-4 w-4 text-teal-600" />
              <span className="hidden xs:inline">Tra cứu</span>
            </button>
            <button
              type="button"
              onClick={onOpenCart}
              aria-label="Mở giỏ hàng"
              className="h-9 px-2.5 rounded-xl bg-teal-600 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
            >
              <ShoppingBag className="h-4 w-4" />
              {cartCount > 0 && (
                <span className="rounded-full bg-amber-400 text-slate-900 text-[10px] font-extrabold px-1.5 py-0.2 tabular-nums">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 lg:max-w-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên thuốc, hoạt chất, thực phẩm chức năng..."
            className="w-full h-9 sm:h-10 rounded-xl border border-slate-300 bg-slate-50/70 pl-10 pr-4 text-xs text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none transition-colors"
          />
        </div>

        {/* Desktop Action Buttons */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenB2BQuoteModal}
            className="h-10 px-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <Building2 className="h-4 w-4 text-indigo-600" />
            <span>Báo giá sỉ B2B</span>
          </button>

          <button
            type="button"
            onClick={onOpenPrescriptionModal}
            className="h-10 px-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <FilePlus2 className="h-4 w-4 text-rose-600" />
            <span>Gửi Đơn Thuốc (Rx)</span>
          </button>

          <button
            type="button"
            onClick={onOpenTrackingModal}
            className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <SearchCheck className="h-4 w-4 text-teal-600" />
            <span>Tra cứu đơn</span>
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            className="h-10 px-3.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors"
          >
            <div className="relative">
              <ShoppingBag className="h-4 w-4" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 h-4 min-w-[16px] rounded-full bg-amber-400 text-slate-900 text-[10px] font-extrabold flex items-center justify-center px-1">
                  {cartCount}
                </span>
              )}
            </div>
            <div className="text-left leading-tight">
              <div className="text-[10px] text-teal-100 font-medium">Giỏ thuốc</div>
              <div className="text-xs font-extrabold tabular-nums">{formatVND(cartTotal)}</div>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
