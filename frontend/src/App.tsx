import React, { useState } from 'react';
import { Toaster } from 'sonner';
import {
  Pill,
  ShieldCheck,
  Package,
  Receipt,
  MessageSquareHeart,
  UserCheck,
} from 'lucide-react';
import { ProductManagementPage } from './pages/ProductManagementPage';
import { InvoicePaymentPage } from './pages/InvoicePaymentPage';
import { ContactPage } from './pages/ContactPage';
import { AuthPage } from './pages/AuthPage';
import { UserProfile } from './types/forms';

type ActiveTab = 'PRODUCTS' | 'INVOICES' | 'CONTACT' | 'AUTH';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('PRODUCTS');
  const [currentUser, setCurrentUser] = useState<UserProfile | null>({
    UserID: 1,
    FullName: 'Nguyễn Văn Trung (Dược sĩ Trưởng)',
    Email: 'trung.d18cnpm5@epu.edu.vn',
    Role: 'ADMIN',
  });

  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ElementType }> = [
    { id: 'PRODUCTS', label: '1. Quản lý Thuốc (Product 11 CN)', icon: Package },
    { id: 'INVOICES', label: '2. Hóa đơn & Thanh toán VietQR', icon: Receipt },
    { id: 'CONTACT', label: '3. Liên hệ Tư vấn Dược sĩ', icon: MessageSquareHeart },
    { id: 'AUTH', label: '4. Đăng nhập / Đăng ký', icon: UserCheck },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Toaster position="top-right" richColors />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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

          {/* Menu Chuyển đổi các Form Nghiệp vụ */}
          <nav className="flex flex-wrap items-center gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="hidden xl:flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            <span>{currentUser ? currentUser.FullName : 'Khách vãng lai'}</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        {activeTab === 'PRODUCTS' && <ProductManagementPage />}
        {activeTab === 'INVOICES' && <InvoicePaymentPage />}
        {activeTab === 'CONTACT' && <ContactPage />}
        {activeTab === 'AUTH' && (
          <AuthPage
            currentUser={currentUser}
            onAuthSuccess={(user) => setCurrentUser(user)}
            onLogout={() => setCurrentUser(null)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
