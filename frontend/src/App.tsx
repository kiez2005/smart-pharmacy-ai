import React, { useState } from 'react';
import { Toaster } from 'sonner';
import {
  Package,
  Receipt,
  MessageSquare,
  User,
  ScanLine,
  Keyboard,
  X,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { ProductManagementPage } from './pages/ProductManagementPage';
import { InvoicePaymentPage } from './pages/InvoicePaymentPage';
import { ContactPage } from './pages/ContactPage';
import { AuthPage } from './pages/AuthPage';
import { AiPharmacyStudioPage } from './pages/AiPharmacyStudioPage';
import { UserProfile } from './types/forms';

type ActiveTab = 'PRODUCTS' | 'AI_STUDIO' | 'INVOICES' | 'CONTACT' | 'AUTH';

const SHORTCUT_ITEMS = [
  { key: 'Alt + N', desc: 'Mở cửa sổ thêm dược phẩm mới' },
  { key: 'Alt + S', desc: 'Lưu nhanh biểu mẫu đang mở' },
  { key: 'Alt + F', desc: 'Đưa con trỏ vào thanh tìm kiếm' },
  { key: 'Alt + E', desc: 'Chỉnh sửa dòng dược phẩm đang chọn' },
  { key: 'Alt + V', desc: 'Xem chi tiết dòng dược phẩm đang chọn' },
  { key: 'Alt + C', desc: 'Nhân bản 1 bản ghi đang chọn' },
  { key: 'Alt + D', desc: 'Nhân bản hàng loạt các mục đã đánh dấu' },
  { key: 'Alt + H', desc: 'Xóa các mục đã đánh dấu' },
  { key: 'Alt + I', desc: 'Nhập dữ liệu từ tệp (.xlsx, .json, .xml)' },
  { key: 'Alt + X', desc: 'Xuất nhanh danh mục ra Excel (.xlsx)' },
  { key: 'Alt + K', desc: 'Bật/tắt tùy chỉnh cột hiển thị' },
];

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('PRODUCTS');
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>({
    UserID: 1,
    FullName: 'DS. Nguyễn Văn Trung',
    Email: 'trung.d18cnpm5@epu.edu.vn',
    Role: 'ADMIN',
  });

  const navGroups: Array<{
    groupLabel: string;
    items: Array<{ id: ActiveTab; label: string; icon: React.ElementType }>;
  }> = [
    {
      groupLabel: 'Quản trị vận hành',
      items: [
        { id: 'PRODUCTS', label: 'Danh mục dược phẩm', icon: Package },
        { id: 'INVOICES', label: 'Bán hàng tại quầy (POS)', icon: Receipt },
      ],
    },
    {
      groupLabel: 'Lâm sàng & Chăm sóc',
      items: [
        { id: 'AI_STUDIO', label: 'Số hóa đơn thuốc & AI', icon: ScanLine },
        { id: 'CONTACT', label: 'Tư vấn khách hàng', icon: MessageSquare },
      ],
    },
    {
      groupLabel: 'Hệ thống',
      items: [{ id: 'AUTH', label: 'Tài khoản & Phân quyền', icon: User }],
    },
  ];

  const activeLabel =
    navGroups.flatMap((g) => g.items).find((i) => i.id === activeTab)?.label || '';

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 flex">
      <Toaster position="bottom-right" />

      {/* ENTERPRISE SIDEBAR (Chuẩn shadcn-admin) */}
      <aside className="hidden md:flex w-60 flex-col border-r border-zinc-200/80 bg-white shrink-0 select-none">
        {/* Brand Switcher */}
        <div className="h-14 flex items-center gap-2.5 border-b border-zinc-200/80 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-white">
            <Building2 className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[13px] font-semibold text-zinc-900 truncate">PharmaCore ERP</div>
            <div className="text-[11px] text-zinc-400 truncate">Hệ thống nhà thuốc chuẩn GPP</div>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.groupLabel} className="space-y-1">
              <div className="px-2.5 text-[11px] font-medium text-zinc-400">
                {group.groupLabel}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      isActive
                        ? 'bg-zinc-100 text-zinc-900'
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${isActive ? 'text-zinc-900' : 'text-zinc-400'}`}
                      strokeWidth={1.75}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-zinc-200/80 p-3 space-y-2">
          <button
            type="button"
            onClick={() => setShowShortcutsModal(true)}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Keyboard className="h-3.5 w-3.5" />
              <span>Phím tắt thao tác</span>
            </span>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              Alt
            </kbd>
          </button>

          <div className="flex items-center gap-2.5 rounded-md bg-zinc-50 px-2.5 py-2 border border-zinc-200/60">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700">
              NT
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-zinc-900 truncate">
                {currentUser ? currentUser.FullName : 'Chưa đăng nhập'}
              </div>
              <div className="text-[11px] text-zinc-400 truncate">Ca trực chính</div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT SHELL */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Slim Enterprise Topbar */}
        <header className="sticky top-0 z-20 h-14 border-b border-zinc-200/80 bg-white/90 backdrop-blur px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-zinc-400">PharmaCore</span>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-300" />
            <span className="font-medium text-zinc-900">{activeLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile Nav Selector */}
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as ActiveTab)}
              className="md:hidden h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-800"
            >
              {navGroups
                .flatMap((g) => g.items)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
            </select>

            <button
              type="button"
              onClick={() => setShowShortcutsModal(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              <Keyboard className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Phím tắt</span>
            </button>
          </div>
        </header>

        {/* Workspace Content */}
        <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">
          {activeTab === 'PRODUCTS' && <ProductManagementPage />}
          {activeTab === 'AI_STUDIO' && <AiPharmacyStudioPage />}
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

      {/* Modal Tra cứu Phím tắt Bàn phím */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-zinc-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-zinc-900">Tổ hợp phím tắt hệ thống</h3>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 divide-y divide-zinc-100 max-h-96 overflow-y-auto">
              {SHORTCUT_ITEMS.map((sc) => (
                <div key={sc.key} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-zinc-600">{sc.desc}</span>
                  <kbd className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs font-medium text-zinc-800">
                    {sc.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
