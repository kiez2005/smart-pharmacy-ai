import React from 'react';
import {
  Search,
  ShoppingBag,
  PhoneCall,
  FilePlus2,
  SearchCheck,
  ShieldCheck,
  Building2,
  ExternalLink,
  Truck,
} from 'lucide-react';
import { formatVND } from '../utils/packaging';

interface HeaderProps {
  search: string;
  onSearchChange: (val: string) => void;
  cartCount: number;
  cartTotal: number;
  buyerMode: 'RETAIL' | 'WHOLESALE';
  onBuyerModeChange: (mode: 'RETAIL' | 'WHOLESALE') => void;
  onOpenCart: () => void;
  onOpenPrescriptionModal: () => void;
  onOpenTrackingModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  search,
  onSearchChange,
  cartCount,
  cartTotal,
  buyerMode,
  onBuyerModeChange,
  onOpenCart,
  onOpenPrescriptionModal,
  onOpenTrackingModal,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      {/* Top Info Bar (Chuẩn chuỗi nhà thuốc) */}
      <div className="bg-teal-800 text-teal-50 text-[11px] font-medium py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-300" />
              Nhà thuốc Chuẩn GPP Bộ Y Tế · 100% Chính Hãng
            </span>
            <span className="hidden sm:inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5 text-teal-300" />
              Giao hỏa tốc 2 giờ nội thành
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 text-amber-200 font-semibold">
              <PhoneCall className="h-3 w-3" />
              Dược sĩ tư vấn miễn phí: 1800-6868
            </span>
            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="hidden md:inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] hover:bg-white/20 transition-colors"
            >
              <span>Cổng Quản Trị Dược Sĩ (ERP :5173)</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        {/* Brand + Buyer Mode Switch */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white flex items-center justify-center shadow-md font-extrabold text-lg">
              P+
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight text-slate-900 leading-none">
                PharmaCore Direct
              </div>
              <div className="text-[11px] font-semibold text-teal-600 mt-0.5">
                Cửa hàng Nhà Thuốc Trực Tuyến · CS1 Trung Tâm
              </div>
            </div>
          </div>

          <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => onBuyerModeChange('RETAIL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                buyerMode === 'RETAIL'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Khách Lẻ
            </button>
            <button
              type="button"
              onClick={() => onBuyerModeChange('WHOLESALE')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                buyerMode === 'WHOLESALE'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="h-3 w-3" />
              Giá Sỉ B2B
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên thuốc, hoạt chất (Paracetamol, Amoxicillin...), thực phẩm chức năng..."
            className="w-full h-10 rounded-xl border border-slate-300 bg-slate-50/70 pl-10 pr-4 text-xs text-slate-900 focus:bg-white focus:border-teal-600 focus:outline-none transition-colors"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
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
            <span className="hidden sm:inline">Tra cứu đơn</span>
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
            <div className="text-left leading-tight hidden sm:block">
              <div className="text-[10px] text-teal-100 font-medium">Giỏ thuốc</div>
              <div className="text-xs font-extrabold tabular-nums">{formatVND(cartTotal)}</div>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
