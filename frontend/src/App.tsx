import React from 'react';
import { Toaster } from 'sonner';
import { Pill, ShieldCheck } from 'lucide-react';
import { ProductManagementPage } from './pages/ProductManagementPage';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Toaster position="top-right" richColors />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <Pill className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-extrabold tracking-tight text-slate-900">
                Smart Pharmacy AI
              </span>
              <span className="ml-2 rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700 border border-teal-200">
                D18CNPM5
              </span>
              <p className="text-xs text-slate-500">
                Hệ thống Quản lý Nhà thuốc & Kinh doanh Dược phẩm Thông minh tích hợp AI
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 px-3.5 py-1.5 rounded-xl">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            <span>Dược sĩ: Nguyễn Văn Trung (23810310321)</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <ProductManagementPage />
      </main>
    </div>
  );
};

export default App;
