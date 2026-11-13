import React from 'react';
import { ShieldCheck, PhoneCall, MapPin, Truck, RotateCcw, ExternalLink } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      {/* Trust Highlights */}
      <div className="border-b border-slate-100 bg-slate-50/70">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">100% Thuốc Chính Hãng</p>
              <p className="text-[11px] text-slate-500">Đạt chuẩn GPP • Hóa đơn VAT đầy đủ</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Giao Nhanh Trong 2 Giờ</p>
              <p className="text-[11px] text-slate-500">Đóng gói bảo mật • Xe lạnh GDP sỉ</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Đổi Trả Trong 30 Ngày</p>
              <p className="text-[11px] text-slate-500">Miễn phí đổi trả theo chính sách GPP</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Dược Sĩ Tư Vấn Miễn Phí</p>
              <p className="text-[11px] text-slate-500">Hotline 1800-6868 (07:00 - 22:00)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-xs font-black text-white">
                P+
              </span>
              <span className="text-base font-extrabold text-slate-900">
                Nhà thuốc PharmaCore GPP
              </span>
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 border border-teal-200">
                Chứng nhận GPP số 108/GPP-SYT
              </span>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-600">
              <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0" />
              CS1 - Nhà thuốc Trung Tâm: 128 Nguyễn Trãi, Quận Thanh Xuân, TP. Hà Nội
            </p>
            <p className="text-[11px] text-slate-400">
              Mọi đơn hàng trực tuyến đều được Dược sĩ chuyên môn kiểm duyệt tương tác thuốc & xuất
              lô FEFO trước khi giao.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="tel:18006868"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100"
            >
              <PhoneCall className="h-3.5 w-3.5 text-teal-600" />
              Gọi 1800-6868
            </a>
            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Cổng Dược Sĩ & Quản Trị ERP (:5173)
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
